import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { foundryChatCompletion, foundryConfig } from "../_shared/foundry.ts";
import {
  SUGGESTIONS_CLUSTER_SCOPE,
  SUGGESTIONS_CLUSTER_PROMPT_VERSION,
  SUGGESTIONS_CLUSTER_SYSTEM,
  suggestionsClusterUser,
} from "../_shared/ai-prompts.ts";
import {
  findReadyInsight,
  insertInsight,
  sha256Hex,
} from "../_shared/ai-insight.ts";

/**
 * Clustering suggestions ouvertes → `ai_insight` (`suggestions_cluster_digest`).
 * CRM : Lancer / Relancer.
 */

async function loadSnapshot(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("suggestion_anonyme")
    .select("id, corps, categorie, treated_at, created_at")
    .is("treated_at", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;

  const byCategorie: Record<string, number> = {};
  const items = (data ?? []).map((row) => {
    const cat = (row.categorie as string)?.trim() || "autre";
    byCategorie[cat] = (byCategorie[cat] ?? 0) + 1;
    return {
      id: Number(row.id),
      categorie: cat,
      excerpt: String(row.corps ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
    };
  });

  return {
    scopeKey: "open",
    items,
    counts: { open: items.length, byCategorie },
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
      scope: SUGGESTIONS_CLUSTER_SCOPE,
      scopeKey: snapshot.scopeKey,
      inputHash,
      promptVersion: SUGGESTIONS_CLUSTER_PROMPT_VERSION,
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

  if (snapshot.items.length === 0) {
    const corps = [
      "Aucune suggestion ouverte à regrouper pour le moment.",
      "<<<DETAIL>>>",
      "**Thèmes**",
      "RAS",
      "",
      "**Doublons**",
      "RAS",
      "",
      "**Priorité**",
      "- RAS",
    ].join("\n");
    const row = await insertInsight(supabase, {
      scope: SUGGESTIONS_CLUSTER_SCOPE,
      scopeKey: snapshot.scopeKey,
      inputHash,
      promptVersion: SUGGESTIONS_CLUSTER_PROMPT_VERSION,
      content: corps,
      model: null,
      status: "ready",
      payload: { counts: snapshot.counts },
    });
    return {
      corps,
      model: null,
      error: null,
      insightId: row.id,
      cached: false,
    };
  }

  try {
    const result = await foundryChatCompletion({
      job: "haiku",
      messages: [
        { role: "system", content: SUGGESTIONS_CLUSTER_SYSTEM },
        {
          role: "user",
          content: suggestionsClusterUser(JSON.stringify(snapshot)),
        },
      ],
      maxTokens: 900,
      reasoningEffort: "low",
    });
    const row = await insertInsight(supabase, {
      scope: SUGGESTIONS_CLUSTER_SCOPE,
      scopeKey: snapshot.scopeKey,
      inputHash,
      promptVersion: SUGGESTIONS_CLUSTER_PROMPT_VERSION,
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
    const cats = Object.entries(snapshot.counts.byCategorie)
      .map(([k, n]) => `${k} · ${n}`)
      .join(" · ");
    const fallback = [
      `${snapshot.counts.open} suggestion(s) ouverte(s) à trier.`,
      "<<<DETAIL>>>",
      "**Thèmes**",
      cats || "RAS",
      "",
      "**Doublons**",
      "RAS",
      "",
      "**Priorité**",
      "- Parcourir les catégories les plus peuplées.",
    ].join("\n");
    try {
      const row = await insertInsight(supabase, {
        scope: SUGGESTIONS_CLUSTER_SCOPE,
        scopeKey: snapshot.scopeKey,
        inputHash,
        promptVersion: SUGGESTIONS_CLUSTER_PROMPT_VERSION,
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
  const regen = url.searchParams.get("regen") === "1";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const snapshot = await loadSnapshot(supabase);
    const digest = await buildDigest(supabase, snapshot, regen);
    return Response.json({
      ok: true,
      scopeKey: snapshot.scopeKey,
      aiModel: digest.model,
      aiError: digest.error,
      insightId: digest.insightId,
      cached: digest.cached,
      corpsLength: digest.corps.length,
      counts: snapshot.counts,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
});
