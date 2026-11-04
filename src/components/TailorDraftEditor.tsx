"use client";

import { useState } from "react";

export type DraftField = string | boolean | string[];

export type DraftSection = {
  id: string;
  type: string;
  title: string;
  items: {
    id: string;
    kind: string;
    fields: Record<string, DraftField>;
    provenance: { sourceIds: string[]; change: string };
  }[];
};

export type DraftView = {
  id: string;
  version?: number;
  versionCount?: number;
  status: "DRAFT" | "APPROVED";
  warnings: string[];
  sections: DraftSection[];
};

const labelClass =
  "block text-[10px] uppercase tracking-[0.12em] text-black/40";

const inputClass =
  "w-full bg-white border border-black/10 rounded-[10px] px-3 py-2 text-[13px] outline-none focus:border-black/30 transition-colors duration-300";

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ─── Editable tailored resume ───────────────────────────────────────────────
// Tsenta-style: the model output is a draft. Every field can be edited, the
// user approves, and only then can a PDF render.

export function TailorDraftEditor({
  jobId,
  draft,
  onUpdated,
}: {
  jobId: string;
  draft: DraftView;
  onUpdated: (draft: DraftView) => void;
}) {
  const [sections, setSections] = useState<DraftSection[]>(draft.sections);
  const [status, setStatus] = useState<"DRAFT" | "APPROVED">(draft.status);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const editing = status === "DRAFT";

  function patchSection(index: number, patch: Partial<DraftSection>) {
    setSections((prev) =>
      prev.map((section, i) =>
        i === index ? { ...section, ...patch } : section,
      ),
    );
    setSaved(false);
  }

  function patchField(
    sectionIndex: number,
    itemIndex: number,
    key: string,
    value: DraftField,
  ) {
    setSections((prev) =>
      prev.map((section, si) =>
        si !== sectionIndex
          ? section
          : {
              ...section,
              items: section.items.map((item, ii) =>
                ii === itemIndex
                  ? { ...item, fields: { ...item.fields, [key]: value } }
                  : item,
              ),
            },
      ),
    );
    setSaved(false);
  }

  async function persist(): Promise<DraftView | null> {
    const res = await fetch(`/api/jobs/${jobId}/tailor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Save failed");
    setStatus("DRAFT");
    onUpdated({ ...data, sections: data.sections ?? sections });
    return data as DraftView;
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await persist();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      // Persist the current edits first so approval locks what the user sees.
      await persist();
      const res = await fetch(`/api/jobs/${jobId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      setStatus("APPROVED");
      onUpdated({ ...data, sections: data.sections ?? sections });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  function reopen() {
    // Local-only: the stored row stays APPROVED (and the PDF stays valid)
    // until the user actually saves an edit or approves again.
    setStatus("DRAFT");
    setSaved(false);
    setError(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] uppercase tracking-[0.12em] border ${
            status === "APPROVED"
              ? "border-black/10 text-black/60"
              : "border-black/30 text-black"
          }`}
        >
          {status === "APPROVED" ? "Approved" : "Draft · editable"}
        </span>
        <span className="text-[11px] text-black/40">
          {editing ? "Click any field to edit" : "Read-only"}
        </span>
      </div>

      {draft.warnings.length > 0 && status === "DRAFT" && (
        <div className="rounded-[12px] border border-amber-600/20 bg-amber-50/60 p-3 text-[12px] text-amber-900/80 space-y-1">
          <p className="font-medium">Review these before approving:</p>
          {draft.warnings.slice(0, 6).map((warning) => (
            <p key={warning}>· {warning}</p>
          ))}
        </div>
      )}

      {sections.map((section, si) => (
        <div
          key={section.id}
          className="rounded-[14px] border border-black/10 bg-white p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            {editing ? (
              <input
                aria-label={`Section title ${si + 1}`}
                className="font-serif-calm text-[18px] bg-transparent border-b border-transparent focus:border-black/20 outline-none flex-1"
                value={section.title}
                onChange={(e) => patchSection(si, { title: e.target.value })}
              />
            ) : (
              <h4 className="font-serif-calm text-[18px] flex-1">
                {section.title}
              </h4>
            )}
            {editing && (
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setSections((prev) => move(prev, si, si - 1))}
                  className="text-[11px] text-black/45 hover:text-black"
                  aria-label={`Move ${section.title} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => setSections((prev) => move(prev, si, si + 1))}
                  className="text-[11px] text-black/45 hover:text-black"
                  aria-label={`Move ${section.title} down`}
                >
                  ↓
                </button>
              </span>
            )}
          </div>

          {section.items.map((item, ii) => (
            <div
              key={item.id}
              className="space-y-2 border-t border-black/[0.06] pt-2"
            >
              {Object.entries(item.fields).map(([key, value]) => {
                const id = `${section.id}-${item.id}-${key}`;
                if (typeof value === "boolean") {
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-[12px] text-black/60"
                    >
                      <input
                        type="checkbox"
                        checked={value}
                        disabled={!editing}
                        onChange={(e) =>
                          patchField(si, ii, key, e.target.checked)
                        }
                        className="control-checkbox"
                      />
                      {key}
                    </label>
                  );
                }
                const text = Array.isArray(value) ? value.join("\n") : value;
                return (
                  <div key={key}>
                    <label className={labelClass} htmlFor={id}>
                      {key}
                    </label>
                    <textarea
                      id={id}
                      className={`${inputClass} mt-1 ${
                        editing ? "" : "bg-black/[0.02]"
                      }`}
                      rows={
                        Array.isArray(value)
                          ? Math.min(6, Math.max(2, value.length))
                          : key === "content" || key === "description"
                            ? 4
                            : 2
                      }
                      readOnly={!editing}
                      value={text}
                      onChange={(e) =>
                        patchField(
                          si,
                          ii,
                          key,
                          Array.isArray(value)
                            ? e.target.value
                                .split("\n")
                                .map((line) => line.trim())
                                .filter(Boolean)
                            : e.target.value,
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      {error && <p className="text-[13px] text-red-700/80">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="rounded-full border border-black/15 px-4 py-2 text-[13px] font-medium hover:border-black/40 transition-colors disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : saved ? "Saved" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={busy !== null}
              className="rounded-full bg-[#111] px-5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {busy === "approve" ? "Approving…" : "Approve resume"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={reopen}
            disabled={busy !== null}
            className="rounded-full border border-black/15 px-4 py-2 text-[13px] font-medium hover:border-black/40 transition-colors disabled:opacity-50"
          >
            Edit again
          </button>
        )}
      </div>
    </div>
  );
}
