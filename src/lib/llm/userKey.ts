import { getDefaultProvider } from "@/lib/analysis/service";
import { CloudJsonProvider } from "@/lib/llm/cloud";
import { readByokHeaders, type LlmUsage } from "@/lib/llm/byok";
import type { LlmProvider } from "@/lib/llm/types";

// ─── Per-request provider resolution (Phase 5A: BYOK) ────────────────────────
// Precedence: user key (x-llm-key header) → operator env (LLM_PROVIDER=cloud)
// → local OpenCode CLI. The key travels per request and is never persisted
// or logged — services receive an already-configured provider instance.

export type ProviderSource = "user" | "env" | "cli";

export type ResolvedProvider = {
  provider: LlmProvider;
  meta: {
    source: ProviderSource;
    /** Display string, safe for UI. Never contains the key. */
    display: string;
    model: string | null;
  };
};

export class MissingModelError extends Error {
  constructor() {
    super("model is required alongside your key");
    this.name = "MissingModelError";
  }
}

export function resolveProvider(
  headers: Pick<Headers, "get">,
): ResolvedProvider {
  const { key, model, baseUrl, label, api } = readByokHeaders(headers);
  if (key) {
    if (!model) throw new MissingModelError();
    return {
      provider: new CloudJsonProvider({ apiKey: key, model, baseUrl, api }),
      meta: {
        source: "user",
        display: label ? `your ${label} key` : "your key",
        model,
      },
    };
  }
  const provider = getDefaultProvider();
  if (provider instanceof CloudJsonProvider) {
    return {
      provider,
      meta: {
        source: "env",
        display: "shared provider key",
        model: provider.modelName(),
      },
    };
  }
  return {
    provider,
    meta: { source: "cli", display: "local free model", model: null },
  };
}

/** Tokens from the just-finished call, or null (CLI / repair paths). */
export function usageOf(provider: LlmProvider): LlmUsage | null {
  if (provider instanceof CloudJsonProvider) return provider.lastUsage;
  return null;
}
