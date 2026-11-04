// ─── Browser key store (Phase 5A: BYOK, client side) ─────────────────────────
// The key lives in localStorage and rides per-request headers (see
// llm/byok.ts). Nothing about the key ever touches the server disk or logs.

import { BYOK_HEADERS, maskKey } from "@/lib/llm/byok";

export type LlmPreset = {
  id: string;
  label: string;
  baseUrl: string;
  modelPlaceholder: string;
};

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelPlaceholder: "meta-llama/llama-3.3-70b-instruct",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile",
  },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    modelPlaceholder: "llama3.1",
  },
  { id: "custom", label: "Custom URL", baseUrl: "", modelPlaceholder: "model id" },
];

export type LlmSettings = {
  presetId: string;
  label: string;
  baseUrl: string;
  model: string;
  key: string;
};

const STORAGE_KEY = "jobsearch.llm";

export function loadLlmSettings(): LlmSettings | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    if (!parsed.key || !parsed.model) return null;
    return {
      presetId: parsed.presetId ?? "custom",
      label: parsed.label ?? "Custom",
      baseUrl: parsed.baseUrl ?? "",
      model: parsed.model,
      key: parsed.key,
    };
  } catch {
    return null;
  }
}

export function saveLlmSettings(s: LlmSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearLlmSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Headers for model POSTs. Omit when no key is stored (server falls back). */
export function llmHeaders(s: LlmSettings | null): Record<string, string> {
  if (!s?.key) return {};
  const out: Record<string, string> = {
    [BYOK_HEADERS.key]: s.key,
    [BYOK_HEADERS.model]: s.model,
    [BYOK_HEADERS.label]: s.label,
  };
  if (s.baseUrl) out[BYOK_HEADERS.baseUrl] = s.baseUrl;
  return out;
}

export { maskKey };
