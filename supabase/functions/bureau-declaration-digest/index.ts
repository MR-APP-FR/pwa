import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  BUREAU_DECLARATION_MONTHLY_SCOPE,
  BUREAU_DECLARATION_MONTHLY_PROMPT_VERSION,
  BUREAU_DECLARATION_MONTHLY_SYSTEM,
  CA_DIGEST_DETAIL_MARKER,
  bureauDeclarationMonthlyUser,
  staffCategoryLabelFr,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Qui relancer pour la déclaration mensuelle → `ai_insight` + enrich message Bureau.
 */

const PAGE = 1000;

function parisParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: Number(pick("year")), month: Number(pick("month")) };
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

async function loadSnapshot(
  supabase: SupabaseClient,
  year: number,
  month: number,
) {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const plannedDays = new Map<number, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("planning")
      .select("user_id, double_id")
      .eq("year", year)
      .eq("month", month)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
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

  const userIds = [...plannedDays.keys()];
  const infoByUser = new Map<
    number,
    { onoff: boolean | null; declaree: boolean | null; fullname: string }
  >();
  const nameById = new Map<number, string>();

  for (let i = 0; i < userIds.length; i += 200) {
    const chunk = userIds.slice(i, i + 200);
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
      infoByUser.set(id, {
        onoff: info.onoff as boolean | null,
        declaree: info.declaree as boolean | null,
        fullname: nameById.get(id)!,
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

  let declared = 0;
  const candidates: Array<{
    name: string;
    categoryLabel: string;
    plannedDays: number;
    categoryKey: string | null;
  }> = [];

  for (const id of userIds) {
    if (!nameById.has(id)) continue;
    const info = infoByUser.get(id);
    const isDeclared = !info || info.onoff !== false || info.declaree === true;
    if (isDeclared) {
      declared += 1;
      continue;
    }
    const categoryKey = catByUser.get(id) ?? null;
    candidates.push({
      name: nameById.get(id)!,
      categoryLabel: staffCategoryLabelFr(categoryKey),
      plannedDays: plannedDays.get(id) ?? 0,
      categoryKey,
    });
  }

  const catRank: Record<string, number> = {
    super: 5,
    bon: 4,
    normal: 3,
    bof: 2,
    separer: 1,
  };
  candidates.sort((a, b) => {
    const ra = catRank[a.categoryKey ?? ""] ?? 0;
    const rb = catRank[b.categoryKey ?? ""] ?? 0;
    if (rb !== ra) return rb - ra;
    return b.plannedDays - a.plannedDays;
  });

  const planned = userIds.filter((id) => nameById.has(id)).length;
  return {
    monthKey,
    label: monthLabel(year, month),
    rates: {
      planned,
      declared,
      pct: planned === 0 ? 0 : Math.round((declared / planned) * 100),
    },
    candidates: candidates.slice(0, 25).map(({ name, categoryLabel, plannedDays }) => ({
      name,
      categoryLabel,
      plannedDays,
    })),
  };
}

function digestResume(corps: string): string {
  const idx = corps.indexOf(CA_DIGEST_DETAIL_MARKER);
  const head = (idx >= 0 ? corps.slice(0, idx) : corps).trim();
  return (
    head.split(/\n+/).map((l) => l.trim()).filter(Boolean)[0] ?? ""
  ).slice(0, 320);
}

async function buildDigest(
  supabase: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadSnapshot>>,
  forceRegen: boolean,
) {
  const inputHash = await sha256Hex(JSON.stringify(snapshot));
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: BUREAU_DECLARATION_MONTHLY_SCOPE,
      scopeKey: snapshot.monthKey,
      inputHash,
      promptVersion: BUREAU_DECLARATION_MONTHLY_PROMPT_VERSION,
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
      job: "sonnet",
      messages: [
        { role: "system", content: BUREAU_DECLARATION_MONTHLY_SYSTEM },
        {
          role: "user",
          content: bureauDeclarationMonthlyUser(
            snapshot.label,
            snapshot.monthKey,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 1000,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: BUREAU_DECLARATION_MONTHLY_SCOPE,
      scopeKey: snapshot.monthKey,
      inputHash,
      promptVersion: BUREAU_DECLARATION_MONTHLY_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: {
        rates: snapshot.rates,
        candidatesCount: snapshot.candidates.length,
      },
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
    const top = snapshot.candidates.slice(0, 5).map((c) => c.name).join(", ");
    const fallback = [
      `Taux ${snapshot.rates.pct} % (${snapshot.rates.declared}/${snapshot.rates.planned}). À relancer : ${top || "RAS"}.`,
      CA_DIGEST_DETAIL_MARKER,
      "**Priorité**",
      top ? `- ${top}` : "- RAS",
      "",
      "**Zones**",
      "RAS",
      "",
      "**Message**",
      "Tu peux passer en On ou cocher Déclarée sur ta fiche ?",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: BUREAU_DECLARATION_MONTHLY_SCOPE,
        scopeKey: snapshot.monthKey,
        inputHash,
        promptVersion: BUREAU_DECLARATION_MONTHLY_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { rates: snapshot.rates },
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

async function enrichDeclarationMessage(
  supabase: SupabaseClient,
  year: number,
  month: number,
  digestCorps: string,
  insightId: number | null,
  force: boolean,
) {
  const resume = digestResume(digestCorps);
  if (!resume) return { messageId: null as number | null, enriched: false };

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+01:00`;
  const nextMonth = month === 12
    ? `${year + 1}-01-01T00:00:00+01:00`
    : `${year}-${String(month + 1).padStart(2, "0")}-01T00:00:00+01:00`;

  const { data: rows } = await supabase
    .from("staff_message")
    .select("id, corps, meta")
    .eq("channel", "bureau")
    .eq("source", "appli")
    .in("titre", ["⚠️ Déclaration", "Taux de déclaration"])
    .gte("publie_at", monthStart)
    .lt("publie_at", nextMonth)
    .limit(1);
  const msg = rows?.[0];
  if (!msg?.id) return { messageId: null, enriched: false };

  const meta = (msg.meta ?? {}) as Record<string, unknown>;
  if (meta.ai_enriched === true && !force) {
    return { messageId: msg.id as number, enriched: false };
  }

  const raw = String(msg.corps ?? "");
  const stubLines = raw
    .split("\n")
    .filter((l) =>
      /^(📊|👤|✅|📅|💬)/.test(l.trim()) && !l.includes("💬 Relance IA")
    )
    .slice(0, 6);
  const stub = stubLines.length > 0 ? stubLines.join("\n") : raw.split("\n").slice(0, 6).join("\n");
  const corps = `${stub}\n\n💬 Relance IA : ${resume}`;

  await supabase
    .from("staff_message")
    .update({
      corps,
      meta: {
        ...meta,
        kind: "declaration_monthly",
        year,
        month,
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
  const monthOverride = url.searchParams.get("month");

  const paris = parisParts();
  let year = paris.year;
  let month = paris.month;
  if (monthOverride && /^\d{4}-\d{2}$/.test(monthOverride)) {
    const [y, m] = monthOverride.split("-").map(Number);
    year = y;
    month = m;
  }
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

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
      .eq("scope", BUREAU_DECLARATION_MONTHLY_SCOPE)
      .eq("scope_key", monthKey)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.content) {
      let enrich = { messageId: null as number | null, enriched: false };
      try {
        enrich = await enrichDeclarationMessage(
          supabase,
          year,
          month,
          String(existing.content),
          existing.id as number,
          false,
        );
      } catch { /* ignore */ }
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        monthKey,
        insightId: existing.id,
        cached: true,
        corpsLength: String(existing.content).length,
        messageId: enrich.messageId,
        messageEnriched: enrich.enriched,
      });
    }
  }

  try {
    const snapshot = await loadSnapshot(supabase, year, month);
    const digest = await buildDigest(supabase, snapshot, regen);
    let enrich = { messageId: null as number | null, enriched: false };
    if (digest.corps) {
      try {
        enrich = await enrichDeclarationMessage(
          supabase,
          year,
          month,
          digest.corps,
          digest.insightId,
          regen,
        );
      } catch { /* ignore */ }
    }
    return Response.json({
      ok: true,
      monthKey,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      candidatesCount: snapshot.candidates.length,
      rates: snapshot.rates,
      messageId: enrich.messageId,
      messageEnriched: enrich.enriched,
    });
  } catch (e) {
    return Response.json(
      { ok: false, monthKey, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
