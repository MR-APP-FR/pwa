/**
 * Vision ouverture : photo justif nettoyage veille (si Non) → ai_insight.
 *
 * POST JSON :
 *   { site_id, date }     — 1 info-jour (appel PWA après submit)
 *   { date, force?: 1 }   — batch jour
 *
 * Secrets : FOUNDRY_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryConfig, foundryVisionCompletion } from "../_shared/foundry.ts";
import {
  OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
  OPENING_VISION_NETTOYAGE_SCOPE,
  OPENING_VISION_NETTOYAGE_SYSTEM,
  openingVisionNettoyageUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

const PHOTO_BUCKET = "telecollecte-photos";
const SCOPE = OPENING_VISION_NETTOYAGE_SCOPE;

type DailyRow = {
  site_id: number;
  date: string;
  nettoyage_veille: boolean | null;
  photo_nettoyage_url: string | null;
  photo_source: string | null;
  photo_captured_at: string | null;
};

type VisionVerdict = "ok" | "suspect" | "fail";

type VisionPayload = {
  verdict: VisionVerdict;
  reasons: string[];
  checks: Record<string, boolean | null>;
  photo_path: string;
  photo_source: string | null;
};

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return JSON.stringify(e);
}

async function signedPhotoUrl(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function parseVisionJson(raw: string): VisionPayload | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const j = JSON.parse(cleaned) as {
      verdict?: string;
      reasons?: unknown;
      checks?: Record<string, boolean | null>;
    };
    const verdict = j.verdict;
    if (verdict !== "ok" && verdict !== "suspect" && verdict !== "fail") return null;
    const reasons = Array.isArray(j.reasons)
      ? j.reasons.filter((r): r is string => typeof r === "string").slice(0, 6)
      : [];
    return {
      verdict,
      reasons,
      checks: j.checks ?? {},
      photo_path: "",
      photo_source: null,
    };
  } catch {
    return null;
  }
}

async function analyzePhoto(
  supabase: SupabaseClient,
  opts: {
    scopeKey: string;
    path: string;
    source: string | null;
    capturedAt: string | null;
    siteId: number;
    dateIso: string;
    forceRegen: boolean;
  },
): Promise<{
  scope: string;
  verdict: VisionVerdict | null;
  insightId: number | null;
  cached: boolean;
  error: string | null;
}> {
  const inputHash = await sha256Hex(
    JSON.stringify({
      path: opts.path,
      capturedAt: opts.capturedAt,
      source: opts.source,
      pv: OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
    }),
  );

  if (!opts.forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: SCOPE,
      scopeKey: opts.scopeKey,
      inputHash,
      promptVersion: OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
    });
    if (cached) {
      return {
        scope: SCOPE,
        verdict: (cached.payload?.verdict as VisionVerdict | undefined) ?? null,
        insightId: cached.id,
        cached: true,
        error: null,
      };
    }
  }

  if (!foundryConfig()) {
    return {
      scope: SCOPE,
      verdict: null,
      insightId: null,
      cached: false,
      error: "foundry_not_configured",
    };
  }

  const imageUrl = await signedPhotoUrl(supabase, opts.path);
  if (!imageUrl) {
    return {
      scope: SCOPE,
      verdict: null,
      insightId: null,
      cached: false,
      error: "signed_url_failed",
    };
  }

  try {
    const result = await foundryVisionCompletion({
      job: "haiku",
      system: OPENING_VISION_NETTOYAGE_SYSTEM,
      userText: openingVisionNettoyageUser(opts.siteId, opts.dateIso),
      imageUrl,
      maxTokens: 500,
      detail: "low",
    });
    const parsed = parseVisionJson(result.content);
    const payload: VisionPayload = parsed
      ? {
          ...parsed,
          photo_path: opts.path,
          photo_source: opts.source,
        }
      : {
          verdict: "suspect",
          reasons: ["Réponse vision non structurée"],
          checks: {},
          photo_path: opts.path,
          photo_source: opts.source,
        };
    const summary =
      payload.verdict === "ok"
        ? "Photo nettoyage conforme."
        : `${payload.verdict === "fail" ? "Échec" : "Suspect"} : ${
            payload.reasons[0] ?? "à vérifier"
          }`;

    let row;
    try {
      row = await insertInsight(supabase, {
        scope: SCOPE,
        scopeKey: opts.scopeKey,
        inputHash,
        promptVersion: OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
        content: summary,
        model: result.model,
        status: "ready",
        payload: payload as unknown as Record<string, unknown>,
        promptTokens: result.usage?.prompt_tokens ?? null,
        completionTokens: result.usage?.completion_tokens ?? null,
      });
    } catch {
      const existing = await findReadyInsight(supabase, {
        scope: SCOPE,
        scopeKey: opts.scopeKey,
        inputHash,
        promptVersion: OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
      });
      if (existing) {
        return {
          scope: SCOPE,
          verdict: (existing.payload?.verdict as VisionVerdict) ?? null,
          insightId: existing.id,
          cached: true,
          error: null,
        };
      }
      throw new Error("insert_insight_failed");
    }

    return {
      scope: SCOPE,
      verdict: payload.verdict,
      insightId: row.id,
      cached: false,
      error: null,
    };
  } catch (e) {
    const msg = errMsg(e).slice(0, 400);
    try {
      const row = await insertInsight(supabase, {
        scope: SCOPE,
        scopeKey: opts.scopeKey,
        inputHash,
        promptVersion: OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
        content: "Vision indisponible",
        model: null,
        status: "error",
        payload: { photo_path: opts.path, photo_source: opts.source },
        error: msg,
      });
      return {
        scope: SCOPE,
        verdict: null,
        insightId: row.id,
        cached: false,
        error: msg,
      };
    } catch {
      return {
        scope: SCOPE,
        verdict: null,
        insightId: null,
        cached: false,
        error: msg,
      };
    }
  }
}

async function recordMissingPhoto(
  supabase: SupabaseClient,
  row: DailyRow,
  forceRegen: boolean,
): Promise<unknown> {
  const scopeKey = `${row.site_id}:${row.date}`;
  const inputHash = await sha256Hex(
    JSON.stringify({
      missing: true,
      pv: OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
      site: row.site_id,
      date: row.date,
    }),
  );
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: SCOPE,
      scopeKey,
      inputHash,
      promptVersion: OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
    });
    if (cached) {
      return {
        scope: SCOPE,
        verdict: (cached.payload?.verdict as VisionVerdict) ?? "fail",
        insightId: cached.id,
        cached: true,
        error: null,
      };
    }
  }
  const payload: VisionPayload = {
    verdict: "fail",
    reasons: ["Photo nettoyage non fournie alors que nettoyage veille = Non"],
    checks: {
      photo_fournie: false,
      preuve_visible: false,
      hors_sujet: null,
    },
    photo_path: "",
    photo_source: null,
  };
  const inserted = await insertInsight(supabase, {
    scope: SCOPE,
    scopeKey,
    inputHash,
    promptVersion: OPENING_VISION_NETTOYAGE_PROMPT_VERSION,
    content: "Photo nettoyage manquante.",
    model: null,
    status: "ready",
    payload: payload as unknown as Record<string, unknown>,
  });
  return {
    scope: SCOPE,
    verdict: "fail",
    insightId: inserted.id,
    cached: false,
    error: null,
  };
}

async function processDaily(
  supabase: SupabaseClient,
  row: DailyRow,
  forceRegen: boolean,
): Promise<unknown[]> {
  const scopeKey = `${row.site_id}:${row.date}`;
  if (row.nettoyage_veille !== false) return [];
  if (!row.photo_nettoyage_url) {
    return [await recordMissingPhoto(supabase, row, forceRegen)];
  }
  return [
    await analyzePhoto(supabase, {
      scopeKey,
      path: row.photo_nettoyage_url,
      source: row.photo_source,
      capturedAt: row.photo_captured_at,
      siteId: row.site_id,
      dateIso: row.date,
      forceRegen,
    }),
  ];
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return Response.json({ ok: false, error: "method" }, { status: 405 });
  }

  const url = new URL(req.url);
  let body: {
    site_id?: number;
    date?: string;
    force?: boolean | number | string;
    regen?: boolean | number | string;
  } = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }
  }

  const dateIso =
    (typeof body.date === "string" && body.date) ||
    url.searchParams.get("date") ||
    null;
  const siteIdRaw = body.site_id ?? url.searchParams.get("site_id");
  const siteId =
    siteIdRaw != null && siteIdRaw !== "" ? Number(siteIdRaw) : null;
  const forceAll =
    body.force === true ||
    body.force === 1 ||
    body.force === "1" ||
    url.searchParams.get("force") === "1";
  const regen =
    body.regen === true ||
    body.regen === 1 ||
    body.regen === "1" ||
    url.searchParams.get("regen") === "1";

  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return Response.json({ ok: false, error: "date_required_yyyy_mm_dd" }, { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("daily_info")
    .select(
      "site_id, date, nettoyage_veille, photo_nettoyage_url, photo_source, photo_captured_at",
    )
    .eq("date", dateIso);

  if (siteId != null && Number.isFinite(siteId)) {
    query = query.eq("site_id", siteId);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as DailyRow[];
  const results: unknown[] = [];
  let skipped = 0;

  for (const row of rows) {
    const single = siteId != null;
    const want = row.nettoyage_veille === false;
    if (!single && !forceAll && !want) {
      skipped += 1;
      continue;
    }
    if (!want) {
      skipped += 1;
      continue;
    }
    results.push({
      site_id: row.site_id,
      checks: await processDaily(supabase, row, regen),
    });
  }

  return Response.json({
    ok: true,
    dateIso,
    processed: results.length,
    skipped,
    results,
  });
});
