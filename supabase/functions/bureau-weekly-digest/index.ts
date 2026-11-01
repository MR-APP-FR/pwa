import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  BUREAU_WEEKLY_DECLARATION_SCOPE,
  BUREAU_WEEKLY_DECLARATION_PROMPT_VERSION,
  BUREAU_WEEKLY_DECLARATION_SYSTEM,
  CA_DIGEST_DETAIL_MARKER,
  bureauWeeklyDeclarationUser,
  staffCategoryLabelFr,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Hebdo Bureau « qui déclarer » → `ai_insight` + enrich message `⚠️ Hebdo`.
 */

const PAGE = 1000;

function shiftDateIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function mondayOf(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = dt.getUTCDay();
  return shiftDateIso(dateIso, dow === 0 ? -6 : 1 - dow);
}

function parisTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekLabel(weekStart: string): string {
  const end = shiftDateIso(weekStart, 6);
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Paris",
    }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  };
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

async function loadSnapshot(supabase: SupabaseClient, weekStart: string) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDateIso(weekStart, i));
  const years = [...new Set(days.map((d) => Number(d.slice(0, 4))))];
  const month = Number(weekStart.slice(5, 7));
  const year = Number(weekStart.slice(0, 4));

  const plannedDays = new Map<number, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("planning")
      .select("user_id, double_id, year, month, day")
      .in("year", years)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const iso = `${row.year}-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}`;
      if (!days.includes(iso)) continue;
      for (const key of ["user_id", "double_id"] as const) {
        const id = Number(row[key]);
        if (Number.isFinite(id) && id > 0) {
          plannedDays.set(id, (plannedDays.get(id) ?? 0) + 1);
        }
      }
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const { data: avail } = await supabase
    .from("availability")
    .select("user_id, date, available")
    .gte("date", weekStart)
    .lte("date", days[6])
    .eq("available", true)
    .limit(2000);

  const availDays = new Map<number, number>();
  for (const a of avail ?? []) {
    const id = Number(a.user_id);
    availDays.set(id, (availDays.get(id) ?? 0) + 1);
  }

  const candidateIds = new Set<number>([
    ...plannedDays.keys(),
    ...availDays.keys(),
  ]);

  const nameById = new Map<number, string>();
  const infoById = new Map<
    number,
    { onoff: boolean | null; declaree: boolean | null }
  >();
  const ids = [...candidateIds];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data: users }, { data: infos }] = await Promise.all([
      supabase.from("user").select("id, fullname, role, actif").in("id", chunk),
      supabase
        .from("user_info")
        .select("user_id, onoff, declaree")
        .in("user_id", chunk),
    ]);
    for (const u of users ?? []) {
      if (u.role === "maintenance" || u.actif === false) continue;
      nameById.set(Number(u.id), (u.fullname as string)?.trim() || `#${u.id}`);
    }
    for (const info of infos ?? []) {
      const id = Number(info.user_id);
      if (!nameById.has(id)) continue;
      infoById.set(id, {
        onoff: info.onoff as boolean | null,
        declaree: info.declaree as boolean | null,
      });
    }
  }

  const { data: scores } = await supabase
    .from("staff_month_score")
    .select("user_id, category, category_override")
    .eq("year", year)
    .eq("month", month);
  const catByUser = new Map<number, string | null>();
  for (const s of scores ?? []) {
    catByUser.set(
      Number(s.user_id),
      (s.category_override as string) || (s.category as string) || null,
    );
  }

  type Cand = {
    name: string;
    categoryLabel: string;
    availableDays: number;
    plannedDays: number;
    motif: string;
    reasonKey: "off_et_dispos" | "off" | "dispos_non_planifiees";
  };
  const candidates: Cand[] = [];
  for (const id of nameById.keys()) {
    const info = infoById.get(id);
    const isOff = info?.onoff === false && info?.declaree !== true;
    const available = availDays.get(id) ?? 0;
    const planned = plannedDays.get(id) ?? 0;
    const underplanned = available >= 2 && planned === 0;
    if (!isOff && !underplanned) continue;
    const reasonKey = isOff
      ? underplanned
        ? "off_et_dispos"
        : "off"
      : "dispos_non_planifiees";
    const motif =
      reasonKey === "off_et_dispos"
        ? `Off non déclaré · ${available} jour(s) dispo / ${planned} planifié(s)`
        : reasonKey === "off"
        ? "Off non déclaré"
        : `dispos oui, peu planifié (${available} dispo / ${planned} planifié)`;
    candidates.push({
      name: nameById.get(id)!,
      categoryLabel: staffCategoryLabelFr(catByUser.get(id)),
      availableDays: available,
      plannedDays: planned,
      motif,
      reasonKey,
    });
  }

  const catRank: Record<string, number> = {
    Excellent: 5,
    Bon: 4,
    Normal: 3,
    Moyen: 2,
    "À remplacer": 1,
  };
  candidates.sort((a, b) => {
    if (a.reasonKey !== b.reasonKey) {
      const order = { off_et_dispos: 0, off: 1, dispos_non_planifiees: 2 };
      return (order[a.reasonKey] ?? 9) - (order[b.reasonKey] ?? 9);
    }
    return (catRank[b.categoryLabel] ?? 0) - (catRank[a.categoryLabel] ?? 0);
  });

  return {
    weekStart,
    label: weekLabel(weekStart),
    candidates: candidates.slice(0, 25).map(
      ({ name, categoryLabel, availableDays, plannedDays, motif }) => ({
        name,
        categoryLabel,
        availableDays,
        plannedDays,
        motif,
      }),
    ),
    counts: {
      candidates: candidates.length,
      off: candidates.filter((c) => c.reasonKey !== "dispos_non_planifiees").length,
      underplanned: candidates.filter((c) => c.reasonKey === "dispos_non_planifiees")
        .length,
    },
  };
}

function digestResume(corps: string): string {
  const idx = corps.indexOf(CA_DIGEST_DETAIL_MARKER);
  const head = (idx >= 0 ? corps.slice(0, idx) : corps).trim();
  return (head.split(/\n+/).map((l) => l.trim()).filter(Boolean)[0] ?? "").slice(
    0,
    320,
  );
}

async function buildDigest(
  supabase: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  forceRegen: boolean,
) {
  const inputHash = await sha256Hex(JSON.stringify(snapshot));
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: BUREAU_WEEKLY_DECLARATION_SCOPE,
      scopeKey: snapshot.weekStart,
      inputHash,
      promptVersion: BUREAU_WEEKLY_DECLARATION_PROMPT_VERSION,
    });
    if (cached) {
      return {
        corps: cached.content,
        model: cached.model,
        error: null as string | null,
        insightId: cached.id as number | null,
        cached: true,
      };
    }
  }
  if (!foundryConfig()) {
    return {
      corps: "",
      model: null,
      error: "llm_not_configured",
      insightId: null,
      cached: false,
    };
  }
  try {
    const slim = {
      ...snapshot,
      candidates: snapshot.candidates.slice(0, 15),
    };
    const result = await foundryChatCompletion({
      job: "haiku",
      messages: [
        { role: "system", content: BUREAU_WEEKLY_DECLARATION_SYSTEM },
        {
          role: "user",
          content: bureauWeeklyDeclarationUser(
            slim.label,
            slim.weekStart,
            JSON.stringify(slim),
          ),
        },
      ],
      maxTokens: 1200,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: BUREAU_WEEKLY_DECLARATION_SCOPE,
      scopeKey: snapshot.weekStart,
      inputHash,
      promptVersion: BUREAU_WEEKLY_DECLARATION_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: { counts: snapshot.counts },
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
    });
    return {
      corps: result.content,
      model: result.model,
      error: null,
      insightId: row.id,
      cached: false,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const topLines = snapshot.candidates
      .slice(0, 6)
      .map((c) => `⚠️ ${c.name} · ${c.motif}`);
    const under = snapshot.candidates
      .filter((c) => c.motif.includes("peu planifié"))
      .slice(0, 3)
      .map((c) => `${c.name} : ${c.availableDays} dispo / ${c.plannedDays} planifié`)
      .join(" · ");
    const first = snapshot.candidates[0];
    const fallback = [
      `Hebdo ${snapshot.label} : ${snapshot.counts.candidates} personne(s) à relancer (Off non déclaré ou dispos peu utilisées).`,
      CA_DIGEST_DETAIL_MARKER,
      "**Priorité**",
      ...(topLines.length ? topLines : ["- RAS"]),
      "",
      "**Dispos**",
      under || "RAS",
      "",
      "**Message**",
      first
        ? `${first.name.split(/\s+/)[0]}, peux-tu confirmer ta déclaration On/Off pour la semaine ${snapshot.label} ?`
        : "Tu peux confirmer ta déclaration On/Off cette semaine ?",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: BUREAU_WEEKLY_DECLARATION_SCOPE,
        scopeKey: snapshot.weekStart,
        inputHash,
        promptVersion: BUREAU_WEEKLY_DECLARATION_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { counts: snapshot.counts },
        error: msg.slice(0, 500),
      });
      return {
        corps: fallback,
        model: null,
        error: msg.slice(0, 300),
        insightId: row.id,
        cached: false,
      };
    } catch {
      return {
        corps: fallback,
        model: null,
        error: msg.slice(0, 300),
        insightId: null,
        cached: false,
      };
    }
  }
}

async function enrichHebdoMessage(
  supabase: SupabaseClient,
  weekStart: string,
  digestCorps: string,
  insightId: number | null,
  force: boolean,
) {
  const resume = digestResume(digestCorps);
  if (!resume) return { messageId: null as number | null, enriched: false };

  const weekEnd = shiftDateIso(weekStart, 7);
  const { data: rows } = await supabase
    .from("staff_message")
    .select("id, corps, meta")
    .eq("channel", "bureau")
    .eq("source", "appli")
    .eq("titre", "⚠️ Hebdo")
    .gte("publie_at", `${weekStart}T00:00:00+01:00`)
    .lt("publie_at", `${weekEnd}T00:00:00+01:00`)
    .limit(1);
  const msg = rows?.[0];
  if (!msg?.id) return { messageId: null, enriched: false };

  const meta = (msg.meta ?? {}) as Record<string, unknown>;
  if (meta.ai_enriched === true && !force) {
    return { messageId: msg.id as number, enriched: false };
  }

  const raw = String(msg.corps ?? "");
  const stub = raw
    .split("\n")
    .filter((l) => !l.includes("💬 Relance IA"))
    .slice(0, 4)
    .join("\n");
  const corps = `${stub}\n\n💬 Relance IA : ${resume}`;
  await supabase
    .from("staff_message")
    .update({
      corps,
      meta: {
        ...meta,
        kind: "weekly_declaration",
        week_start: weekStart,
        insight_id: insightId,
        ai_enriched: true,
      },
    })
    .eq("id", msg.id);
  return { messageId: msg.id as number, enriched: true };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ensure = url.searchParams.get("ensure") === "1";
  const regen = url.searchParams.get("regen") === "1";
  const weekOverride = url.searchParams.get("week");
  const weekStart =
    weekOverride && /^\d{4}-\d{2}-\d{2}$/.test(weekOverride)
      ? mondayOf(weekOverride)
      : mondayOf(parisTodayIso());

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const snapshot = await loadSnapshot(supabase, weekStart);
    const digest = await buildDigest(supabase, snapshot, regen);
    let enrich = { messageId: null as number | null, enriched: false };
    if (digest.corps) {
      try {
        enrich = await enrichHebdoMessage(
          supabase,
          weekStart,
          digest.corps,
          digest.insightId,
          regen,
        );
      } catch { /* ignore */ }
    }
    return Response.json({
      ok: true,
      weekStart,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached && !regen && ensure,
      corpsLength: digest.corps.length,
      counts: snapshot.counts,
      messageId: enrich.messageId,
      messageEnriched: enrich.enriched,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        weekStart,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
});
