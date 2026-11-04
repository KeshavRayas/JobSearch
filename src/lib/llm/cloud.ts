import { LlmError, type LlmProvider } from "@/lib/llm/types";

// ─── Hosted model provider (Phase 4A) ────────────────────────────────────────
// Implements the same LlmProvider contract as the OpenCode CLI passthrough,
// but calls any OpenAI-compatible chat-completions endpoint over HTTPS — so
// Analyze/tailor/cover/interview work wherever Node runs (including Vercel).
//
// Selection lives in getDefaultProvider (analysis/service.ts):
//   LLM_PROVIDER=cloud → this. Anything else → opencode CLI (local default).
//
// Env:
//   LLM_API_KEY   (required) bearer token for the endpoint
//   LLM_MODEL     (required) e.g. gpt-4o-mini — pinned by the operator,
//                 never defaulted silently (model choice is a cost decision)
//   LLM_BASE_URL  (optional) default https://api.openai.com/v1
//   LLM_TIMEOUT_MS (optional) default 120_000
//
// Cost guard: every call logs model + token usage. The 422 pre-gates
// (empty skills, missing analysis) and persist-only-validated rules in the
// services keep waste at zero regardless of provider.

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 120_000;

export type CloudProviderOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** "responses" for OpenAI Responses API models (e.g. OpenCode Muse). */
  api?: "chat" | "responses";
};

function config(opts: CloudProviderOptions): {
  apiKey: string;
  model: string;
  baseUrl: string;
  api: "chat" | "responses";
} {
  const apiKey = opts.apiKey ?? process.env.LLM_API_KEY;
  const model = opts.model ?? process.env.LLM_MODEL;
  if (!apiKey || !model) {
    throw new LlmError(
      "cloud",
      "LLM_PROVIDER=cloud needs LLM_API_KEY and LLM_MODEL set",
    );
  }
  return {
    apiKey,
    model,
    baseUrl:
      opts.baseUrl ??
      process.env.LLM_BASE_URL?.replace(/\/$/, "") ??
      DEFAULT_BASE_URL,
    api:
      opts.api ??
      (process.env.LLM_API_MODE === "responses" ? "responses" : "chat"),
  };
}

function timeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export class CloudJsonProvider implements LlmProvider {
  readonly name = "cloud";
  private readonly opts: CloudProviderOptions;
  /** Tokens from the most recent successful call (single-user app: the
   * caller reads this right after its own generateJson resolves). */
  lastUsage: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    model: string;
  } | null = null;

  constructor(opts: CloudProviderOptions = {}) {
    this.opts = opts;
  }

  /** Model this instance will call — for provider-line display. Never the key. */
  modelName(): string {
    return this.opts.model ?? process.env.LLM_MODEL ?? "unknown model";
  }

  async generateJson(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<unknown> {
    const { apiKey, model, baseUrl, api } = config(this.opts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      // GitHub Copilot's OpenAI-compatible endpoint requires its integration
      // headers in addition to the bearer token.
      if (baseUrl.includes("githubcopilot.com")) {
        headers["Copilot-Integration-Id"] = "vscode-chat";
        headers["Editor-Version"] = "vscode/1.95.0";
      }
      // OpenCode Go routes requests by session; without this header it
      // returns MissingSessionID instead of running the model.
      if (baseUrl.includes("opencode.ai")) {
        headers["x-opencode-session"] =
          process.env.LLM_SESSION_ID ?? "job-search-local";
      }
      const endpoint =
        api === "responses"
          ? `${baseUrl}/responses`
          : `${baseUrl}/chat/completions`;
      const payload =
        api === "responses"
          ? {
              model,
              instructions: systemPrompt,
              input: userPrompt,
              text: { format: { type: "json_object" } },
            }
          : {
              model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              response_format: { type: "json_object" },
              temperature: 0,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new LlmError(
          this.name,
          `model endpoint returned ${res.status}`,
          (await res.text()).slice(0, 500),
        );
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: unknown } }[];
        output_text?: unknown;
        output?: { content?: { type?: string; text?: unknown }[] }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          input_tokens?: number;
          output_tokens?: number;
        };
      };
      const responseText =
        api === "responses"
          ? (data.output_text ??
            (data.output ?? [])
              .flatMap((item) => item.content ?? [])
              .filter((part) => part.type === "output_text")
              .map((part) => part.text)
              .filter((text): text is string => typeof text === "string")
              .join("\n"))
          : data.choices?.[0]?.message?.content;
      const content = typeof responseText === "string" ? responseText : "";
      if (!content.trim()) {
        throw new LlmError(this.name, "model returned an empty message");
      }
      const promptTokens =
        data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? null;
      const completionTokens =
        data.usage?.completion_tokens ?? data.usage?.output_tokens ?? null;
      this.lastUsage = {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        model,
      };
      if (data.usage) {
        console.log(
          `[llm] cloud model=${model} ` +
            `prompt_tokens=${promptTokens ?? "?"} ` +
            `completion_tokens=${completionTokens ?? "?"}`,
        );
      }
      try {
        return JSON.parse(content);
      } catch {
        throw new LlmError(
          this.name,
          "model did not return parseable JSON",
          content.slice(0, 500),
        );
      }
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw new LlmError(
        this.name,
        `model request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
