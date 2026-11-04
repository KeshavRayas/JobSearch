// ─── BYOK shared bits (Phase 5A) ─────────────────────────────────────────────
// Dependency-free: safe to import from client components (localStorage
// settings live in llm/client.ts) and from server routes alike. The key
// itself is NEVER logged anywhere — grep for these header names if in doubt.

export const BYOK_HEADERS = {
  key: "x-llm-key",
  model: "x-llm-model",
  baseUrl: "x-llm-base-url",
  label: "x-llm-label",
  api: "x-llm-api",
} as const;

export type ByokRequest = {
  key?: string;
  model?: string;
  baseUrl?: string;
  label?: string;
  api?: "chat" | "responses";
};

/** Pull user-supplied credentials off request headers (empty → undefined). */
export function readByokHeaders(headers: Pick<Headers, "get">): ByokRequest {
  const pick = (name: string): string | undefined => {
    const v = headers.get(name)?.trim();
    return v ? v : undefined;
  };
  const api = pick(BYOK_HEADERS.api);
  return {
    key: pick(BYOK_HEADERS.key),
    model: pick(BYOK_HEADERS.model),
    baseUrl: pick(BYOK_HEADERS.baseUrl),
    label: pick(BYOK_HEADERS.label),
    api: api === "responses" ? "responses" : api ? "chat" : undefined,
  };
}

/** Masked for display: "sk-…9f2a". Never the key itself. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "…";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

export type LlmUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  model: string;
};

/** "1,842 tokens · llama-3.3-70b" — null-safe, for result footers. */
export function formatUsage(usage: LlmUsage): string {
  const total = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  return `${total.toLocaleString("en-US")} tokens · ${usage.model}`;
}
