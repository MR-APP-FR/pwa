import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  CA_STAFF_PERSON_DIGEST_SCOPE,
  CA_STAFF_PERSON_PROMPT_VERSION,
  CA_STAFF_PERSON_DIGEST_SYSTEM,
  caStaffPersonDigestUser,
  CLOSING_VISION_SEAU_SCOPE,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Analyse IA d'une personne (CA + ponctualité + seau) → `ai_insight`
 * (`ca_staff_person_digest`, scope_key `{userId}:{year}`).
 * CRM : lecture seule ; génération / regen via `?ensure=1&userId=&year=` (+ `regen=1`).
 */

const PAGE = 1000;

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parisParts(now = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    year: "numeric",
  });
  const parts = dtf.formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: Number(pick("year")) };
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

async function loadPersonSnapshot(
  supabase: SupabaseClient,
  userId: number,
  year: number,
) {
  const { data: userRow, error: userErr } = await supabase
    .from("user")
    .select("id, fullname, actif, role")
    .eq("id", userId)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!userRow) throw new Error("user_not_found");

  const name =
    typeof userRow.fullname === "string" && userRow.fullname.trim()
      ? userRow.fullname.trim()
      : `#${userId}`;

  const { data: scoreRows } = await supabase
    .from("staff_month_score")
    .select("month, pts_ca, pts_total, category, category_override")
    .eq("user_id", userId)
    .eq("year", year)
    .order("month", { ascending: false })
    .limit(1);
  const score = scoreRows?.[0] ?? null;
  const category = score?.category_override || score?.category || null;

  const planning = await fetchAll((from, to) =>
    supabase
      .from("planning")
      .select("site_id, month, day, user_id, double_id, closed")
      .eq("year", year)
      .or(`user_id.eq.${userId},double_id.eq.${userId}`)
      .order("month", { ascending: true })
      .order("day", { ascending: true })
      .range(from, to)
      .then((r) => ({ data: r.data, error: r.error })),
  );

  const plannedKeys: string[] = [];
  const siteIds = new Set<number>();
  for (const p of planning) {
    if (p.closed === true) continue;
    if (p.user_id !== userId && p.double_id !== userId) continue;
    const sid = Number(p.site_id);
    siteIds.add(sid);
    plannedKeys.push(`${sid}:${p.month}:${p.day}`);
  }
  const plannedSet = new Set(plannedKeys);

  const siteIdList = [...siteIds];
  const siteName = new Map<number, string>();
  if (siteIdList.length) {
    const { data: sites } = await supabase
      .from("site")
      .select("id, name")
      .in("id", siteIdList);
    for (const s of sites ?? []) {
      siteName.set(Number(s.id), (s.name as string)?.trim() || `Site ${s.id}`);
    }
  }

  const months = [...new Set(planning.map((p) => Number(p.month)))];
  let dataRows: Array<{
    site_id: number;
    month: number;
    day: number;
    total: number | null;
  }> = [];
  if (siteIdList.length && months.length) {
    dataRows = await fetchAll((from, to) =>
      supabase
        .from("data")
        .select("site_id, month, day, total")
        .eq("year", year)
        .in("site_id", siteIdList)
        .in("month", months)
        .order("month", { ascending: true })
        .order("day", { ascending: true })
        .range(from, to)
        .then((r) => ({ data: r.data, error: r.error })),
    );
  }

  const caBySite = new Map<number, { ca: number; days: number }>();
  let caSum = 0;
  let daysWithCa = 0;
  for (const d of dataRows) {
    const key = `${d.site_id}:${d.month}:${d.day}`;
    if (!plannedSet.has(key)) continue;
    const total = Number(d.total ?? 0);
    if (!(total > 0)) continue;
    caSum += total;
    daysWithCa += 1;
    const cur = caBySite.get(Number(d.site_id)) ?? { ca: 0, days: 0 };
    cur.ca += total;
    cur.days += 1;
    caBySite.set(Number(d.site_id), cur);
  }

  const sites = [...caBySite.entries()]
    .map(([siteId, v]) => ({
      site: siteName.get(siteId) ?? `Site ${siteId}`,
      ca: Math.round(v.ca),
      days: v.days,
    }))
    .sort((a, b) => b.ca - a.ca);

  const dateFrom = `${year}-01-01`;
  const dateTo = `${year}-12-31`;

  const { data: openings } = await supabase
    .from("opening_form")
    .select("site_id, date, submitted_at, chrono_seconds")
    .eq("user_id", userId)
    .gte("date", dateFrom)
    .lte("date", dateTo);

  const { data: lateAlerts } = await supabase
    .from("opening_late_alert")
    .select("site_id, date, reported_at")
    .eq("teneur_user_id", userId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .not("reported_at", "is", null);

  const lateDates = (lateAlerts ?? [])
    .slice(0, 8)
    .map((a) => ({
      date: a.date as string,
      site: siteName.get(Number(a.site_id)) ?? `Site ${a.site_id}`,
    }));

  const { data: closings } = await supabase
    .from("closing_form")
    .select(
      "site_id, date, submitted_at, force_early, force_geo_failed, nettoyage_fait, photo_seau_url",
    )
    .eq("user_id", userId)
    .gte("date", dateFrom)
    .lte("date", dateTo);

  const closingList = closings ?? [];
  const forceEarlyCount = closingList.filter((c) => c.force_early === true).length;
  const forceGeoFailedCount = closingList.filter((c) => c.force_geo_failed === true)
    .length;
  const nettoyageFaitCount = closingList.filter((c) => c.nettoyage_fait === true).length;

  const seauKeys = closingList
    .filter(
      (c) =>
        typeof c.photo_seau_url === "string" && c.photo_seau_url.trim() !== "",
    )
    .map((c) => `${c.site_id}:${c.date}`);

  let seauRows: Array<{
    scope_key: string;
    payload: { verdict?: string } | null;
  }> = [];
  if (seauKeys.length) {
    // PostgREST .in limite : chunks
    const uniq = [...new Set(seauKeys)];
    for (let i = 0; i < uniq.length; i += 80) {
      const chunk = uniq.slice(i, i + 80);
      const { data } = await supabase
        .from("ai_insight")
        .select("scope_key, payload, status, created_at")
        .eq("scope", CLOSING_VISION_SEAU_SCOPE)
        .in("scope_key", chunk)
        .eq("status", "ready")
        .order("created_at", { ascending: false });
      for (const row of data ?? []) {
        seauRows.push({
          scope_key: String(row.scope_key),
          payload: (row.payload ?? null) as { verdict?: string } | null,
        });
      }
    }
  }

  // Dédup dernière analyse par scope_key
  const seauBest = new Map<string, string>();
  for (const row of seauRows) {
    if (seauBest.has(row.scope_key)) continue;
    const v = row.payload?.verdict;
    if (v === "ok" || v === "suspect" || v === "fail") {
      seauBest.set(row.scope_key, v);
    }
  }

  let ok = 0;
  let suspect = 0;
  let fail = 0;
  const examples: Array<{ date: string; site: string; verdict: string }> = [];
  for (const [key, verdict] of seauBest) {
    if (verdict === "ok") ok += 1;
    else if (verdict === "suspect") suspect += 1;
    else if (verdict === "fail") fail += 1;
    if ((verdict === "fail" || verdict === "suspect") && examples.length < 5) {
      const [sid, date] = key.split(":");
      examples.push({
        date: date ?? key,
        site: siteName.get(Number(sid)) ?? `Site ${sid}`,
        verdict,
      });
    }
  }

  return {
    analyzedAtHint: new Date().toISOString(),
    person: {
      userId,
      name,
      year,
      category,
      pts_ca: score?.pts_ca != null ? Number(score.pts_ca) : null,
      pts_total: score?.pts_total != null ? Number(score.pts_total) : null,
      scoreMonth: score?.month != null ? Number(score.month) : null,
    },
    ca: {
      caSum: Math.round(caSum),
      daysPlanned: plannedSet.size,
      daysWithCa,
      sites: sites.slice(0, 12),
    },
    opening: {
      submittedCount: (openings ?? []).length,
      lateAlertCount: (lateAlerts ?? []).length,
      lateDates,
    },
    closing: {
      submittedCount: closingList.length,
      forceEarlyCount,
      forceGeoFailedCount,
      nettoyageFaitCount,
      withSeauPhoto: seauKeys.length,
    },
    seau: {
      analyzedCount: seauBest.size,
      ok,
      suspect,
      fail,
      examples,
    },
  };
}

function scopeKey(userId: number, year: number): string {
  return `${userId}:${year}`;
}

async function buildDigest(
  supabase: SupabaseClient,
  snapshot: Awaited<ReturnType<typeof loadPersonSnapshot>>,
  forceRegen: boolean,
) {
  const key = scopeKey(snapshot.person.userId, snapshot.person.year);
  const inputHash = await sha256Hex(JSON.stringify(snapshot));

  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: CA_STAFF_PERSON_DIGEST_SCOPE,
      scopeKey: key,
      inputHash,
      promptVersion: CA_STAFF_PERSON_PROMPT_VERSION,
    });
    if (cached) {
      return {
        corps: cached.content,
        model: cached.model,
        error: null as string | null,
        insightId: cached.id as number | null,
        cached: true,
        createdAt: null as string | null,
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
      createdAt: null,
    };
  }

  try {
    const result = await foundryChatCompletion({
      job: "sonnet",
      messages: [
        { role: "system", content: CA_STAFF_PERSON_DIGEST_SYSTEM },
        {
          role: "user",
          content: caStaffPersonDigestUser(
            snapshot.person.name,
            snapshot.person.year,
            JSON.stringify(snapshot),
          ),
        },
      ],
      maxTokens: 1200,
      reasoningEffort: "low",
    });

    const row = await insertInsight(supabase, {
      scope: CA_STAFF_PERSON_DIGEST_SCOPE,
      scopeKey: key,
      inputHash,
      promptVersion: CA_STAFF_PERSON_PROMPT_VERSION,
      content: result.content,
      model: result.model,
      status: "ready",
      payload: {
        person: snapshot.person,
        ca: snapshot.ca,
        opening: snapshot.opening,
        closing: snapshot.closing,
        seau: snapshot.seau,
        analyzedAt: new Date().toISOString(),
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
      createdAt: row.created_at ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fallback = [
      `Analyse ${snapshot.person.name} (${snapshot.person.year}).`,
      `CA : ${snapshot.ca.caSum.toLocaleString("fr-FR")} € · retards ouverture : ${snapshot.opening.lateAlertCount} · seau fail : ${snapshot.seau.fail}.`,
      "(Brief IA indisponible.)",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: CA_STAFF_PERSON_DIGEST_SCOPE,
        scopeKey: key,
        inputHash,
        promptVersion: CA_STAFF_PERSON_PROMPT_VERSION,
        content: fallback,
        model: null,
        status: "error",
        payload: { person: snapshot.person, analyzedAt: new Date().toISOString() },
        error: msg.slice(0, 500),
      });
      return {
        corps: fallback,
        model: null,
        error: msg.slice(0, 300),
        insightId: row.id,
        cached: false,
        createdAt: row.created_at ?? null,
      };
    } catch {
      return {
        corps: fallback,
        model: null,
        error: msg.slice(0, 300),
        insightId: null,
        cached: false,
        createdAt: null,
      };
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ensure = url.searchParams.get("ensure") === "1";
  const regen = url.searchParams.get("regen") === "1";
  const userIdRaw = url.searchParams.get("userId");
  const yearParam = url.searchParams.get("year");

  const userId = userIdRaw ? Number(userIdRaw) : NaN;
  if (!Number.isFinite(userId) || userId <= 0) {
    return Response.json({ ok: false, error: "userId_required" }, { status: 400 });
  }

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

  const key = scopeKey(userId, year);

  // ensure sans regen : renvoyer l'existant (ready/error) sans LLM
  if (ensure && !regen) {
    const { data: existingInsight } = await supabase
      .from("ai_insight")
      .select("id, content, model, status, created_at")
      .eq("scope", CA_STAFF_PERSON_DIGEST_SCOPE)
      .eq("scope_key", key)
      .in("status", ["ready", "error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingInsight?.content) {
      return Response.json({
        ok: true,
        skipped: "insight_ready",
        userId,
        year,
        insightId: existingInsight.id,
        cached: true,
        createdAt: existingInsight.created_at,
        corpsLength: String(existingInsight.content).length,
      });
    }
  }

  // regen : on génère toujours une nouvelle ligne (hash inclut analyzedAtHint)
  try {
    const snapshot = await loadPersonSnapshot(supabase, userId, year);
    const digest = await buildDigest(supabase, snapshot, regen || ensure);
    return Response.json({
      ok: true,
      userId,
      year,
      name: snapshot.person.name,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      createdAt: digest.createdAt,
      corpsLength: digest.corps.length,
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        userId,
        year,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
});
