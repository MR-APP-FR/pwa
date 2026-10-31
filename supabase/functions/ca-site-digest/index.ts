import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  CA_MONTHLY_SITE_DIGEST_SCOPE,
  CA_MONTHLY_SITE_PROMPT_VERSION,
  CA_MONTHLY_SITE_DIGEST_SYSTEM,
  caMonthlySiteDigestUser,
  CA_YEARLY_SITE_DIGEST_SCOPE,
  CA_YEARLY_SITE_PROMPT_VERSION,
  CA_YEARLY_SITE_DIGEST_SYSTEM,
  caYearlySiteDigestUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Brief IA manège × mois ou année.
 * `?ensure=1&siteId=&month=YYYY-MM` ou `?ensure=1&siteId=&year=YYYY` (+ `regen=1`).
 */

const WEEKDAYS = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];
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

function pctDelta(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthLabelFr(year: number, month: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

async function loadSiteMonthSnapshot(
  supabase: SupabaseClient,
  siteId: number,
  year: number,
  month: number,
) {
  const paris = parisParts();
  const isPartial = year === paris.year && month === paris.month;
  const maxDay = isPartial ? paris.day : daysInMonth(year, month);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const { data: siteRow, error: siteErr } = await supabase
    .from("site")
    .select("id, name")
    .eq("id", siteId)
    .maybeSingle();
  if (siteErr) throw siteErr;
  if (!siteRow) throw new Error("site_not_found");
  const siteName =
    typeof siteRow.name === "string" && siteRow.name.trim()
      ? siteRow.name.trim()
      : `Site ${siteId}`;

  const [planningCur, dataCur, planningPrev, dataPrev, usersRes] =
    await Promise.all([
      supabase
        .from("planning")
        .select("day, user_id, double_id, closed")
        .eq("site_id", siteId)
        .eq("year", year)
        .eq("month", month),
      supabase
        .from("data")
        .select("day, total, cb, enfants")
        .eq("site_id", siteId)
        .eq("year", year)
        .eq("month", month)
        .lte("day", maxDay),
      supabase
        .from("planning")
        .select("day, closed")
        .eq("site_id", siteId)
        .eq("year", year - 1)
        .eq("month", month),
      supabase
        .from("data")
        .select("day, total")
        .eq("site_id", siteId)
        .eq("year", year - 1)
        .eq("month", month)
        .lte("day", maxDay),
      supabase.from("user").select("id, fullname").eq("actif", true),
    ]);

  if (planningCur.error) throw planningCur.error;
  if (dataCur.error) throw dataCur.error;

  const nameById = new Map<number, string>();
  for (const u of usersRes.data ?? []) {
    nameById.set(
      Number(u.id),
      typeof u.fullname === "string" && u.fullname.trim()
        ? u.fullname.trim()
        : `#${u.id}`,
    );
  }

  const planByDay = new Map(
    (planningCur.data ?? []).map((p) => [
      Number(p.day),
      {
        closed: p.closed === true,
        user_id: p.user_id != null ? Number(p.user_id) : null,
        double_id: p.double_id != null ? Number(p.double_id) : null,
      },
    ]),
  );
  const dataByDay = new Map(
    (dataCur.data ?? []).map((d) => [
      Number(d.day),
      {
        total: Number(d.total ?? 0),
        cb: Number(d.cb ?? 0),
        enfants: Number(d.enfants ?? 0),
      },
    ]),
  );

  const days: Array<{
    day: number;
    weekday: string;
    ca: number;
    cb: number;
    enfants: number;
    closed: boolean;
    teneur1: string | null;
    teneur2: string | null;
  }> = [];

  let ca = 0;
  let cb = 0;
  let enfants = 0;
  let daysWithCa = 0;
  let daysClosed = 0;
  const staffMap = new Map<number, { name: string; days: number; caSum: number }>();

  for (let day = 1; day <= maxDay; day++) {
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    const dow = (date.getUTCDay() + 6) % 7; // lundi=0
    const pl = planByDay.get(day);
    const da = dataByDay.get(day);
    const closed = pl?.closed === true;
    const total = da?.total ?? 0;
    if (closed) daysClosed += 1;
    if (total > 0) {
      ca += total;
      cb += da?.cb ?? 0;
      enfants += da?.enfants ?? 0;
      daysWithCa += 1;
    }
    for (const uid of [pl?.user_id, pl?.double_id]) {
      if (uid == null || closed) continue;
      const cur = staffMap.get(uid) ?? {
        name: nameById.get(uid) ?? `#${uid}`,
        days: 0,
        caSum: 0,
      };
      cur.days += 1;
      cur.caSum += total;
      staffMap.set(uid, cur);
    }
    days.push({
      day,
      weekday: WEEKDAYS[dow]!,
      ca: Math.round(total),
      cb: Math.round(da?.cb ?? 0),
      enfants: Math.round(da?.enfants ?? 0),
      closed,
      teneur1: pl?.user_id != null ? nameById.get(pl.user_id) ?? null : null,
      teneur2: pl?.double_id != null ? nameById.get(pl.double_id) ?? null : null,
    });
  }

  const caPrevYear = (dataPrev.data ?? []).reduce(
    (s, d) => s + Number(d.total ?? 0),
    0,
  );

  const staff = [...staffMap.values()]
    .map((s) => ({ ...s, caSum: Math.round(s.caSum) }))
    .sort((a, b) => b.caSum - a.caSum)
    .slice(0, 8);

  return {
    site: siteName,
    siteId,
    monthKey,
    monthLabel: monthLabelFr(year, month),
    isPartial,
    totals: {
      ca: Math.round(ca),
      cb: Math.round(cb),
      enfants: Math.round(enfants),
      daysWithCa,
      daysClosed,
      caPrevYear: Math.round(caPrevYear),
      evolutionPct: pctDelta(ca, caPrevYear),
    },
    days,
    staff,
  };
}

async function loadSiteYearSnapshot(
  supabase: SupabaseClient,
  siteId: number,
  focusYear: number,
) {
  const paris = parisParts();
  const isPartial = focusYear === paris.year;
  const years = [focusYear, focusYear - 1, focusYear - 2];

  const { data: siteRow, error: siteErr } = await supabase
    .from("site")
    .select("id, name")
    .eq("id", siteId)
    .maybeSingle();
  if (siteErr) throw siteErr;
  if (!siteRow) throw new Error("site_not_found");
  const siteName =
    typeof siteRow.name === "string" && siteRow.name.trim()
      ? siteRow.name.trim()
      : `Site ${siteId}`;

  const [dataRes, planningRes, usersRes] = await Promise.all([
    supabase
      .from("data")
      .select("year, month, day, total, cb, enfants")
      .eq("site_id", siteId)
      .in("year", years),
    supabase
      .from("planning")
      .select("year, month, day, user_id, double_id, closed")
      .eq("site_id", siteId)
      .eq("year", focusYear)
      .eq("closed", false),
    supabase.from("user").select("id, fullname").eq("actif", true),
  ]);
  if (dataRes.error) throw dataRes.error;
  if (planningRes.error) throw planningRes.error;

  const nameById = new Map<number, string>();
  for (const u of usersRes.data ?? []) {
    nameById.set(
      Number(u.id),
      typeof u.fullname === "string" && u.fullname.trim()
        ? u.fullname.trim()
        : `#${u.id}`,
    );
  }

  const monthAgg = new Map<string, number>();
  for (const row of dataRes.data ?? []) {
    const y = Number(row.year);
    const m = Number(row.month);
    if (isPartial && y === focusYear && m > paris.month) continue;
    const key = `${y}:${m}`;
    monthAgg.set(key, (monthAgg.get(key) ?? 0) + Number(row.total ?? 0));
  }

  const monthCa = (y: number, m: number) => monthAgg.get(`${y}:${m}`) ?? 0;

  const ytdMonths: number[] = [];
  for (let m = 1; m <= 12; m++) {
    if (monthCa(focusYear, m) > 0) ytdMonths.push(m);
  }
  if (ytdMonths.length === 0 && isPartial) {
    for (let m = 1; m <= paris.month; m++) ytdMonths.push(m);
  }

  const sumMonths = (y: number, months: number[]) =>
    months.reduce((a, m) => a + monthCa(y, m), 0);
  const yearTotal = (y: number) => {
    let t = 0;
    for (let m = 1; m <= 12; m++) t += monthCa(y, m);
    return t;
  };

  const kpis = years.map((y) => {
    const ytd = sumMonths(y, ytdMonths);
    return {
      year: y,
      ytd: Math.round(ytd),
      yearTotal: Math.round(yearTotal(y)),
      evolutionPct: pctDelta(ytd, sumMonths(y - 1, ytdMonths)),
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
  }).filter((r) => r.ca > 0 || r.caPrev > 0);

  // Staff année focus : jours planifiés + CA du jour
  const dataFocusByDay = new Map<string, number>();
  for (const row of dataRes.data ?? []) {
    if (Number(row.year) !== focusYear) continue;
    dataFocusByDay.set(
      `${row.month}:${row.day}`,
      Number(row.total ?? 0),
    );
  }
  const staffMap = new Map<number, { name: string; days: number; caSum: number }>();
  for (const p of planningRes.data ?? []) {
    const total = dataFocusByDay.get(`${p.month}:${p.day}`) ?? 0;
    for (const uid of [p.user_id, p.double_id]) {
      if (uid == null) continue;
      const id = Number(uid);
      const cur = staffMap.get(id) ?? {
        name: nameById.get(id) ?? `#${id}`,
        days: 0,
        caSum: 0,
      };
      cur.days += 1;
      cur.caSum += total;
      staffMap.set(id, cur);
    }
  }
  const staffTop = [...staffMap.values()]
    .map((s) => ({ ...s, caSum: Math.round(s.caSum) }))
    .sort((a, b) => b.caSum - a.caSum)
    .slice(0, 6);

  return {
    site: siteName,
    siteId,
    focusYear,
    isPartial,
    throughMonth: isPartial ? paris.month : null,
    kpis,
    months,
    staffTop,
  };
}

async function runLlm(opts: {
  supabase: SupabaseClient;
  scope: string;
  scopeKey: string;
  promptVersion: number;
  system: string;
  user: string;
  forceRegen: boolean;
  payload: Record<string, unknown>;
  fallback: string;
}) {
  const inputHash = await sha256Hex(
    JSON.stringify({ user: opts.user, payload: opts.payload }),
  );
  if (!opts.forceRegen) {
    const cached = await findReadyInsight(opts.supabase, {
      scope: opts.scope,
      scopeKey: opts.scopeKey,
      inputHash,
      promptVersion: opts.promptVersion,
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
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      maxTokens: 1200,
      reasoningEffort: "low",
    });
    const row = await insertInsight(opts.supabase, {
      scope: opts.scope,
      scopeKey: opts.scopeKey,
      inputHash,
      promptVersion: opts.promptVersion,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: opts.payload,
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
    try {
      const row = await insertInsight(opts.supabase, {
        scope: opts.scope,
        scopeKey: opts.scopeKey,
        inputHash,
        promptVersion: opts.promptVersion,
        content: opts.fallback,
        model: null,
        status: "error",
        payload: opts.payload,
        error: msg.slice(0, 500),
      });
      return {
        corps: opts.fallback,
        model: null,
        error: msg.slice(0, 300),
        insightId: row.id,
        cached: false,
      };
    } catch {
      return {
        corps: opts.fallback,
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
  const siteId = Number(url.searchParams.get("siteId"));
  const monthParam = url.searchParams.get("month");
  const yearParam = url.searchParams.get("year");

  if (!Number.isFinite(siteId) || siteId <= 0) {
    return Response.json({ ok: false, error: "siteId_required" }, { status: 400 });
  }

  let periodMode: "month" | "year";
  let year: number;
  let month: number | null = null;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    periodMode = "month";
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m;
  } else if (yearParam && /^\d{4}$/.test(yearParam)) {
    periodMode = "year";
    year = Number(yearParam);
  } else {
    return Response.json(
      { ok: false, error: "month_or_year_required" },
      { status: 400 },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const scope =
    periodMode === "month"
      ? CA_MONTHLY_SITE_DIGEST_SCOPE
      : CA_YEARLY_SITE_DIGEST_SCOPE;
  const scopeKey =
    periodMode === "month"
      ? `${siteId}:${year}-${String(month).padStart(2, "0")}`
      : `${siteId}:${year}`;

  if (ensure && !regen) {
    const { data: existing } = await supabase
      .from("ai_insight")
      .select("id, content, model, status")
      .eq("scope", scope)
      .eq("scope_key", scopeKey)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.content) {
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        siteId,
        period: periodMode,
        scopeKey,
        insightId: existing.id,
        cached: true,
        corpsLength: String(existing.content).length,
      });
    }
  }

  try {
    if (periodMode === "month" && month != null) {
      const snapshot = await loadSiteMonthSnapshot(supabase, siteId, year, month);
      const digest = await runLlm({
        supabase,
        scope,
        scopeKey,
        promptVersion: CA_MONTHLY_SITE_PROMPT_VERSION,
        system: CA_MONTHLY_SITE_DIGEST_SYSTEM,
        user: caMonthlySiteDigestUser(
          snapshot.site,
          snapshot.monthLabel,
          snapshot.monthKey,
          JSON.stringify(snapshot),
        ),
        forceRegen: regen,
        payload: {
          siteId,
          monthKey: snapshot.monthKey,
          totals: snapshot.totals,
        },
        fallback: [
          `${snapshot.site} · ${snapshot.monthLabel} : ${snapshot.totals.ca.toLocaleString("fr-FR")} €.`,
          "(Brief IA indisponible.)",
        ].join("\n"),
      });
      return Response.json({
        ok: true,
        siteId,
        period: "month",
        scopeKey,
        site: snapshot.site,
        aiModel: digest.model,
        aiError: digest.error,
        insightId: digest.insightId,
        cached: digest.cached,
        corpsLength: digest.corps.length,
      });
    }

    const snapshot = await loadSiteYearSnapshot(supabase, siteId, year);
    const focus = snapshot.kpis.find((k) => k.year === year);
    const digest = await runLlm({
      supabase,
      scope,
      scopeKey,
      promptVersion: CA_YEARLY_SITE_PROMPT_VERSION,
      system: CA_YEARLY_SITE_DIGEST_SYSTEM,
      user: caYearlySiteDigestUser(
        snapshot.site,
        year,
        JSON.stringify(snapshot),
      ),
      forceRegen: regen,
      payload: {
        siteId,
        focusYear: year,
        kpis: snapshot.kpis,
      },
      fallback: [
        `${snapshot.site} · ${year}${snapshot.isPartial ? " (à date)" : ""} : ${(focus?.ytd ?? 0).toLocaleString("fr-FR")} €.`,
        "(Brief IA indisponible.)",
      ].join("\n"),
    });
    return Response.json({
      ok: true,
      siteId,
      period: "year",
      scopeKey,
      site: snapshot.site,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        siteId,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
});
