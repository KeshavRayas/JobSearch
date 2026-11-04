"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  FileText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  ResumeDocument,
  type DraftSection,
  type ResumeProfileView,
} from "@/components/ResumeDocument";
import type { ResumeData } from "@/lib/resume.types";
import { buildResumeDiff } from "@/lib/tailor/diff";
import { enumLabel } from "@/lib/utils";
import {
  activeConnection,
  activeModelFor,
  loadLlmStore,
  saveLlmStore,
  subscribeLlmStore,
  llmHeaders,
  type LlmStore,
} from "@/lib/llm/client";

type QueueItem = {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  status: string;
};

type WorkspaceData = {
  job: {
    id: string;
    title: string;
    description: string;
    applyUrl: string;
    location: string | null;
    workMode: string;
    jobType: string | null;
    experience: string | null;
    source: string;
    postedAt: string | null;
    skills: string[];
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurr: string | null;
    company: { name: string; slug: string; companyType: string };
  };
  analysis: {
    summary: string;
    verdict: "STRONG" | "POSSIBLE" | "WEAK";
    requiredSkills: string[];
    matchedSkills: string[];
    missingSkills: string[];
    verdictReasons: string[];
    potentialConcerns: string[];
  } | null;
  tailored: {
    id: string;
    version: number;
    status: "DRAFT" | "APPROVED";
    warnings: string[];
    sections: DraftSection[];
    renderStatus?: "PENDING" | "SUCCESS" | "FAILED";
    atsStatus?: "PENDING" | "CHECKED";
    atsResult?: {
      keywordCoverage: number;
      requiredSkillsFound: number;
      requiredSkillsTotal: number;
      warnings: string[];
    } | null;
  } | null;
  base: { id: string; title: string; content: ResumeData } | null;
  decision: { status: string } | null;
  profile: ResumeProfileView | null;
  queue: QueueItem[];
};

type Mode = "changes" | "edit" | "final";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  QUEUED: "Queued",
  OPENED: "Opened",
  APPLIED: "Applied",
  SAVED: "Saved",
  SKIPPED: "Skipped",
};

function statusOf(data: WorkspaceData): string {
  if (data.decision?.status === "APPLIED") return "APPLIED";
  if (data.decision?.status === "OPENED") return "OPENED";
  if (data.tailored?.status) return data.tailored.status;
  return "QUEUED";
}

function scoreFor(data: WorkspaceData): number {
  const analysis = data.analysis;
  if (!analysis) return 0;
  const required = analysis.requiredSkills.length || 1;
  return Math.round(
    (Math.min(analysis.matchedSkills.length, required) / required) * 100,
  );
}

export function ApplyWorkspace({ jobId }: { jobId: string }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [sections, setSections] = useState<DraftSection[]>([]);
  const [mode, setMode] = useState<Mode>("changes");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [revertOpen, setRevertOpen] = useState(false);
  const [llmStore, setLlmStore] = useState<LlmStore>({
    connections: [],
    activeId: null,
    activeModel: null,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; sync after hydration
    setLlmStore(loadLlmStore());
    return subscribeLlmStore(() => setLlmStore(loadLlmStore()));
  }, []);

  const activeLlm = activeConnection(llmStore);
  const activeModel = activeModelFor(llmStore);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/state`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load workspace");
      const workspace = json as WorkspaceData;
      setData(workspace);
      setSections(workspace.tailored?.sections ?? []);
      setMode(workspace.tailored ? "changes" : "edit");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load workspace");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial server fetch; state updates are async
    void load();
  }, [load]);

  const diff = data?.base?.content
    ? buildResumeDiff(data.base.content, { sections })
    : {};

  const decisionStatus = data ? statusOf(data) : "QUEUED";
  const approved = data?.tailored?.status === "APPROVED";
  const applied = data?.decision?.status === "APPLIED";

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
    value: string | boolean | string[],
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

  async function saveDraft(): Promise<boolean> {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/tailor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setData((prev) =>
        prev && prev.tailored
          ? {
              ...prev,
              tailored: {
                ...prev.tailored,
                sections: json.sections ?? sections,
                status: "DRAFT",
                warnings: json.warnings ?? [],
              },
            }
          : prev,
      );
      setSaved(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function prepareResume() {
    if (!data || busy) return;
    setBusy("prepare");
    setError(null);
    try {
      if (!data.analysis) {
        const analyze = await fetch(`/api/jobs/${jobId}/analyze`, {
          method: "POST",
          headers: llmHeaders(activeLlm, activeModel),
        });
        const analyzed = await analyze.json();
        if (!analyze.ok) {
          throw new Error(analyzed.error ?? "Analysis failed");
        }
      }
      const tailor = await fetch(`/api/jobs/${jobId}/tailor`, {
        method: "POST",
        headers: llmHeaders(activeLlm, activeModel),
      });
      const tailored = await tailor.json();
      if (!tailor.ok) throw new Error(tailored.error ?? "Tailoring failed");
      await load();
      setMode("changes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume failed");
    } finally {
      setBusy(null);
    }
  }

  async function approveResume() {
    if (!data?.tailored || busy) return;
    setBusy("approve");
    setError(null);
    try {
      if (!saved) {
        const ok = await saveDraft();
        if (!ok) return;
      }
      const res = await fetch(`/api/jobs/${jobId}/approve`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Approve failed");
      await load();
      setMode("changes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(null);
    }
  }

  async function revertToBase() {
    if (busy) return;
    setBusy("revert");
    setError(null);
    setRevertOpen(false);
    try {
      const res = await fetch(`/api/jobs/${jobId}/revert`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Revert failed");
      await load();
      setMode("edit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revert failed");
    } finally {
      setBusy(null);
    }
  }

  async function renderPdf() {
    if (!approved || busy) return;
    setBusy("pdf");
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/pdf`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "PDF failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setBusy(null);
    }
  }

  async function decide(status: "OPENED" | "APPLIED") {
    if (!data || busy) return;
    setBusy("decision");
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Decision failed");
      if (status === "OPENED") {
        window.open(data.job.applyUrl, "_blank", "noopener");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] grid place-items-center">
        <div className="text-center">
          <div className="font-serif-calm text-3xl">Opening workspace.</div>
          <p className="mt-2 text-[13px] text-black/50">
            Loading the job, resume, and queue…
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] grid place-items-center px-6">
        <div className="text-center max-w-sm">
          <div className="font-serif-calm text-3xl">Workspace unavailable.</div>
          <p className="mt-2 text-[13px] text-black/50">
            {error ?? "This job could not be loaded."}
          </p>
          <Link
            href="/"
            className="inline-block mt-5 rounded-full border border-black/15 px-5 py-2 text-[13px] hover:border-black/40"
          >
            Back to jobs
          </Link>
        </div>
      </div>
    );
  }

  const required = data.analysis?.requiredSkills ?? [];
  const matched = new Set(data.analysis?.matchedSkills ?? []);
  const missing = new Set(data.analysis?.missingSkills ?? []);
  const score = scoreFor(data);

  return (
    <div className="h-screen bg-[#FAFAF7] text-[#111] flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-b border-black/10 bg-[#FAFAF7]">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="font-serif-calm text-xl shrink-0">
            Job Search
          </Link>
          <span className="text-black/20">/</span>
          <Link
            href="/"
            className="text-[12px] text-black/50 hover:text-black flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Jobs
          </Link>
          <span className="text-black/20">/</span>
          <span className="text-[12px] font-medium truncate">
            {data.job.company.name} · {data.job.title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-black/55">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1f6b45]" />
            {activeModel ?? "Server default"}
          </span>
          <Link
            href="/settings"
            className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] text-black/55 hover:border-black/30"
          >
            Settings
          </Link>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_300px_minmax(0,1fr)]">
        <aside className="hidden lg:flex flex-col border-r border-black/10 bg-white/40 min-h-0">
          <div className="px-4 pt-4 pb-2 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.13em] text-black/45">
              Apply queue
            </span>
            <span className="text-[11px] text-black/35">
              {data.queue.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {data.queue.map((item) => {
              const selected = item.id === jobId;
              return (
                <Link
                  key={item.id}
                  href={`/apply/${item.id}`}
                  className={`block rounded-[12px] px-3 py-2.5 mb-1 border transition-colors ${
                    selected
                      ? "bg-white border-black/20"
                      : "border-transparent hover:bg-white/70"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-[0.1em] text-black/45 truncate">
                    {item.companyName}
                  </div>
                  <div className="font-serif-calm text-[17px] leading-tight mt-0.5">
                    {item.title}
                  </div>
                  <div className="text-[9px] uppercase tracking-[0.08em] text-black/35 mt-1">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-black/10 text-[11px] text-black/45">
            One at a time. Everything visible.
            <Link
              href="/"
              className="block mt-1 underline underline-offset-4 text-black/70"
            >
              Back to job list →
            </Link>
          </div>
        </aside>

        <section className="hidden lg:flex flex-col min-h-0 border-r border-black/10 bg-white/60 overflow-y-auto">
          <div className="p-5">
            <div className="text-[10px] uppercase tracking-[0.13em] text-black/45">
              {enumLabel(data.job.experience ?? "ENTRY")} · {data.job.location}
            </div>
            <h1 className="font-serif-calm text-[32px] leading-[1.02] mt-1.5">
              {data.job.title}
            </h1>
            <div className="text-[12px] font-semibold text-black/55 mt-1">
              {data.job.company.name}
            </div>

            <div className="flex items-center gap-4 mt-6">
              <div
                className="w-[76px] h-[76px] rounded-full grid place-items-center shrink-0"
                style={{
                  background: `conic-gradient(#111 0 ${score}%, rgba(17,17,17,.09) ${score}% 100%)`,
                }}
              >
                <div className="w-[64px] h-[64px] rounded-full bg-white grid place-items-center font-serif-calm text-2xl">
                  {score}%
                </div>
              </div>
              <div>
                <div className="text-[12px] font-semibold">
                  {data.analysis?.verdict === "STRONG"
                    ? "Strong match"
                    : data.analysis?.verdict === "POSSIBLE"
                      ? "Possible match"
                      : data.analysis
                        ? "Weak match"
                        : "Not analyzed"}
                </div>
                <div className="text-[11px] text-black/50 mt-1 leading-snug">
                  {data.analysis
                    ? `${matched.size} matched · ${missing.size} gaps`
                    : "Run the analysis to see fit."}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.12em] text-black/45">
                <span>Required</span>
                <span className="normal-case tracking-normal text-black/60">
                  {data.analysis
                    ? `${data.analysis.matchedSkills.length} / ${required.length}`
                    : "—"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {required.slice(0, 12).map((skill) => (
                  <span
                    key={skill}
                    className={`rounded-full border px-2 py-1 text-[10px] ${
                      matched.has(skill)
                        ? "border-[#a7d8bd] bg-[#e9f5ee] text-[#1f6b45]"
                        : "border-black/10 bg-white text-black/55"
                    }`}
                  >
                    {skill}
                  </span>
                ))}
                {required.length === 0 && (
                  <span className="text-[11px] text-black/40">
                    No required skills recorded.
                  </span>
                )}
              </div>
            </div>

            {data.analysis?.summary && (
              <div className="mt-5 pt-4 border-t border-black/10">
                <div className="text-[10px] uppercase tracking-[0.12em] text-black/45">
                  AI analysis
                </div>
                <p className="text-[12px] leading-relaxed text-black/60 mt-2">
                  {data.analysis.summary}
                </p>
                {data.analysis.verdictReasons.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] text-black/55">
                    {data.analysis.verdictReasons.slice(0, 3).map((reason) => (
                      <li key={reason}>· {reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-black/10 space-y-2">
              <label className="block text-[10px] uppercase tracking-[0.12em] text-black/45">
                Model
                <select
                  value={
                    activeLlm && activeModel
                      ? `${activeLlm.id}::${activeModel}`
                      : ""
                  }
                  onChange={(e) => {
                    const [connectionId, ...rest] = e.target.value.split("::");
                    const model = rest.join("::");
                    const next = connectionId
                      ? {
                          ...llmStore,
                          activeId: connectionId,
                          activeModel: model,
                        }
                      : { ...llmStore, activeId: null, activeModel: null };
                    saveLlmStore(next);
                    setLlmStore(next);
                  }}
                  className="mt-1 w-full bg-white border border-black/10 rounded-[10px] px-2.5 py-2 text-[11px] normal-case tracking-normal outline-none focus:border-black/30"
                >
                  <option value="">Server default</option>
                  {llmStore.connections.map((connection) =>
                    (connection.models ?? []).map((model) => (
                      <option
                        key={`${connection.id}::${model}`}
                        value={`${connection.id}::${model}`}
                      >
                        {connection.label} · {model}
                      </option>
                    )),
                  )}
                </select>
              </label>
              <button
                type="button"
                onClick={prepareResume}
                disabled={busy !== null}
                className="w-full rounded-full bg-[#111] text-white px-4 py-2.5 text-[11px] font-medium disabled:opacity-50"
              >
                {busy === "prepare"
                  ? "Preparing resume…"
                  : data.tailored
                    ? "Re-tailor for this job"
                    : "Analyze & tailor resume"}
              </button>
              <p className="text-[10px] text-black/40 leading-snug">
                Analysis and tailoring spend one model call each. The PDF is
                generated locally.
              </p>
            </div>
          </div>
        </section>

        <section className="min-w-0 min-h-0 flex flex-col bg-[#f3f3ef]">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-black/10 bg-[#FAFAF7]">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold">Resume</span>
              <span className="rounded-full border border-black/15 bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.07em]">
                {STATUS_LABEL[decisionStatus] ?? decisionStatus}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-[9px] text-black/45">
                <span>
                  <i className="inline-block w-2 h-2 rounded-[2px] bg-[#e9f5ee] border border-[#a7d8bd] mr-1" />
                  added / rewritten
                </span>
                <span>
                  <i className="inline-block w-2 h-2 rounded-[2px] bg-[#fbebeb] border border-[#e7baba] mr-1" />
                  removed
                </span>
              </div>
              <div className="flex rounded-full border border-black/15 overflow-hidden bg-white">
                {(["changes", "edit", "final"] as Mode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMode(item)}
                    className={`px-2.5 py-1 text-[9px] font-medium capitalize ${
                      mode === item
                        ? "bg-[#111] text-white"
                        : "text-black/50 hover:text-black"
                    }`}
                  >
                    {item === "changes"
                      ? "Changes"
                      : item === "edit"
                        ? "Edit"
                        : "Final"}
                  </button>
                ))}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRevertOpen((open) => !open)}
                  className="text-[10px] text-black/50 underline underline-offset-4 hover:text-[#8c2f2f]"
                >
                  Revert to base
                </button>
                {revertOpen && (
                  <div className="absolute right-0 top-8 z-20 w-[292px] rounded-[14px] border border-black/15 bg-white p-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,.3)]">
                    <div className="text-[12px] font-semibold">
                      Restore the base resume?
                    </div>
                    <p className="text-[10px] text-black/55 mt-1 leading-relaxed">
                      Creates a new draft from your base resume and discards the
                      tailored edits for this job. Previous versions stay in
                      history.
                    </p>
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => setRevertOpen(false)}
                        className="rounded-full border border-black/15 px-3 py-1.5 text-[10px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={revertToBase}
                        disabled={busy !== null}
                        className="rounded-full bg-[#111] text-white px-3 py-1.5 text-[10px] disabled:opacity-50"
                      >
                        {busy === "revert" ? "Restoring…" : "Restore base"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-[10px] border border-red-700/20 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {error}
            </div>
          )}

          {data.tailored &&
            data.tailored.warnings.length > 0 &&
            mode !== "final" && (
              <div className="mx-4 mt-3 rounded-[10px] border border-amber-600/20 bg-amber-50/70 px-3 py-2 text-[10px] text-amber-900/80">
                <b className="font-semibold">Review before approving:</b>{" "}
                {data.tailored.warnings.slice(0, 3).join(" · ")}
              </div>
            )}

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {data.tailored ? (
              <ResumeDocument
                profile={data.profile}
                sections={sections}
                editable={mode === "edit"}
                mode={mode}
                diff={diff}
                onChangeSectionTitle={patchSectionTitle}
                onChangeField={patchField}
                onChangeBullet={patchBullet}
                onAddBullet={addBullet}
                onRemoveBullet={removeBullet}
                onChangeSkills={patchSkills}
                onRestoreSummary={(si, ii, value) =>
                  patchField(si, ii, "content", value)
                }
                onRestoreBullet={(si, ii, bi, value) =>
                  patchBullet(si, ii, bi, value)
                }
              />
            ) : (
              <div className="h-full min-h-[420px] grid place-items-center text-center px-6">
                <div className="max-w-sm">
                  <FileText className="w-6 h-6 mx-auto text-black/30" />
                  <div className="font-serif-calm text-3xl mt-3">
                    No resume draft yet.
                  </div>
                  <p className="text-[12px] text-black/50 mt-2">
                    Analyze this job and tailor your base resume. The draft will
                    appear here as a document you can edit.
                  </p>
                  <button
                    type="button"
                    onClick={prepareResume}
                    disabled={busy !== null}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#111] text-white px-5 py-2.5 text-[12px] font-medium disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {busy === "prepare"
                      ? "Preparing…"
                      : "Analyze & tailor resume"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-black/10 bg-[#FAFAF7]">
            <p className="text-[10px] text-black/45 max-w-md">
              {applied
                ? "Applied. The tracker keeps this job under Applied."
                : approved
                  ? "Approved. Open the company page, submit there, then confirm I’ve applied."
                  : "Approve to unlock the company application link. Green and red are review-only; the PDF is clean."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {mode === "edit" && (
                <button
                  type="button"
                  onClick={saveDraft}
                  disabled={busy !== null || saved}
                  className="rounded-full border border-black/15 bg-white px-4 py-2 text-[11px] font-medium hover:border-black/40 disabled:opacity-50"
                >
                  {busy === "save" ? "Saving…" : saved ? "Saved" : "Save draft"}
                </button>
              )}
              {data.tailored && !approved && (
                <button
                  type="button"
                  onClick={approveResume}
                  disabled={busy !== null}
                  className="rounded-full bg-[#111] text-white px-5 py-2 text-[11px] font-medium disabled:opacity-50"
                >
                  {busy === "approve" ? "Approving…" : "Approve resume"}
                </button>
              )}
              {approved && (
                <>
                  <button
                    type="button"
                    onClick={renderPdf}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-4 py-2 text-[11px] font-medium hover:border-black/40 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {busy === "pdf"
                      ? "Rendering…"
                      : data.tailored?.renderStatus === "SUCCESS"
                        ? "Re-render PDF"
                        : "Render PDF"}
                  </button>
                  {data.tailored?.renderStatus === "SUCCESS" && (
                    <a
                      href={`/api/jobs/${jobId}/pdf/download`}
                      className="rounded-full border border-black/15 bg-white px-4 py-2 text-[11px] font-medium hover:border-black/40"
                    >
                      Download
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => decide("OPENED")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#111] text-white px-5 py-2 text-[11px] font-medium disabled:opacity-50"
                  >
                    Open application
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              {approved && !applied && (
                <button
                  type="button"
                  onClick={() => decide("APPLIED")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-4 py-2 text-[11px] font-medium hover:border-black/40 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  I’ve applied
                </button>
              )}
              {applied && (
                <span className="rounded-full border border-[#a7d8bd] bg-[#e9f5ee] px-4 py-2 text-[11px] font-semibold text-[#1f6b45]">
                  Applied
                </span>
              )}
              {mode !== "edit" && data.tailored && (
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-4 py-2 text-[11px] font-medium hover:border-black/40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Edit resume
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
