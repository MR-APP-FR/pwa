import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  CA_MONTHLY_DIGEST_SCOPE,
  CA_MONTHLY_PROMPT_VERSION,
  CA_MONTHLY_DIGEST_SYSTEM,
  CA_DIGEST_DETAIL_MARKER,
  caMonthlyDigestUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Brief IA CA mois → `ai_insight` (`ca_monthly_digest`).
 * CRM : ensure on view (`?ensure=1&month=YYYY-MM`).
 * Enrichit le message canal `ca_monthly_compare` (stub SQL) avec le résumé IA.
 */

type SiteRow = {
  id: number;
  name: string | null;
  statut: string | null;
  group_id: number | null;
};
type GroupeRow = { id: number; name: string | null };
type DataAgg = {
  site_id: number;
  year: number;
  month: number;
  total: number;
  cb: number;
  enfants: number;
};

function parisParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
  };
}

function monthLabelFr(year: number, month: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Mois en cours (pas dernier jour) → bornage 1…J comme CRM CA Mois. */
function throughDayFor(year: number, month: number): number | null {
  const p = parisParts();
  if (year !== p.year || month !== p.month) return null;
  if (p.day >= daysInMonth(year, month)) return null;
  return p.day;
}

function pctDelta(current: number, previous: number | null): number | null {
  if (previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function eur(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

function isExcludedFromCa(statut: string | null): boolean {
  return statut === "automatique";
}

function shouldIncludeSite(
  statut: string | null,
  total: number,
): boolean {
  if (isExcludedFromCa(statut)) return false;
  if (statut === "actif") return true;
  return total > 0;
}

async function loadMonthAggs(
  supabase: SupabaseClient,
  years: number[],
  month: number,
  maxDay: number | null,
): Promise<DataAgg[]> {
  // Uniquement le numéro de mois demandé (N / N-1 / N-2). Paginer (>1000 lignes).
  const pageSize = 1000;
  const map = new Map<string, DataAgg>();
  let from = 0;
  for (;;) {
    let q = supabase
      .from("data")
      .select("site_id, year, month, total, cb, enfants")
      .in("year", years)
      .eq("month", month)
      .order("site_id", { ascending: true })
      .order("year", { ascending: true })
      .order("day", { ascending: true })
      .range(from, from + pageSize - 1);
    if (maxDay != null) q = q.lte("day", maxDay);

    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const siteId = Number(row.site_id);
      const y = Number(row.year);
      const m = Number(row.month);
      const key = `${siteId}:${y}:${m}`;
      const cur = map.get(key) ?? {
        site_id: siteId,
        year: y,
        month: m,
        total: 0,
        cb: 0,
        enfants: 0,
      };
      cur.total += Number(row.total ?? 0);
      cur.cb += Number(row.cb ?? 0);
      cur.enfants += Number(row.enfants ?? 0);
      map.set(key, cur);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return [...map.values()];
}

async function loadMonthlySnapshot(
  supabase: SupabaseClient,
  year: number,
  month: number,
) {
  const throughDay = throughDayFor(year, month);
  const years = [year, year - 1, year - 2];

  const [sitesRes, groupesRes, aggs] = await Promise.all([
    supabase.from("site").select("id, name, statut, group_id").order("id"),
    supabase.from("groupe").select("id, name").order("id"),
    loadMonthAggs(supabase, years, month, throughDay),
  ]);

  if (sitesRes.error) throw sitesRes.error;
  if (groupesRes.error) throw groupesRes.error;

  const sites = (sitesRes.data ?? []) as SiteRow[];
  const groupes = (groupesRes.data ?? []) as GroupeRow[];
  const zoneName = new Map(
    groupes.map((g) => [g.id, g.name?.trim() || `Zone ${g.id}`]),
  );

  const bySiteYearMonth = new Map<string, DataAgg>();
  for (const a of aggs) {
    bySiteYearMonth.set(`${a.site_id}:${a.year}:${a.month}`, a);
  }

  const get = (siteId: number, y: number) =>
    bySiteYearMonth.get(`${siteId}:${y}:${month}`);

  type SiteOut = {
    site: string;
    zone: string | null;
    ca: number;
    caN1: number | null;
    deltaPctN1: number | null;
    cb: number;
    enfants: number;
  };

  const siteRows: SiteOut[] = [];
  for (const s of sites) {
    const cur = get(s.id, year);
    const total = cur?.total ?? 0;
    if (!shouldIncludeSite(s.statut, total)) continue;
    const n1 = get(s.id, year - 1)?.total ?? null;
    const n1Val = n1 != null && n1 > 0 ? n1 : null;
    siteRows.push({
      site: s.name?.trim() || `site ${s.id}`,
      zone: s.group_id != null ? zoneName.get(s.group_id) ?? null : null,
      ca: Math.round(total),
      caN1: n1Val != null ? Math.round(n1Val) : null,
      deltaPctN1: pctDelta(total, n1Val),
      cb: Math.round(cur?.cb ?? 0),
      enfants: Math.round(cur?.enfants ?? 0),
    });
  }

  // Totaux parc : somme des sites inclus (pas les automatiques)
  let caTotal = 0;
  let caN1 = 0;
  let caN2 = 0;
  let cbTotal = 0;
  let enfantsTotal = 0;
  let sitesAvecCa = 0;
  for (const s of sites) {
    if (isExcludedFromCa(s.statut)) continue;
    const cur = get(s.id, year);
    const total = cur?.total ?? 0;
    if (!shouldIncludeSite(s.statut, total) && total <= 0) continue;
    caTotal += total;
    caN1 += get(s.id, year - 1)?.total ?? 0;
    caN2 += get(s.id, year - 2)?.total ?? 0;
    cbTotal += cur?.cb ?? 0;
    enfantsTotal += cur?.enfants ?? 0;
    if (total > 0) sitesAvecCa += 1;
  }

  const zoneMap = new Map<
    string,
    { zone: string; ca: number; caN1: number }
  >();
  for (const r of siteRows) {
    const z = r.zone ?? "Sans zone";
    const cur = zoneMap.get(z) ?? { zone: z, ca: 0, caN1: 0 };
    cur.ca += r.ca;
    cur.caN1 += r.caN1 ?? 0;
    zoneMap.set(z, cur);
  }
  const zones = [...zoneMap.values()]
    .map((z) => ({
      zone: z.zone,
      ca: Math.round(z.ca),
      caN1: z.caN1 > 0 ? Math.round(z.caN1) : null,
      deltaPctN1: pctDelta(z.ca, z.caN1 > 0 ? z.caN1 : null),
    }))
    .sort((a, b) => b.ca - a.ca);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return {
    monthKey,
    year,
    month,
    throughDay,
    parc: {
      caTotal: Math.round(caTotal),
      caN1: Math.round(caN1),
      caN2: Math.round(caN2),
      deltaPctN1: pctDelta(caTotal, caN1 > 0 ? caN1 : null),
      deltaPctN2: pctDelta(caTotal, caN2 > 0 ? caN2 : null),
      cbTotal: Math.round(cbTotal),
      enfantsTotal: Math.round(enfantsTotal),
      sitesAvecCa,
      throughDay,
    },
    zones,
    sites: siteRows
      .filter((r) => r.ca > 0 || (r.caN1 != null && r.caN1 > 0))
      .sort((a, b) => b.ca - a.ca),
  };
}

async function buildDigest(
  supabase: SupabaseClient,
  label: string,
  snapshot: Awaited<ReturnType<typeof loadMonthlySnapshot>>,
  forceRegen: boolean,
): Promise<{
  corps: string;
  model: string | null;
  error: string | null;
  insightId: number | null;
  cached: boolean;
}> {
  const inputHash = await sha256Hex(JSON.stringify(snapshot));
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: CA_MONTHLY_DIGEST_SCOPE,
      scopeKey: snapshot.monthKey,
      inputHash,
      promptVersion: CA_MONTHLY_PROMPT_VERSION,
    });
    if (cached) {
      return {
        corps: cached.content,
        model: cached.model,
        error: null,
        insightId: cached.id,
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
        { role: "system", content: CA_MONTHLY_DIGEST_SYSTEM },
        {
          role: "user",
          content: caMonthlyDigestUser(
            label,
            snapshot.monthKey,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 1400,
      reasoningEffort: "low",
    });
    try {
      const row = await insertInsight(supabase, {
        scope: CA_MONTHLY_DIGEST_SCOPE,
        scopeKey: snapshot.monthKey,
        inputHash,
        promptVersion: CA_MONTHLY_PROMPT_VERSION,
        content: result.content,
        model: result.model,
        status: "ready",
        payload: {
          parc: snapshot.parc,
          zonesCount: snapshot.zones.length,
          sitesCount: snapshot.sites.length,
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
    } catch (insErr) {
      const existing = await findReadyInsight(supabase, {
        scope: CA_MONTHLY_DIGEST_SCOPE,
        scopeKey: snapshot.monthKey,
        inputHash,
        promptVersion: CA_MONTHLY_PROMPT_VERSION,
      });
      if (existing) {
        return {
          corps: existing.content,
          model: existing.model,
          error: null,
          insightId: existing.id,
          cached: true,
        };
      }
      throw insErr;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const p = snapshot.parc;
    const fallback = [
      `CA ${label} : ${eur(p.caTotal)}` +
        (p.deltaPctN1 != null
          ? ` (${p.deltaPctN1 >= 0 ? "+" : ""}${p.deltaPctN1} % vs même mois l'an dernier).`
          : "."),
      `${p.sitesAvecCa} sites avec CA.`,
      "(Brief IA indisponible.)",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: CA_MONTHLY_DIGEST_SCOPE,
        scopeKey: snapshot.monthKey,
        inputHash,
        promptVersion: CA_MONTHLY_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { parc: snapshot.parc },
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

function digestResume(corps: string): string {
  const idx = corps.indexOf(CA_DIGEST_DETAIL_MARKER);
  const head = (idx >= 0 ? corps.slice(0, idx) : corps).trim();
  // Première phrase / paragraphe pour le canal (corps compact)
  const first = head.split(/\n+/).map((l) => l.trim()).filter(Boolean)[0] ?? "";
  return first.slice(0, 320);
}

/** Stub SQL (4 lignes) + résumé IA. Idempotent via meta.ai_enriched. */
async function enrichMonthlyCompareMessage(
  supabase: SupabaseClient,
  year: number,
  month: number,
  digestCorps: string,
  insightId: number | null,
  force: boolean,
): Promise<{ messageId: number | null; enriched: boolean }> {
  const resume = digestResume(digestCorps);
  if (!resume) return { messageId: null, enriched: false };

  const { data: rows, error } = await supabase
    .from("staff_message")
    .select("id, corps, meta")
    .eq("channel", "ca")
    .eq("source", "appli")
    .filter("meta->>kind", "eq", "ca_monthly_compare")
    .filter("meta->>year", "eq", String(year))
    .filter("meta->>month", "eq", String(month))
    .limit(1);
  if (error) throw error;
  const msg = rows?.[0];
  if (!msg?.id) return { messageId: null, enriched: false };

  const meta = (msg.meta ?? {}) as Record<string, unknown>;
  if (meta.ai_enriched === true && !force) {
    return { messageId: msg.id as number, enriched: false };
  }

  const raw = String(msg.corps ?? "");
  const lines = raw.split("\n");
  const stubLines = lines
    .filter((l) =>
      /^(📅 Mois|💶 Total|📊 vs N-1|📊 vs N-2)/.test(l.trim())
    )
    .slice(0, 4);
  const stub =
    stubLines.length === 4
      ? stubLines.join("\n")
      : lines.slice(0, 4).join("\n");

  const corps = `${stub}\n\n💬 ${resume}`;
  const nextMeta = {
    ...meta,
    kind: "ca_monthly_compare",
    year,
    month,
    insight_id: insightId,
    ai_enriched: true,
  };

  const { error: updErr } = await supabase
    .from("staff_message")
    .update({ corps, meta: nextMeta })
    .eq("id", msg.id);
  if (updErr) throw updErr;
  return { messageId: msg.id as number, enriched: true };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ensure = url.searchParams.get("ensure") === "1";
  const regen = url.searchParams.get("regen") === "1";
  const monthOverride = url.searchParams.get("month");
  const enrichMessage = url.searchParams.get("enrich") !== "0";

  const paris = parisParts();
  let year = paris.year;
  let month = paris.month;
  if (monthOverride && /^\d{4}-\d{2}$/.test(monthOverride)) {
    const [y, m] = monthOverride.split("-").map(Number);
    year = y;
    month = m;
  } else if (!ensure) {
    // Cron éventuel : mois clos = mois précédent Paris
    const prev = new Date(Date.UTC(paris.year, paris.month - 2, 15));
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
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
    const { data: existingInsight } = await supabase
      .from("ai_insight")
      .select("id, content, model, status")
      .eq("scope", CA_MONTHLY_DIGEST_SCOPE)
      .eq("scope_key", monthKey)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingInsight?.content) {
      let enrich: { messageId: number | null; enriched: boolean } = {
        messageId: null,
        enriched: false,
      };
      if (enrichMessage) {
        try {
          enrich = await enrichMonthlyCompareMessage(
            supabase,
            year,
            month,
            String(existingInsight.content),
            existingInsight.id as number,
            false,
          );
        } catch {
          /* message absent ou erreur non bloquante */
        }
      }
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        monthKey,
        insightId: existingInsight.id,
        cached: true,
        corpsLength: String(existingInsight.content).length,
        messageId: enrich.messageId,
        messageEnriched: enrich.enriched,
      });
    }
  }

  const label = monthLabelFr(year, month);
  try {
    const snapshot = await loadMonthlySnapshot(supabase, year, month);
    const digest = await buildDigest(supabase, label, snapshot, regen);
    let enrich: { messageId: number | null; enriched: boolean } = {
      messageId: null,
      enriched: false,
    };
    if (enrichMessage && digest.corps) {
      try {
        enrich = await enrichMonthlyCompareMessage(
          supabase,
          year,
          month,
          digest.corps,
          digest.insightId,
          regen,
        );
      } catch {
        /* non bloquant */
      }
    }
    return Response.json({
      ok: true,
      monthKey,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      throughDay: snapshot.throughDay,
      messageId: enrich.messageId,
      messageEnriched: enrich.enriched,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        monthKey,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
});
