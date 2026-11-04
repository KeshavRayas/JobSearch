"use client";

import { useEffect, useState } from "react";
import {
  LLM_PRESETS,
  loadLlmStore,
  maskKey,
  saveLlmStore,
  type LlmConnection,
  type LlmStore,
} from "@/lib/llm/client";

// ─── AI providers (Settings) ─────────────────────────────────────────────────
// Add a key once. Saving discovers the provider's models, so the user never
// types a model here. The job panel lists the discovered models.

const inputClass =
  "w-full bg-white border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] outline-none transition-colors duration-500 focus:border-black/30 placeholder:text-black/35";

const labelClass =
  "block text-[11px] uppercase tracking-[0.12em] text-black/45";

type Draft = {
  id?: string;
  presetId: string;
  label: string;
  baseUrl: string;
  key: string;
  api?: "chat" | "responses";
};

function draftFrom(connection?: LlmConnection): Draft {
  if (connection) {
    return {
      id: connection.id,
      presetId: connection.presetId,
      label: connection.label,
      baseUrl: connection.baseUrl,
      key: "",
      api: connection.api,
    };
  }
  return {
    presetId: LLM_PRESETS[0].id,
    label: LLM_PRESETS[0].label,
    baseUrl: LLM_PRESETS[0].baseUrl,
    key: "",
    api: LLM_PRESETS[0].api,
  };
}

export function ProviderSettings() {
  const [store, setStore] = useState<LlmStore | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; this syncs the store after hydration
    setStore(loadLlmStore());
  }, []);

  if (!store) {
    return (
      <section className="calm-card p-6 sm:p-8">
        <h2 className="font-serif-calm text-[24px]">AI providers</h2>
        <p className="mt-1 text-[13px] text-black/55">Loading keys…</p>
      </section>
    );
  }

  function apply(next: LlmStore) {
    saveLlmStore(next);
    setStore(next);
    setSaved(true);
    setError(null);
  }

  function startEdit(connection?: LlmConnection) {
    setDraft(draftFrom(connection));
    setError(null);
    setSaved(false);
  }

  async function testAndSave() {
    if (!draft) return;
    const baseUrl = draft.baseUrl.trim();
    const label = draft.label.trim() || "Custom";
    const existing = draft.id
      ? store?.connections.find((c) => c.id === draft.id)
      : undefined;
    const key = draft.key.trim() || existing?.key || "";

    if (!key) return setError("API key is required.");
    if (!baseUrl) return setError("Base URL is required.");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/llm/models", {
        method: "POST",
        headers: {
          "x-llm-key": key,
          "x-llm-base-url": baseUrl,
          "x-llm-label": label,
          ...(draft.api ? { "x-llm-api": draft.api } : {}),
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail ?? data?.error ?? "Key check failed");
      }
      const models = Array.isArray(data?.models)
        ? (data.models as string[])
        : [];
      if (models.length === 0) throw new Error("No models returned.");

      const connection: LlmConnection = {
        id: draft.id ?? crypto.randomUUID(),
        presetId: draft.presetId,
        label,
        baseUrl,
        key,
        api: draft.api,
        models,
      };
      const connections = draft.id
        ? store!.connections.map((c) =>
            c.id === draft.id ? connection : c,
          )
        : [...store!.connections, connection];
      const wasActive = store!.activeId === connection.id || !store!.activeId;
      const currentModel = store!.activeModel;
      apply({
        connections,
        activeId: store!.activeId ?? connection.id,
        activeModel: wasActive
          ? models.includes(currentModel ?? "")
            ? currentModel
            : models[0]
          : store!.activeModel,
      });
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Key check failed");
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    const connections = store!.connections.filter((c) => c.id !== id);
    const nextActive =
      store!.activeId === id
        ? (connections[0]?.id ?? null)
        : store!.activeId;
    apply({
      connections,
      activeId: nextActive,
      activeModel:
        store!.activeId === id
          ? (connections[0]?.models?.[0] ?? null)
          : store!.activeModel,
    });
  }

  return (
    <section className="calm-card p-6 sm:p-8">
      <h2 className="font-serif-calm text-[24px]">AI providers</h2>
      <p className="mt-1 text-[13px] text-black/55">
        Add a key once here. Saving fetches the provider&apos;s model list; the
        job panel lets you choose from those models. Keys stay in this browser
        and travel per request — never stored or logged on the server.
      </p>

      <div className="mt-5 space-y-2">
        <label className="flex items-center justify-between gap-3 rounded-[14px] border border-black/10 px-4 py-3 text-[13px]">
          <span>
            <span className="font-medium">Server default</span>
            <span className="block text-[12px] text-black/45">
              Operator-configured provider
            </span>
          </span>
          <input
            type="radio"
            name="active-provider"
            checked={store.activeId === null}
            onChange={() =>
              apply({ ...store, activeId: null, activeModel: null })
            }
            className="control-radio"
          />
        </label>

        {store.connections.map((connection) => (
          <div
            key={connection.id}
            className="flex items-center justify-between gap-3 rounded-[14px] border border-black/10 px-4 py-3 text-[13px]"
          >
            <label className="flex items-center gap-3 min-w-0">
              <input
                type="radio"
                name="active-provider"
                checked={store.activeId === connection.id}
                onChange={() =>
                  apply({
                    ...store,
                    activeId: connection.id,
                    activeModel: connection.models?.[0] ?? null,
                  })
                }
                className="control-radio"
              />
              <span className="min-w-0">
                <span className="font-medium truncate block">
                  {connection.label}
                </span>
                <span className="text-[12px] text-black/45 truncate block">
                  {connection.models?.length ?? 0} models · {maskKey(connection.key)}
                </span>
              </span>
            </label>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => startEdit(connection)}
                className="text-[12px] text-black/50 underline underline-offset-4 hover:text-black"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(connection.id)}
                className="text-[12px] text-black/50 underline underline-offset-4 hover:text-black"
              >
                Remove
              </button>
            </span>
          </div>
        ))}
      </div>

      {draft ? (
        <div className="mt-5 rounded-[16px] border border-black/10 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif-calm text-[20px]">
              {draft.id ? "Edit provider" : "Add provider"}
            </h3>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className="text-[12px] text-black/50 underline underline-offset-4"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="provider-preset">
                Preset
              </label>
              <select
                id="provider-preset"
                className={`${inputClass} mt-2`}
                value={draft.presetId}
                onChange={(e) => {
                  const preset = LLM_PRESETS.find(
                    (p) => p.id === e.target.value,
                  );
                  setDraft({
                    ...draft,
                    presetId: e.target.value,
                    label: preset?.label ?? draft.label,
                    baseUrl: preset?.baseUrl ?? draft.baseUrl,
                    api: preset?.api,
                  });
                }}
              >
                {LLM_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="provider-label">
                Label
              </label>
              <input
                id="provider-label"
                className={`${inputClass} mt-2`}
                value={draft.label}
                onChange={(e) =>
                  setDraft({ ...draft, label: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="provider-base-url">
              Base URL
            </label>
            <input
              id="provider-base-url"
              className={`${inputClass} mt-2`}
              value={draft.baseUrl}
              onChange={(e) =>
                setDraft({ ...draft, baseUrl: e.target.value })
              }
              placeholder="https://…/v1"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="provider-key">
              API key
            </label>
            <input
              id="provider-key"
              type="password"
              autoComplete="off"
              className={`${inputClass} mt-2`}
              value={draft.key}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              placeholder={
                draft.id
                  ? "Leave blank to keep the existing key"
                  : "Paste the provider API key"
              }
            />
          </div>

          {error && <p className="text-[13px] text-red-700/80">{error}</p>}

          <button
            type="button"
            onClick={testAndSave}
            disabled={busy}
            className="rounded-full bg-[#111] px-5 py-2.5 text-[13px] font-medium text-white transition-opacity duration-300 hover:opacity-85 disabled:opacity-50"
          >
            {busy ? "Finding models…" : "Save & find models"}
          </button>
          <p className="text-[11px] text-black/45">
            The model list comes from the provider. No model id is typed here.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => startEdit()}
          className="mt-5 calm-pill"
        >
          Add provider
        </button>
      )}

      {saved && !draft && (
        <p className="mt-3 text-[13px] text-black/55" role="status">
          Provider saved. Pick one of its models in the job panel.
        </p>
      )}
    </section>
  );
}
