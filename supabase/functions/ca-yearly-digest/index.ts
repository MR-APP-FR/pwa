import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  CA_YEARLY_DIGEST_SCOPE,
  CA_YEARLY_PROMPT_VERSION,
  CA_YEARLY_DIGEST_SYSTEM,
  caYearlyDigestUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Brief IA CA année → `ai_insight` (`ca_yearly_digest`, clé `YYYY`).
 * Aligné écran CRM Année : KPI cumul à date, courbe mois, top manèges.
 * CRM : `?ensure=1&year=YYYY` (+ `regen=1`).
 */

const PAGE = 1000;
const MONTH_LABELS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

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

function pctDelta(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

async function fetchAll<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

function isExcluded(statut: string | null): boolean {
  return statut === "automatique";
}

async function loadYearlySnapshot(supabase: SupabaseClient, focusYear: number) {
  const paris = parisParts();
  const isPartial = focusYear === paris.year;
  // Comme l'écran : fenêtre focus + 2 années avant pour KPI / courbe
  const years = [focusYear, focusYear - 1, focusYear - 2];

  const [sitesRes, dataRows] = await Promise.all([
    supabase.from("site").select("id, name, statut").order("id"),
    fetchAll((from, to) =>
      supabase
        .from("data")
        .select("site_id, year, month, total, cb, enfants")
        .in("year", years)
        .order("year", { ascending: true })
        .order("month", { ascending: true })
        .order("site_id", { ascending: true })
        .range(from, to)
        .then((r) => ({ data: r.data, error: r.error })),
    ),
  ]);
  if (sitesRes.error) throw sitesRes.error;

  const sites = (sitesRes.data ?? []).filter((s) => !isExcluded(s.statut as string | null));
  const siteIds = new Set(sites.map((s) => Number(s.id)));
  const siteName = new Map(
    sites.map((s) => [Number(s.id), (s.name as string)?.trim() || `Site ${s.id}`]),
  );

  // agg[year][month] = { total, cb, enfants }
  const parc = new Map<string, { total: number; cb: number; enfants: number }>();
  // siteYearMonth
  const siteYm = new Map<string, { total: number; cb: number }>();

  for (const row of dataRows) {
    const sid = Number(row.site_id);
    if (!siteIds.has(sid)) continue;
    const y = Number(row.year);
    const m = Number(row.month);
    const total = Number(row.total ?? 0);
    const cb = Number(row.cb ?? 0);
    const enfants = Number(row.enfants ?? 0);

    const pk = `${y}:${m}`;
    const p = parc.get(pk) ?? { total: 0, cb: 0, enfants: 0 };
    p.total += total;
    p.cb += cb;
    p.enfants += enfants;
    parc.set(pk, p);

    const sk = `${sid}:${y}:${m}`;
    const s = siteYm.get(sk) ?? { total: 0, cb: 0 };
    s.total += total;
    s.cb += cb;
    siteYm.set(sk, s);
  }

  const monthCa = (y: number, m: number) => parc.get(`${y}:${m}`)?.total ?? 0;

  // Mois « à date » : ceux avec CA sur focusYear (comme calculateYtdKpis)
  const ytdMonths: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if (monthCa(focusYear, m) > 0) ytdMonths.push(m);
  }
  if (ytdMonths.length === 0 && isPartial) {
    for (let m = 1; m <= paris.month; m++) ytdMonths.push(m);
  }

  const sumMonths = (y: number, months: number[]) =>
    months.reduce((acc, m) => acc + monthCa(y, m), 0);
  const yearTotal = (y: number) => {
    let t = 0;
    for (let m = 1; m <= 12; m++) t += monthCa(y, m);
    return t;
  };

  const kpis = years.map((y) => {
    const ytd = sumMonths(y, ytdMonths);
    const prevYtd = sumMonths(y - 1, ytdMonths);
    return {
      year: y,
      ytd: Math.round(ytd),
      yearTotal: Math.round(yearTotal(y)),
      evolutionPct: pctDelta(ytd, prevYtd),
    };
  });

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const ca = monthCa(focusYear, m);
    const caPrev = monthCa(focusYear - 1, m);
    return {
      month: m,
      label: MONTH_LABELS[i]!,
      ca: Math.round(ca),
      caPrev: Math.round(caPrev),
      evolutionPct: pctDelta(ca, caPrev),
    };
  }).filter((row) => row.ca > 0 || row.caPrev > 0);

  // Classement manèges (comme widget) : CA année + évolution mois communs
  type Shop = {
    site: string;
    ca: number;
    caPrev: number;
    evolutionPct: number | null;
    cbRate: number | null;
  };
  const shops: Shop[] = [];
  for (const s of sites) {
    const sid = Number(s.id);
    let ca = 0;
    let caPrev = 0;
    let cb = 0;
    let commonCur = 0;
    let commonPrev = 0;
    for (let m = 1; m <= 12; m++) {
      const cur = siteYm.get(`${sid}:${focusYear}:${m}`)?.total ?? 0;
      const prev = siteYm.get(`${sid}:${focusYear - 1}:${m}`)?.total ?? 0;
      const curCb = siteYm.get(`${sid}:${focusYear}:${m}`)?.cb ?? 0;
      ca += cur;
      caPrev += prev;
      cb += curCb;
      if (cur > 0 && prev > 0) {
        commonCur += cur;
        commonPrev += prev;
      }
    }
    if (ca <= 0 && caPrev <= 0) continue;
    if ((s.statut as string) !== "actif" && ca <= 0) continue;
    shops.push({
      site: siteName.get(sid)!,
      ca: Math.round(ca),
      caPrev: Math.round(caPrev),
      evolutionPct: pctDelta(commonCur, commonPrev),
      cbRate: ca > 0 ? Math.round((cb / ca) * 100) : null,
    });
  }

  const topByCa = [...shops].sort((a, b) => b.ca - a.ca).slice(0, 8);
  const withEvo = shops.filter((s) => s.evolutionPct != null);
  const topByEvolution = [...withEvo]
    .sort((a, b) => (b.evolutionPct ?? 0) - (a.evolutionPct ?? 0))
    .slice(0, 5);
  const bottomByEvolution = [...withEvo]
    .sort((a, b) => (a.evolutionPct ?? 0) - (b.evolutionPct ?? 0))
    .slice(0, 5);

  return {
    focusYear,
    isPartial,
    throughMonth: isPartial ? paris.month : null,
    kpis,
    months,
    topByCa,
    topByEvolution,
    bottomByEvolution,
  };
}

async function buildDigest(
  supabase: SupabaseClient,
  label: string,
  snapshot: Awaited<ReturnType<typeof loadYearlySnapshot>>,
  forceRegen: boolean,
) {
  const scopeKey = String(snapshot.focusYear);
  const inputHash = await sha256Hex(JSON.stringify(snapshot));

  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: CA_YEARLY_DIGEST_SCOPE,
      scopeKey,
      inputHash,
      promptVersion: CA_YEARLY_PROMPT_VERSION,
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
        { role: "system", content: CA_YEARLY_DIGEST_SYSTEM },
        {
          role: "user",
          content: caYearlyDigestUser(label, snapshot.focusYear, JSON.stringify(snapshot)),
        },
      ],
      maxTokens: 1400,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: CA_YEARLY_DIGEST_SCOPE,
      scopeKey,
      inputHash,
      promptVersion: CA_YEARLY_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: {
        focusYear: snapshot.focusYear,
        isPartial: snapshot.isPartial,
        kpis: snapshot.kpis,
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
    const focus = snapshot.kpis.find((k) => k.year === snapshot.focusYear);
    const fallback = [
      `CA ${snapshot.focusYear}${snapshot.isPartial ? " (à date)" : ""} : ${(focus?.ytd ?? 0).toLocaleString("fr-FR")} €` +
        (focus?.evolutionPct != null
          ? ` (${focus.evolutionPct >= 0 ? "+" : ""}${focus.evolutionPct} % vs même période l'an dernier).`
          : "."),
      "(Brief IA indisponible.)",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: CA_YEARLY_DIGEST_SCOPE,
        scopeKey,
        inputHash,
        promptVersion: CA_YEARLY_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { focusYear: snapshot.focusYear },
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
  const yearParam = url.searchParams.get("year");

  const paris = parisParts();
  const year =
    yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : paris.year;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const scopeKey = String(year);

  if (ensure && !regen) {
    const { data: existing } = await supabase
      .from("ai_insight")
      .select("id, content, model, status")
      .eq("scope", CA_YEARLY_DIGEST_SCOPE)
      .eq("scope_key", scopeKey)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.content) {
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        year,
        insightId: existing.id,
        cached: true,
        corpsLength: String(existing.content).length,
      });
    }
  }

  try {
    const snapshot = await loadYearlySnapshot(supabase, year);
    const digest = await buildDigest(
      supabase,
      String(year),
      snapshot,
      regen,
    );
    return Response.json({
      ok: true,
      year,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      isPartial: snapshot.isPartial,
    });
  } catch (e) {
    return Response.json(
      { ok: false, year, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
