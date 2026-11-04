// ─── Browser provider store ──────────────────────────────────────────────────
// One central place for AI connections (key + model). Keys live in
// localStorage, travel per request as headers, and are never persisted or
// logged server-side. The job modal only chooses the active connection.

import { BYOK_HEADERS, maskKey } from "@/lib/llm/byok";

export type LlmPreset = {
  id: string;
  label: string;
  baseUrl: string;
  api?: "chat" | "responses";
};

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: "opencode-go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    api: "responses",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "together",
    label: "Together",
    baseUrl: "https://api.together.xyz/v1",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
  },
  {
    id: "custom",
    label: "Custom URL",
    baseUrl: "",
  },
];

export type LlmConnection = {
  id: string;
  presetId: string;
  label: string;
  baseUrl: string;
  key: string;
  api?: "chat" | "responses";
  /** Discovered from the provider's /models endpoint. */
  models?: string[];
};

export type LlmStore = {
  connections: LlmConnection[];
  activeId: string | null;
  activeModel: string | null;
};

const STORAGE_KEY = "jobsearch.llm.providers.v1";
const LEGACY_KEY = "jobsearch.llm";
const CHANGE_EVENT = "jobsearch:llm-changed";

function normalize(store: Partial<LlmStore>): LlmStore {
  const connections = Array.isArray(store.connections)
    ? store.connections
        .filter(
          (c): c is LlmConnection =>
            Boolean(c) && typeof c.key === "string" && c.key.length > 0,
        )
        .map((c) => ({
          ...c,
          models: Array.isArray(c.models)
            ? c.models.filter((m): m is string => typeof m === "string")
            : [],
        }))
    : [];
  const activeId =
    store.activeId && connections.some((c) => c.id === store.activeId)
      ? store.activeId
      : (connections[0]?.id ?? null);
  const activeConnection = connections.find((c) => c.id === activeId);
  const activeModel =
    typeof store.activeModel === "string" &&
    store.activeModel.length > 0 &&
    (!activeConnection?.models?.length ||
      activeConnection.models.includes(store.activeModel))
      ? store.activeModel
      : (activeConnection?.models?.[0] ?? null);
  return { connections, activeId, activeModel };
}

export function loadLlmStore(): LlmStore {
  try {
    if (typeof window === "undefined")
      return { connections: [], activeId: null, activeModel: null };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<LlmStore>);

    // Migrate the original single-key setting.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return { connections: [], activeId: null, activeModel: null };
    const parsed = JSON.parse(legacy) as Partial<LlmConnection> & {
      model?: string;
    };
    if (!parsed.key || !parsed.model)
      return { connections: [], activeId: null, activeModel: null };
    const connection: LlmConnection = {
      id: "legacy",
      presetId: parsed.presetId ?? "custom",
      label: parsed.label ?? "Custom",
      baseUrl: parsed.baseUrl ?? "",
      key: parsed.key,
      models: [parsed.model],
    };
    const migrated = {
      connections: [connection],
      activeId: connection.id,
      activeModel: parsed.model,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return { connections: [], activeId: null, activeModel: null };
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

/** Model to send: the explicit selection, else the connection's first model. */
export function activeModelFor(store: LlmStore): string | null {
  const connection = activeConnection(store);
  if (!connection) return null;
  if (
    store.activeModel &&
    (!connection.models?.length ||
      connection.models.includes(store.activeModel))
  ) {
    return store.activeModel;
  }
  return connection.models?.[0] ?? null;
}

/** Headers for model POSTs. Null means the server default provider. */
export function llmHeaders(
  connection: LlmConnection | null,
  model: string | null,
): Record<string, string> {
  if (!connection?.key) return {};
  const chosen = model ?? connection.models?.[0];
  if (!chosen) return {};
  const out: Record<string, string> = {
    [BYOK_HEADERS.key]: connection.key,
    [BYOK_HEADERS.model]: chosen,
    [BYOK_HEADERS.label]: connection.label,
  };
  if (connection.baseUrl) out[BYOK_HEADERS.baseUrl] = connection.baseUrl;
  if (connection.api) out[BYOK_HEADERS.api] = connection.api;
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
