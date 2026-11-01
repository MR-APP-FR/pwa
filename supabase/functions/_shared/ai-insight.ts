import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export {
  CA_DAILY_DIGEST_SCOPE,
  CA_DAILY_PROMPT_VERSION,
  CA_MONTHLY_DIGEST_SCOPE,
  CA_MONTHLY_PROMPT_VERSION,
  CA_YEARLY_DIGEST_SCOPE,
  CA_YEARLY_PROMPT_VERSION,
  CA_STAFF_PERSON_DIGEST_SCOPE,
  CA_STAFF_PERSON_PROMPT_VERSION,
  CLOSING_VISION_SEAU_SCOPE,
  CLOSING_VISION_SEAU_PROMPT_VERSION,
} from "./ai-prompts.ts";

export type InsightStatus = "pending" | "ready" | "error";

export type AiInsightRow = {
  id: number;
  scope: string;
  scope_key: string;
  input_hash: string;
  prompt_version: number;
  content: string;
  model: string | null;
  status: InsightStatus;
  payload: Record<string, unknown>;
  error: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at?: string;
};

/** SHA-256 hex (Web Crypto). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Ready insight for same scope/key/hash/prompt — skip LLM. */
export async function findReadyInsight(
  supabase: SupabaseClient,
  opts: { scope: string; scopeKey: string; inputHash: string; promptVersion: number },
): Promise<AiInsightRow | null> {
  const { data, error } = await supabase
    .from("ai_insight")
    .select(
      "id, scope, scope_key, input_hash, prompt_version, content, model, status, payload, error, prompt_tokens, completion_tokens",
    )
    .eq("scope", opts.scope)
    .eq("scope_key", opts.scopeKey)
    .eq("input_hash", opts.inputHash)
    .eq("prompt_version", opts.promptVersion)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AiInsightRow | null) ?? null;
}

export async function insertInsight(
  supabase: SupabaseClient,
  row: {
    scope: string;
    scopeKey: string;
    inputHash: string;
    promptVersion: number;
    content: string;
    model: string | null;
    status: InsightStatus;
    payload?: Record<string, unknown>;
    error?: string | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
  },
): Promise<AiInsightRow> {
  const { data, error } = await supabase
    .from("ai_insight")
    .upsert(
      {
        scope: row.scope,
        scope_key: row.scopeKey,
        input_hash: row.inputHash,
        prompt_version: row.promptVersion,
        content: row.content,
        model: row.model,
        status: row.status,
        payload: row.payload ?? {},
        error: row.error ?? null,
        prompt_tokens: row.promptTokens ?? null,
        completion_tokens: row.completionTokens ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scope,scope_key,input_hash,prompt_version" },
    )
    .select(
      "id, scope, scope_key, input_hash, prompt_version, content, model, status, payload, error, prompt_tokens, completion_tokens, created_at",
    )
    .single();
  if (error) throw error;
  return data as AiInsightRow;
}
