/**
 * Client LLM Edge → Azure AI Foundry (OpenAI-compat).
 * Secrets : FOUNDRY_ENDPOINT, FOUNDRY_API_KEY, FOUNDRY_DEPLOYMENT_HAIKU|SONNET
 * (intérim : les deux → gpt5-mini)
 */

export type FoundryJob = "haiku" | "sonnet";

const DEFAULT_API_VERSION = "2024-10-21";

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function foundryConfig() {
  const endpoint = Deno.env.get("FOUNDRY_ENDPOINT")?.trim();
  const apiKey = Deno.env.get("FOUNDRY_API_KEY")?.trim();
  const haiku = Deno.env.get("FOUNDRY_DEPLOYMENT_HAIKU")?.trim() || "gpt5-mini";
  const sonnet = Deno.env.get("FOUNDRY_DEPLOYMENT_SONNET")?.trim() || "gpt5-mini";
  if (!endpoint || !apiKey) return null;
  return {
    endpoint: trimSlash(endpoint),
    apiKey,
    deployments: { haiku, sonnet } as Record<FoundryJob, string>,
  };
}

export type ChatTextPart = { type: "text"; text: string };
export type ChatImagePart = {
  type: "image_url";
  image_url: { url: string; detail?: "low" | "high" | "auto" };
};
export type ChatContentPart = ChatTextPart | ChatImagePart;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

export type ChatCompletionResult = {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

async function chatCompletions(opts: {
  job: FoundryJob;
  messages: ChatMessage[];
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  apiVersion?: string;
}): Promise<ChatCompletionResult> {
  const cfg = foundryConfig();
  if (!cfg) throw new Error("FOUNDRY_* not configured");

  const deployment = cfg.deployments[opts.job];
  const apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION;
  const maxTokens = opts.maxTokens ?? 1200;
  const url =
    `${cfg.endpoint}/openai/deployments/${encodeURIComponent(deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const body: Record<string, unknown> = {
    messages: opts.messages,
    max_completion_tokens: maxTokens,
  };
  if (opts.reasoningEffort || /gpt-?5/i.test(deployment)) {
    body.reasoning_effort = opts.reasoningEffort ?? "low";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": cfg.apiKey,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Foundry ${res.status}: ${raw.slice(0, 500)}`);

  let json: {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
    usage?: ChatCompletionResult["usage"];
  };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Foundry invalid JSON: ${raw.slice(0, 200)}`);
  }
  const content = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("Foundry empty completion");
  return { content, model: json.model ?? deployment, usage: json.usage };
}

export async function foundryChatCompletion(opts: {
  job: FoundryJob;
  messages: ChatMessage[];
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  apiVersion?: string;
}): Promise<ChatCompletionResult> {
  return chatCompletions(opts);
}

/** Vision : job haiku par défaut (coût). Image via URL https (signed Storage). */
export async function foundryVisionCompletion(opts: {
  job?: FoundryJob;
  system: string;
  userText: string;
  imageUrl: string;
  maxTokens?: number;
  detail?: "low" | "high" | "auto";
}): Promise<ChatCompletionResult> {
  return chatCompletions({
    job: opts.job ?? "haiku",
    maxTokens: opts.maxTokens ?? 600,
    reasoningEffort: "low",
    messages: [
      { role: "system", content: opts.system },
      {
        role: "user",
        content: [
          { type: "text", text: opts.userText },
          {
            type: "image_url",
            image_url: { url: opts.imageUrl, detail: opts.detail ?? "low" },
          },
        ],
      },
    ],
  });
}
