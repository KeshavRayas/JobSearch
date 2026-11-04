// ─── Browser provider store ──────────────────────────────────────────────────
// One central place for AI connections (key + model). Keys live in
// localStorage, travel per request as headers, and are never persisted or
// logged server-side. The job modal only chooses the active connection.

import { BYOK_HEADERS, maskKey } from "@/lib/llm/byok";

export type LlmPreset = {
  id: string;
  label: string;
  baseUrl: string;
  modelPlaceholder: string;
};

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: "opencode-go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    modelPlaceholder: "opencode-go/muse-spark-1.3-contributor",
  },
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
  {
    id: "custom",
    label: "Custom URL",
    baseUrl: "",
    modelPlaceholder: "model id",
  },
];

export type LlmConnection = {
  id: string;
  presetId: string;
  label: string;
  baseUrl: string;
  model: string;
  key: string;
};

export type LlmStore = {
  connections: LlmConnection[];
  activeId: string | null;
};

const STORAGE_KEY = "jobsearch.llm.providers.v1";
const LEGACY_KEY = "jobsearch.llm";
const CHANGE_EVENT = "jobsearch:llm-changed";

function normalize(store: Partial<LlmStore>): LlmStore {
  const connections = Array.isArray(store.connections)
    ? store.connections.filter(
        (c): c is LlmConnection =>
          Boolean(c) &&
          typeof c.key === "string" &&
          typeof c.model === "string",
      )
    : [];
  const activeId =
    store.activeId && connections.some((c) => c.id === store.activeId)
      ? store.activeId
      : (connections[0]?.id ?? null);
  return { connections, activeId };
}

export function loadLlmStore(): LlmStore {
  try {
    if (typeof window === "undefined")
      return { connections: [], activeId: null };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<LlmStore>);

    // Migrate the original single-key setting.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return { connections: [], activeId: null };
    const parsed = JSON.parse(legacy) as Partial<LlmConnection>;
    if (!parsed.key || !parsed.model)
      return { connections: [], activeId: null };
    const connection: LlmConnection = {
      id: "legacy",
      presetId: parsed.presetId ?? "custom",
      label: parsed.label ?? "Custom",
      baseUrl: parsed.baseUrl ?? "",
      model: parsed.model,
      key: parsed.key,
    };
    const migrated = { connections: [connection], activeId: connection.id };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return { connections: [], activeId: null };
  }
}

export function saveLlmStore(store: LlmStore): void {
  const normalized = normalize(store);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function activeConnection(store: LlmStore): LlmConnection | null {
  return store.connections.find((c) => c.id === store.activeId) ?? null;
}

/** Headers for model POSTs. Null means the server default provider. */
export function llmHeaders(
  connection: LlmConnection | null,
): Record<string, string> {
  if (!connection?.key) return {};
  const out: Record<string, string> = {
    [BYOK_HEADERS.key]: connection.key,
    [BYOK_HEADERS.model]: connection.model,
    [BYOK_HEADERS.label]: connection.label,
  };
  if (connection.baseUrl) out[BYOK_HEADERS.baseUrl] = connection.baseUrl;
  return out;
}

/** React to Settings changes in the same tab and across tabs. */
export function subscribeLlmStore(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_KEY) callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export { maskKey };
