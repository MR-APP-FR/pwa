import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  CA_DAILY_DIGEST_SCOPE,
  CA_DAILY_PROMPT_VERSION,
  CA_DAILY_DIGEST_SYSTEM,
  caDailyDigestUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * 21h Paris : message canal CA + brief narratif IA (intérim gpt5-mini).
 * Snapshot = données type écran CRM CA Jour (+ 4 mêmes jours + staff).
 * pg_cron : ca-daily-pdf-utc19 + utc20 → internal.invoke_edge('ca-daily-pdf')
 * Secrets : SUPABASE_* + FOUNDRY_* (fallback corps vide si Foundry indispo).
 */

type SiteRow = { id: number; name: string | null; statut: string | null };
type DataRow = {
  site_id: number;
  total: number | null;
  cb: number | null;
  enfants: number | null;
  year?: number;
  month?: number;
  day?: number;
};
type BaselineRow = {
  site_id: number;
  expected_ca: number | null;
  expected_enfants: number | null;
};
type WeatherRow = {
  site_id: number;
  condition: string | null;
  crowd_level: string | null;
  temp_max: number | null;
};
type PlanningRow = {
  site_id: number;
  closed: boolean | null;
  user_id: number | null;
  double_id: number | null;
};
type UserRow = { id: number; fullname: string | null };

function ymdIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 4 mêmes jours de semaine précédents (comme tendances CA jour CRM). */
function sameWeekdaysLast4(year: number, month: number, day: number) {
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  const out: { weeksAgo: number; year: number; month: number; day: number; dateIso: string }[] =
    [];
  for (let w = 1; w <= 4; w++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - 7 * w);
    const yy = d.getUTCFullYear();
    const mm = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    out.push({ weeksAgo: w, year: yy, month: mm, day: dd, dateIso: ymdIso(yy, mm, dd) });
  }
  return out;
}

function parisParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    dateIso: `${pick("year")}-${pick("month")}-${pick("day")}`,
    hour: Number(pick("hour")),
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
  };
}

function formatFrDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function eur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

async function loadCaSnapshot(
  supabase: SupabaseClient,
  year: number,
  month: number,
  day: number,
  dateIso: string,
) {
  const prior = sameWeekdaysLast4(year, month, day);
  const orTrend = prior
    .map((p) => `and(year.eq.${p.year},month.eq.${p.month},day.eq.${p.day})`)
    .join(",");

  const [sitesRes, dataRes, baselineRes, weatherRes, planningRes, usersRes, trendDataRes] =
    await Promise.all([
      supabase.from("site").select("id, name, statut").eq("statut", "actif"),
      supabase
        .from("data")
        .select("site_id, total, cb, enfants")
        .eq("year", year)
        .eq("month", month)
        .eq("day", day),
      supabase
        .from("site_day_baseline")
        .select("site_id, expected_ca, expected_enfants")
        .eq("date", dateIso),
      supabase
        .from("site_weather")
        .select("site_id, condition, crowd_level, temp_max")
        .eq("date", dateIso),
      supabase
        .from("planning")
        .select("site_id, closed, user_id, double_id")
        .eq("year", year)
        .eq("month", month)
        .eq("day", day),
      supabase.from("user").select("id, fullname").eq("actif", true),
      orTrend
        ? supabase
            .from("data")
            .select("site_id, total, cb, enfants, year, month, day")
            .or(orTrend)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (sitesRes.error) throw sitesRes.error;
  if (dataRes.error) throw dataRes.error;

  const sites = (sitesRes.data ?? []) as SiteRow[];
  const nameByUser = new Map(
    ((usersRes.data as UserRow[] | null) ?? []).map((u) => [
      u.id,
      (u.fullname ?? `User ${u.id}`).trim(),
    ]),
  );
  const dataBy = new Map((dataRes.data as DataRow[] | null ?? []).map((r) => [r.site_id, r]));
  const baseBy = new Map(
    ((baselineRes.data as BaselineRow[] | null) ?? []).map((r) => [r.site_id, r]),
  );
  const weatherBy = new Map(
    ((weatherRes.data as WeatherRow[] | null) ?? []).map((r) => [r.site_id, r]),
  );
  const planningBy = new Map(
    ((planningRes.data as PlanningRow[] | null) ?? []).map((r) => [r.site_id, r]),
  );

  const trendBySiteDate = new Map<string, DataRow>();
  for (const r of (trendDataRes.data as DataRow[] | null) ?? []) {
    trendBySiteDate.set(`${r.site_id}:${r.year}-${r.month}-${r.day}`, r);
  }

  const siteRows = sites.map((s) => {
    const d = dataBy.get(s.id);
    const b = baseBy.get(s.id);
    const w = weatherBy.get(s.id);
    const p = planningBy.get(s.id);
    const total = d?.total != null ? Number(d.total) : null;
    const expected = b?.expected_ca != null ? Number(b.expected_ca) : null;
    const deltaPct =
      total != null && expected != null && expected > 0
        ? Math.round(((total - expected) / expected) * 100)
        : null;
    const teneur1Id = p?.user_id ?? null;
    const teneur2Id = p?.double_id ?? null;
    const last4 = prior.map((pd) => {
      const tr = trendBySiteDate.get(`${s.id}:${pd.year}-${pd.month}-${pd.day}`);
      return {
        weeksAgo: pd.weeksAgo,
        date: pd.dateIso,
        ca: tr?.total != null ? Number(tr.total) : null,
      };
    });
    return {
      siteId: s.id,
      site: s.name ?? `site ${s.id}`,
      total,
      expected,
      deltaPct,
      enfants: d?.enfants != null ? Number(d.enfants) : null,
      cb: d?.cb != null ? Number(d.cb) : null,
      closed: p?.closed === true,
      planned: p != null,
      weather: w?.condition ?? null,
      crowd: w?.crowd_level ?? null,
      tempMax: w?.temp_max != null ? Number(w.temp_max) : null,
      teneur1: teneur1Id != null ? nameByUser.get(teneur1Id) ?? `#${teneur1Id}` : null,
      teneur2: teneur2Id != null ? nameByUser.get(teneur2Id) ?? `#${teneur2Id}` : null,
      teneur1Id,
      teneur2Id,
      sameWeekdaysLast4: last4,
    };
  });

  const withCa = siteRows.filter((r) => r.total != null && r.total > 0);
  const sumTotal = withCa.reduce((s, r) => s + (r.total ?? 0), 0);
  const sumCb = withCa.reduce((s, r) => s + (r.cb ?? 0), 0);
  const sumEnfants = withCa.reduce((s, r) => s + (r.enfants ?? 0), 0);
  const sumExpected = siteRows
    .filter((r) => r.expected != null && !r.closed)
    .reduce((s, r) => s + (r.expected ?? 0), 0);
  const plannedOpen = siteRows.filter((r) => r.planned && !r.closed);
  const closedRows = siteRows.filter((r) => r.closed);
  const openRows = siteRows.filter((r) => !r.closed);
  /** Uniquement ouverts planifiés sans chiffre — un site fermé n'est PAS « sans CA ». */
  const missingCa = plannedOpen.filter((r) => r.total == null || r.total === 0);
  const parcDeltaPct =
    sumExpected > 0 ? Math.round(((sumTotal - sumExpected) / sumExpected) * 100) : null;

  const priorParc = prior.map((pd) => {
    let ca = 0;
    let n = 0;
    for (const s of sites) {
      const tr = trendBySiteDate.get(`${s.id}:${pd.year}-${pd.month}-${pd.day}`);
      if (tr?.total != null && Number(tr.total) > 0) {
        ca += Number(tr.total);
        n += 1;
      }
    }
    return { weeksAgo: pd.weeksAgo, date: pd.dateIso, caTotal: ca, sitesAvecCa: n };
  });

  type StaffAgg = {
    name: string;
    caSum: number;
    expectedSum: number;
    sitesCount: number;
    deltas: number[];
  };
  const staffMap = new Map<number, StaffAgg>();
  for (const r of siteRows) {
    if (r.closed || r.total == null) continue;
    for (const id of [r.teneur1Id, r.teneur2Id]) {
      if (id == null) continue;
      const cur = staffMap.get(id) ?? {
        name: nameByUser.get(id) ?? `#${id}`,
        caSum: 0,
        expectedSum: 0,
        sitesCount: 0,
        deltas: [],
      };
      cur.caSum += r.total ?? 0;
      cur.expectedSum += r.expected ?? 0;
      cur.sitesCount += 1;
      if (r.deltaPct != null) cur.deltas.push(r.deltaPct);
      staffMap.set(id, cur);
    }
  }
  const staff = [...staffMap.values()].map((s) => ({
    name: s.name,
    caSum: Math.round(s.caSum),
    sitesCount: s.sitesCount,
    deltaPctAvg:
      s.deltas.length > 0
        ? Math.round(s.deltas.reduce((a, b) => a + b, 0) / s.deltas.length)
        : s.expectedSum > 0
          ? Math.round(((s.caSum - s.expectedSum) / s.expectedSum) * 100)
          : null,
  }));

  return {
    dateIso,
    dataDescription: {
      parc: "Totaux du jour vs attendu + météo parc agrégée via sites",
      sites: "Lignes type tableau CA jour (CA, CB, enfants, attendu, delta%, staff, météo)",
      trends: "4 mêmes jours de semaine précédents (CA parc + par site)",
      staff: "Agrégat teneurs du jour (CA, delta% moyen, nb sites)",
    },
    parc: {
      sitesActifs: sites.length,
      caTotal: sumTotal,
      cbTotal: sumCb,
      enfantsTotal: sumEnfants,
      expectedTotal: sumExpected || null,
      deltaPct: parcDeltaPct,
      sitesAvecCa: withCa.length,
      sitesPlanifiesOuverts: plannedOpen.length,
      /** Planifiés ouverts sans ligne data / CA 0 — à surveiller. */
      sitesSansCa: missingCa.map((r) => r.site),
      /** planning.closed = true : CA 0 normal, ne jamais traiter comme « pas de CA ». */
      sitesFermes: closedRows.map((r) => r.site),
    },
    /** Sites ouverts seulement (fermés exclus du ranking CA). */
    sites: openRows.map((r) => ({
      site: r.site,
      ca: r.total,
      cb: r.cb,
      enfants: r.enfants,
      attendu: r.expected,
      deltaPct: r.deltaPct,
      weather: r.weather,
      crowd: r.crowd,
      tempMax: r.tempMax,
      planned: r.planned,
      teneur1: r.teneur1,
      teneur2: r.teneur2,
      sameWeekdaysLast4: r.sameWeekdaysLast4,
    })),
    trends: { sameWeekdaysLast4: priorParc },
    staff,
  };
}

async function buildDigest(
  supabase: SupabaseClient,
  label: string,
  snapshot: Awaited<ReturnType<typeof loadCaSnapshot>>,
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
      scope: CA_DAILY_DIGEST_SCOPE,
      scopeKey: snapshot.dateIso,
      inputHash,
      promptVersion: CA_DAILY_PROMPT_VERSION,
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
        { role: "system", content: CA_DAILY_DIGEST_SYSTEM },
        {
          role: "user",
          content: caDailyDigestUser(label, snapshot.dateIso, JSON.stringify(snapshot)),
        },
      ],
      maxTokens: 1400,
      reasoningEffort: "low",
    });
    try {
      const row = await insertInsight(supabase, {
        scope: CA_DAILY_DIGEST_SCOPE,
        scopeKey: snapshot.dateIso,
        inputHash,
        promptVersion: CA_DAILY_PROMPT_VERSION,
        content: result.content,
        model: result.model,
        status: "ready",
        payload: {
          parc: snapshot.parc,
          sitesCount: snapshot.sites.length,
          staffCount: snapshot.staff.length,
          trends: snapshot.trends,
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
      // Unique (scope, scope_key, input_hash, prompt_version) → reuse
      const existing = await findReadyInsight(supabase, {
        scope: CA_DAILY_DIGEST_SCOPE,
        scopeKey: snapshot.dateIso,
        inputHash,
        promptVersion: CA_DAILY_PROMPT_VERSION,
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
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e && "message" in e
          ? String((e as { message: unknown }).message)
          : JSON.stringify(e);
    const p = snapshot.parc;
    const fallback = [
      `CA parc ${eur(p.caTotal)}` +
        (p.expectedTotal ? ` (attendu ~${eur(p.expectedTotal)})` : "") +
        `.`,
      p.sitesSansCa.length
        ? `Sans chiffre alors que planifiés : ${p.sitesSansCa.slice(0, 5).join(", ")}.`
        : `${p.sitesAvecCa} sites avec CA déclaré.`,
      "(Brief IA indisponible — PDF au clic.)",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: CA_DAILY_DIGEST_SCOPE,
        scopeKey: snapshot.dateIso,
        inputHash,
        promptVersion: CA_DAILY_PROMPT_VERSION,
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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  /** CRM on-demand : génère l'insight si absent, sans hour-gate ; n'écrase pas le message existant. */
  const ensure = url.searchParams.get("ensure") === "1";
  /** Régénère le LLM même si un insight ready existe pour le même input_hash. */
  const regen = url.searchParams.get("regen") === "1";
  const dateOverride = url.searchParams.get("date");

  const paris = parisParts();
  if (!force && !ensure && paris.hour !== 21) {
    return Response.json({ ok: true, skipped: "wrong_hour", hour: paris.hour });
  }

  const dateIso =
    dateOverride && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride)
      ? dateOverride
      : paris.dateIso;

  const [y, m, d] = dateIso.split("-").map(Number);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ensure : si un insight ready/error existe déjà pour la date → no-op LLM
  if (ensure && !regen) {
    const { data: existingInsight } = await supabase
      .from("ai_insight")
      .select("id, content, model, status")
      .eq("scope", CA_DAILY_DIGEST_SCOPE)
      .eq("scope_key", dateIso)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingInsight?.content) {
      return Response.json({
        ok: true,
        inserted: false,
        skipped: "insight_ready",
        dateIso,
        insightId: existingInsight.id,
        cached: true,
        corpsLength: String(existingInsight.content).length,
      });
    }
  }

  const { data: existing, error: lookupError } = await supabase
    .from("staff_message")
    .select("id")
    .eq("channel", "ca")
    .eq("source", "appli")
    .contains("meta", { kind: "ca_daily_pdf", date: dateIso })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return Response.json({ ok: false, error: lookupError.message }, { status: 500 });
  }
  // Cron normal : message déjà là → skip. ensure : on continue pour l'insight.
  if (existing && !force && !ensure) {
    return Response.json({ ok: true, inserted: false, skipped: "already_today", dateIso });
  }
  if (existing && force) {
    await supabase.from("staff_message").delete().eq("id", existing.id);
  }

  const label = formatFrDate(dateIso);
  const filename = `CA ${label}.pdf`;

  let snapshot: Awaited<ReturnType<typeof loadCaSnapshot>> | null = null;
  let digest: {
    corps: string;
    model: string | null;
    error: string | null;
    insightId: number | null;
    cached: boolean;
  } = {
    corps: "",
    model: null,
    error: null,
    insightId: null,
    cached: false,
  };
  try {
    snapshot = await loadCaSnapshot(supabase, y, m, d, dateIso);
    digest = await buildDigest(supabase, label, snapshot, regen);
  } catch (e) {
    digest = {
      corps: "",
      model: null,
      error: e instanceof Error ? e.message : String(e),
      insightId: null,
      cached: false,
    };
  }

  // ensure + message déjà présent : on ne retouche pas le canal CA
  if (ensure && existing && !force) {
    return Response.json({
      ok: true,
      inserted: false,
      skipped: "message_exists_insight_ensured",
      dateIso,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
    });
  }

  const { error: insertError } = await supabase.from("staff_message").insert({
    titre: "📈 CA du jour",
    corps: digest.corps,
    source: "appli",
    channel: "ca",
    auteur_uuid: null,
    site_ids: [],
    user_ids: [],
    require_ack: false,
    meta: {
      kind: "ca_daily_pdf",
      date: dateIso,
      filename,
      insight_id: digest.insightId,
      ai: {
        model: digest.model,
        error: digest.error,
        cached: digest.cached,
        parcCa: snapshot?.parc.caTotal ?? null,
      },
    },
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return Response.json({
        ok: true,
        inserted: false,
        skipped: "already_today",
        dateIso,
        insightId: digest.insightId,
        cached: digest.cached,
      });
    }
    return Response.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    inserted: true,
    dateIso,
    aiModel: digest.model,
    aiError: digest.error,
    insightId: digest.insightId,
    cached: digest.cached,
    corpsLength: digest.corps.length,
  });
});
