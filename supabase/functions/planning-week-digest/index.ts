import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  PLANNING_WEEK_SUMMARY_SCOPE,
  PLANNING_WEEK_SUMMARY_PROMPT_VERSION,
  PLANNING_WEEK_SUMMARY_SYSTEM,
  planningWeekSummaryUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Trous planning semaine → `ai_insight` (`planning_week_summary`, clé = lundi).
 */

const PAGE = 1000;
const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function shiftDateIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Lundi ISO de la semaine contenant dateIso (semaine calendaire locale via UTC noon). */
function mondayOf(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = dt.getUTCDay(); // 0=dim
  const delta = dow === 0 ? -6 : 1 - dow;
  return shiftDateIso(dateIso, delta);
}

function parisTodayIso(): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date());
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

  const { data: sites } = await supabase
    .from("site")
    .select("id, name, statut, group_id")
    .eq("statut", "actif");
  const { data: groupes } = await supabase.from("groupe").select("id, name");
  const zoneName = new Map(
    (groupes ?? []).map((g) => [
      Number(g.id),
      (g.name as string)?.trim() || `Zone ${g.id}`,
    ]),
  );
  const siteMeta = new Map(
    (sites ?? []).map((s) => [
      Number(s.id),
      {
        name: (s.name as string)?.trim() || `Site ${s.id}`,
        zone: s.group_id != null
          ? zoneName.get(Number(s.group_id)) ?? null
          : null,
      },
    ]),
  );

  const planningRows: Array<{
    site_id: number;
    year: number;
    month: number;
    day: number;
    user_id: number | null;
    closed: boolean | null;
  }> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("planning")
      .select("site_id, year, month, day, user_id, closed")
      .in("year", years)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      const iso = `${r.year}-${String(r.month).padStart(2, "0")}-${String(r.day).padStart(2, "0")}`;
      if (!days.includes(iso)) continue;
      planningRows.push(r as typeof planningRows[number]);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  const byDaySite = new Map<string, (typeof planningRows)[number]>();
  for (const r of planningRows) {
    const iso = `${r.year}-${String(r.month).padStart(2, "0")}-${String(r.day).padStart(2, "0")}`;
    byDaySite.set(`${iso}:${r.site_id}`, r);
  }

  const holes: Array<{ day: string; site: string; zone: string | null }> = [];
  let closedCount = 0;
  for (let i = 0; i < 7; i++) {
    const iso = days[i];
    const dayName = DAY_NAMES[i];
    for (const [sid, meta] of siteMeta) {
      const row = byDaySite.get(`${iso}:${sid}`);
      if (row?.closed === true) {
        closedCount += 1;
        continue;
      }
      if (row?.user_id != null) continue;
      holes.push({ day: dayName, site: meta.name, zone: meta.zone });
    }
  }

  // Dispos oui non planifiés (semaine)
  const { data: avail } = await supabase
    .from("availability")
    .select("user_id, date, available")
    .gte("date", weekStart)
    .lte("date", days[6])
    .eq("available", true)
    .limit(2000);

  const plannedUsers = new Set<number>();
  for (const r of planningRows) {
    if (r.user_id != null) plannedUsers.add(Number(r.user_id));
  }

  const availByUser = new Map<number, number>();
  for (const a of avail ?? []) {
    const uid = Number(a.user_id);
    if (plannedUsers.has(uid)) continue;
    availByUser.set(uid, (availByUser.get(uid) ?? 0) + 1);
  }

  const topAvailIds = [...availByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id]) => id);

  const nameById = new Map<number, string>();
  if (topAvailIds.length > 0) {
    const { data: users } = await supabase
      .from("user")
      .select("id, fullname, actif, role")
      .in("id", topAvailIds);
    for (const u of users ?? []) {
      if (u.actif === false || u.role === "maintenance") continue;
      nameById.set(Number(u.id), (u.fullname as string)?.trim() || `#${u.id}`);
    }
  }

  const unplannedAvailable = topAvailIds
    .filter((id) => nameById.has(id))
    .map((id) => ({
      name: nameById.get(id)!,
      days: availByUser.get(id) ?? 0,
    }));

  // Grouper trous par jour pour le snapshot compact
  const holesByDay = new Map<string, number>();
  for (const h of holes) {
    holesByDay.set(h.day, (holesByDay.get(h.day) ?? 0) + 1);
  }

  return {
    weekStart,
    label: weekLabel(weekStart),
    holes: holes.slice(0, 40),
    holesByDay: Object.fromEntries(holesByDay),
    unplannedAvailable,
    counts: {
      holes: holes.length,
      closed: closedCount,
      sites: siteMeta.size,
    },
  };
}

async function buildDigest(
  supabase: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  forceRegen: boolean,
) {
  const inputHash = await sha256Hex(JSON.stringify(snapshot));
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: PLANNING_WEEK_SUMMARY_SCOPE,
      scopeKey: snapshot.weekStart,
      inputHash,
      promptVersion: PLANNING_WEEK_SUMMARY_PROMPT_VERSION,
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
    const result = await foundryChatCompletion({
      job: "haiku",
      messages: [
        { role: "system", content: PLANNING_WEEK_SUMMARY_SYSTEM },
        {
          role: "user",
          content: planningWeekSummaryUser(
            snapshot.label,
            snapshot.weekStart,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 900,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: PLANNING_WEEK_SUMMARY_SCOPE,
      scopeKey: snapshot.weekStart,
      inputHash,
      promptVersion: PLANNING_WEEK_SUMMARY_PROMPT_VERSION,
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
    const fallback = [
      `Semaine ${snapshot.label} : ${snapshot.counts.holes} case(s) teneur vide(s).`,
      "<<<DETAIL>>>",
      "**Trous**",
      Object.entries(snapshot.holesByDay)
        .map(([d, n]) => `${d} : ${n}`)
        .join(" · ") || "RAS",
      "",
      "**Ressources**",
      snapshot.unplannedAvailable.length
        ? snapshot.unplannedAvailable
          .slice(0, 5)
          .map((u) => u.name)
          .join(", ")
        : "RAS",
      "",
      "**À faire**",
      "- Lancer l'autofill ou compléter manuellement les zones les plus vides.",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: PLANNING_WEEK_SUMMARY_SCOPE,
        scopeKey: snapshot.weekStart,
        inputHash,
        promptVersion: PLANNING_WEEK_SUMMARY_PROMPT_VERSION,
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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ensure = url.searchParams.get("ensure") === "1";
  const regen = url.searchParams.get("regen") === "1";
  const weekOverride = url.searchParams.get("week");

  let weekStart: string;
  if (weekOverride && /^\d{4}-\d{2}-\d{2}$/.test(weekOverride)) {
    weekStart = mondayOf(weekOverride);
  } else {
    weekStart = mondayOf(parisTodayIso());
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (ensure && !regen) {
    const { data: existing } = await supabase
      .from("ai_insight")
      .select("id, content")
      .eq("scope", PLANNING_WEEK_SUMMARY_SCOPE)
      .eq("scope_key", weekStart)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.content) {
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        weekStart,
        insightId: existing.id,
        cached: true,
        corpsLength: String(existing.content).length,
      });
    }
  }

  try {
    const snapshot = await loadSnapshot(supabase, weekStart);
    const digest = await buildDigest(supabase, snapshot, regen);
    return Response.json({
      ok: true,
      weekStart,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      counts: snapshot.counts,
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
