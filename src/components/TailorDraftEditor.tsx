"use client";

import { useState } from "react";
import {
  ResumeDocument,
  type DraftField,
  type DraftSection,
  type ResumeProfileView,
} from "@/components/ResumeDocument";

export type { DraftField, DraftSection, ResumeProfileView };

export type DraftView = {
  id: string;
  version?: number;
  versionCount?: number;
  status: "DRAFT" | "APPROVED";
  warnings: string[];
  sections: DraftSection[];
};

// ─── Editable tailored resume ───────────────────────────────────────────────
// Tsenta-style: the model output is a real resume document. Click any text to
// edit it, save, then approve. Only approval unlocks PDF rendering.

export function TailorDraftEditor({
  jobId,
  draft,
  profile,
  onUpdated,
}: {
  jobId: string;
  draft: DraftView;
  profile: ResumeProfileView | null;
  onUpdated: (draft: DraftView) => void;
}) {
  const [sections, setSections] = useState<DraftSection[]>(draft.sections);
  const [status, setStatus] = useState<"DRAFT" | "APPROVED">(draft.status);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const editing = status === "DRAFT";

  function patchSectionTitle(index: number, title: string) {
    setSections((prev) =>
      prev.map((section, i) => (i === index ? { ...section, title } : section)),
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

  function patchBullet(
    sectionIndex: number,
    itemIndex: number,
    bulletIndex: number,
    value: string,
  ) {
    setSections((prev) =>
      prev.map((section, si) => {
        if (si !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.map((item, ii) => {
            if (ii !== itemIndex) return item;
            const bullets = [
              ...((item.fields.bulletPoints as string[] | undefined) ??
                (item.fields.bullets as string[] | undefined) ??
                []),
            ];
            bullets[bulletIndex] = value;
            return {
              ...item,
              fields: { ...item.fields, bulletPoints: bullets },
            };
          }),
        };
      }),
    );
    setSaved(false);
  }

  function addBullet(sectionIndex: number, itemIndex: number) {
    setSections((prev) =>
      prev.map((section, si) => {
        if (si !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.map((item, ii) => {
            if (ii !== itemIndex) return item;
            const bullets = [
              ...((item.fields.bulletPoints as string[] | undefined) ??
                (item.fields.bullets as string[] | undefined) ??
                []),
              "New bullet",
            ];
            return {
              ...item,
              fields: { ...item.fields, bulletPoints: bullets },
            };
          }),
        };
      }),
    );
    setSaved(false);
  }

  function removeBullet(
    sectionIndex: number,
    itemIndex: number,
    bulletIndex: number,
  ) {
    setSections((prev) =>
      prev.map((section, si) => {
        if (si !== sectionIndex) return section;
        return {
          ...section,
          items: section.items.map((item, ii) => {
            if (ii !== itemIndex) return item;
            const bullets = (
              (item.fields.bulletPoints as string[] | undefined) ??
              (item.fields.bullets as string[] | undefined) ??
              []
            ).filter((_, index) => index !== bulletIndex);
            return {
              ...item,
              fields: { ...item.fields, bulletPoints: bullets },
            };
          }),
        };
      }),
    );
    setSaved(false);
  }

  function patchSkills(
    sectionIndex: number,
    itemIndex: number,
    skills: string[],
  ) {
    patchField(sectionIndex, itemIndex, "skills", skills);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] uppercase tracking-[0.12em] border ${
              status === "APPROVED"
                ? "border-black/10 text-black/60"
                : "border-black/30 text-black"
            }`}
          >
            {status === "APPROVED" ? "Approved" : "Draft · editable"}
          </span>
          {draft.version && (
            <span className="text-[11px] text-black/40">v{draft.version}</span>
          )}
        </div>
        <span className="text-[11px] text-black/40">
          {editing ? "Click any text to edit" : "Read-only"}
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

      <ResumeDocument
        profile={profile}
        sections={sections}
        editable={editing}
        onChangeSectionTitle={patchSectionTitle}
        onChangeField={patchField}
        onChangeBullet={patchBullet}
        onAddBullet={addBullet}
        onRemoveBullet={removeBullet}
        onChangeSkills={patchSkills}
      />

      {error && <p className="text-[13px] text-red-700/80">{error}</p>}

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {editing ? (
          <>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="rounded-full border border-black/15 px-5 py-2.5 text-[13px] font-medium hover:border-black/40 transition-colors disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : saved ? "Saved" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={busy !== null}
              className="rounded-full bg-[#111] px-6 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {busy === "approve" ? "Approving…" : "Approve resume"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={reopen}
            disabled={busy !== null}
            className="rounded-full border border-black/15 px-5 py-2.5 text-[13px] font-medium hover:border-black/40 transition-colors disabled:opacity-50"
          >
            Edit again
          </button>
        )}
      </div>
    </div>
  );
}
