/**
 * Vision fermeture : photo seau + photo parking (si site configuré) → ai_insight.
 *
 * POST JSON :
 *   { site_id, date }     — 1 fermeture (appel PWA après submit)
 *   { date, force?: 1 }   — batch jour (cron / manuel)
 *
 * Secrets : FOUNDRY_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryConfig, foundryVisionCompletion } from "../_shared/foundry.ts";
import {
  CLOSING_VISION_SEAU_PROMPT_VERSION,
  CLOSING_VISION_SEAU_SCOPE,
  CLOSING_VISION_SEAU_SYSTEM,
  CLOSING_VISION_PARKING_PROMPT_VERSION,
  CLOSING_VISION_PARKING_SCOPE,
  CLOSING_VISION_PARKING_SYSTEM,
  closingVisionSeauUser,
  closingVisionParkingUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

const PHOTO_BUCKET = "telecollecte-photos";
const SCOPE_SEAU = CLOSING_VISION_SEAU_SCOPE;
const SCOPE_PARKING = CLOSING_VISION_PARKING_SCOPE;

type ClosingRow = {
  site_id: number;
  date: string;
  photo_seau_url: string | null;
  photo_seau_source: string | null;
  photo_seau_captured_at: string | null;
  nettoyage_fait: boolean | null;
  photo_parking_url: string | null;
  photo_parking_source: string | null;
  photo_parking_captured_at: string | null;
  photo_parking_raison: string | null;
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
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return JSON.stringify(e);
}

/** Batch : seulement si nettoyage déclaré (avec ou sans photo). */
function shouldAnalyze(row: ClosingRow, forceAll: boolean): boolean {
  if (forceAll) return row.nettoyage_fait === true;
  return row.nettoyage_fait === true;
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
    scope: string;
    scopeKey: string;
    path: string;
    source: string | null;
    capturedAt: string | null;
    system: string;
    userText: string;
    promptVersion: number;
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
      pv: opts.promptVersion,
    }),
  );

  if (!opts.forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: opts.scope,
      scopeKey: opts.scopeKey,
      inputHash,
      promptVersion: opts.promptVersion,
    });
    if (cached) {
      const verdict = (cached.payload?.verdict as VisionVerdict | undefined) ?? null;
      return {
        scope: opts.scope,
        verdict,
        insightId: cached.id,
        cached: true,
        error: null,
      };
    }
  }

  if (!foundryConfig()) {
    return {
      scope: opts.scope,
      verdict: null,
      insightId: null,
      cached: false,
      error: "foundry_not_configured",
    };
  }

  const imageUrl = await signedPhotoUrl(supabase, opts.path);
  if (!imageUrl) {
    return {
      scope: opts.scope,
      verdict: null,
      insightId: null,
      cached: false,
      error: "signed_url_failed",
    };
  }

  try {
    const result = await foundryVisionCompletion({
      job: "haiku",
      system: opts.system,
      userText: opts.userText,
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
        ? "Photo conforme."
        : `${payload.verdict === "fail" ? "Échec" : "Suspect"} : ${
            payload.reasons[0] ?? "à vérifier"
          }`;

    let row;
    try {
      row = await insertInsight(supabase, {
        scope: opts.scope,
        scopeKey: opts.scopeKey,
        inputHash,
        promptVersion: opts.promptVersion,
        content: summary,
        model: result.model,
        status: "ready",
        payload: payload as unknown as Record<string, unknown>,
        promptTokens: result.usage?.prompt_tokens ?? null,
        completionTokens: result.usage?.completion_tokens ?? null,
      });
    } catch {
      const existing = await findReadyInsight(supabase, {
        scope: opts.scope,
        scopeKey: opts.scopeKey,
        inputHash,
        promptVersion: opts.promptVersion,
      });
      if (existing) {
        return {
          scope: opts.scope,
          verdict: (existing.payload?.verdict as VisionVerdict) ?? null,
          insightId: existing.id,
          cached: true,
          error: null,
        };
      }
      throw new Error("insert_insight_failed");
    }

    return {
      scope: opts.scope,
      verdict: payload.verdict,
      insightId: row.id,
      cached: false,
      error: null,
    };
  } catch (e) {
    const msg = errMsg(e).slice(0, 400);
    try {
      const row = await insertInsight(supabase, {
        scope: opts.scope,
        scopeKey: opts.scopeKey,
        inputHash,
        promptVersion: opts.promptVersion,
        content: "Vision indisponible",
        model: null,
        status: "error",
        payload: { photo_path: opts.path, photo_source: opts.source },
        error: msg,
      });
      return {
        scope: opts.scope,
        verdict: null,
        insightId: row.id,
        cached: false,
        error: msg,
      };
    } catch {
      return {
        scope: opts.scope,
        verdict: null,
        insightId: null,
        cached: false,
        error: msg,
      };
    }
  }
}

async function recordMissingSeauPhoto(
  supabase: SupabaseClient,
  row: ClosingRow,
  forceRegen: boolean,
): Promise<unknown> {
  const scopeKey = `${row.site_id}:${row.date}`;
  const inputHash = await sha256Hex(
    JSON.stringify({ missing: true, pv: CLOSING_VISION_SEAU_PROMPT_VERSION, site: row.site_id, date: row.date }),
  );
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: SCOPE_SEAU,
      scopeKey,
      inputHash,
      promptVersion: CLOSING_VISION_SEAU_PROMPT_VERSION,
    });
    if (cached) {
      return {
        scope: SCOPE_SEAU,
        verdict: (cached.payload?.verdict as VisionVerdict) ?? "fail",
        insightId: cached.id,
        cached: true,
        error: null,
      };
    }
  }
  const payload: VisionPayload = {
    verdict: "fail",
    reasons: ["Photo seau non fournie alors que le nettoyage est déclaré fait"],
    checks: {
      photo_fournie: false,
      seau_visible: false,
      liquide_visible: false,
      hors_sujet: null,
    },
    photo_path: "",
    photo_source: null,
  };
  const inserted = await insertInsight(supabase, {
    scope: SCOPE_SEAU,
    scopeKey,
    inputHash,
    promptVersion: CLOSING_VISION_SEAU_PROMPT_VERSION,
    content: "Photo seau manquante.",
    model: null,
    status: "ready",
    payload: payload as unknown as Record<string, unknown>,
  });
  return {
    scope: SCOPE_SEAU,
    verdict: "fail",
    insightId: inserted.id,
    cached: false,
    error: null,
  };
}

async function recordMissingParkingPhoto(
  supabase: SupabaseClient,
  row: ClosingRow,
  forceRegen: boolean,
  reason: string,
): Promise<unknown> {
  const scopeKey = `${row.site_id}:${row.date}`;
  const inputHash = await sha256Hex(
    JSON.stringify({
      missing: true,
      raison: reason,
      pv: CLOSING_VISION_PARKING_PROMPT_VERSION,
      site: row.site_id,
      date: row.date,
    }),
  );
  if (!forceRegen) {
    const cached = await findReadyInsight(supabase, {
      scope: SCOPE_PARKING,
      scopeKey,
      inputHash,
      promptVersion: CLOSING_VISION_PARKING_PROMPT_VERSION,
    });
    if (cached) {
      return {
        scope: SCOPE_PARKING,
        verdict: (cached.payload?.verdict as VisionVerdict) ?? "fail",
        insightId: cached.id,
        cached: true,
        error: null,
      };
    }
  }
  const payload: VisionPayload = {
    verdict: "fail",
    reasons: [reason || "Photo parking non fournie"],
    checks: {
      photo_fournie: false,
      carte_visible: false,
      hors_sujet: null,
    },
    photo_path: "",
    photo_source: null,
  };
  const inserted = await insertInsight(supabase, {
    scope: SCOPE_PARKING,
    scopeKey,
    inputHash,
    promptVersion: CLOSING_VISION_PARKING_PROMPT_VERSION,
    content: reason || "Photo parking manquante.",
    model: null,
    status: "ready",
    payload: payload as unknown as Record<string, unknown>,
  });
  return {
    scope: SCOPE_PARKING,
    verdict: "fail",
    insightId: inserted.id,
    cached: false,
    error: null,
  };
}

async function processClosing(
  supabase: SupabaseClient,
  row: ClosingRow,
  forceRegen: boolean,
  opts: { requireParking: boolean },
): Promise<unknown[]> {
  const scopeKey = `${row.site_id}:${row.date}`;
  const out: unknown[] = [];

  if (row.nettoyage_fait === true) {
    if (!row.photo_seau_url) {
      out.push(await recordMissingSeauPhoto(supabase, row, forceRegen));
    } else {
      out.push(
        await analyzePhoto(supabase, {
          scope: SCOPE_SEAU,
          scopeKey,
          path: row.photo_seau_url,
          source: row.photo_seau_source,
          capturedAt: row.photo_seau_captured_at,
          system: CLOSING_VISION_SEAU_SYSTEM,
          userText: closingVisionSeauUser(row.site_id, row.date),
          promptVersion: CLOSING_VISION_SEAU_PROMPT_VERSION,
          forceRegen,
        }),
      );
    }
  }

  if (opts.requireParking) {
    if (row.photo_parking_url) {
      out.push(
        await analyzePhoto(supabase, {
          scope: SCOPE_PARKING,
          scopeKey,
          path: row.photo_parking_url,
          source: row.photo_parking_source,
          capturedAt: row.photo_parking_captured_at,
          system: CLOSING_VISION_PARKING_SYSTEM,
          userText: closingVisionParkingUser(row.site_id, row.date),
          promptVersion: CLOSING_VISION_PARKING_PROMPT_VERSION,
          forceRegen,
        }),
      );
    } else {
      const raison = row.photo_parking_raison?.trim() ||
        "Photo parking absente (site avec carte parking)";
      out.push(
        await recordMissingParkingPhoto(supabase, row, forceRegen, raison),
      );
    }
  }

  return out;
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
    .from("closing_form")
    .select(
      "site_id, date, photo_seau_url, photo_seau_source, photo_seau_captured_at, nettoyage_fait, photo_parking_url, photo_parking_source, photo_parking_captured_at, photo_parking_raison",
    )
    .eq("date", dateIso);

  if (siteId != null && Number.isFinite(siteId)) {
    query = query.eq("site_id", siteId);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ClosingRow[];
  const siteIds = [...new Set(rows.map((r) => Number(r.site_id)))];
  const parkingSites = new Set<number>();
  if (siteIds.length > 0) {
    const { data: infos } = await supabase
      .from("site_infos")
      .select("site_id, carte_parking")
      .in("site_id", siteIds);
    for (const info of infos ?? []) {
      if (info.carte_parking === true) parkingSites.add(Number(info.site_id));
    }
  }

  const results: unknown[] = [];
  let skipped = 0;

  for (const row of rows) {
    const single = siteId != null;
    const requireParking = parkingSites.has(Number(row.site_id));
    const wantSeau = row.nettoyage_fait === true;
    if (!single && !forceAll && !wantSeau && !requireParking) {
      skipped += 1;
      continue;
    }
    if (!wantSeau && !requireParking) {
      skipped += 1;
      continue;
    }
    // Batch sans force : seau seulement si nettoyage (comportement historique)
    if (!single && !forceAll && !shouldAnalyze(row, forceAll) && !requireParking) {
      skipped += 1;
      continue;
    }
    results.push({
      site_id: row.site_id,
      checks: await processClosing(supabase, row, regen, { requireParking }),
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
