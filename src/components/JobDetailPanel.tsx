"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Briefcase, FileText } from "lucide-react";
import type { JobSearchResult } from "@/lib/types";
import { formatDaysAgo, formatSalary, enumLabel } from "@/lib/utils";

// ─── Job detail modal ────────────────────────────────────────────────────────
// The modal is a compact job card. Analysis, tailoring, resume editing, and
// approval live in the full-screen application workspace at /apply/[id].

interface TailoredSummary {
  id: string;
  version: number;
  status: "DRAFT" | "APPROVED";
  warnings: string[];
  sections: unknown[];
}

interface AnalysisSummary {
  verdict: "STRONG" | "POSSIBLE" | "WEAK";
  summary: string;
}

export function JobDetailPanel({
  jobs,
  selectedId,
  onClose,
}: {
  jobs: JobSearchResult[];
  selectedId: string;
  onClose: () => void;
}) {
  const job = useMemo(
    () => jobs.find((item) => item.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [tailored, setTailored] = useState<TailoredSummary | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [liveness, setLiveness] = useState<{
    alive: boolean;
    evidence: string | null;
  } | null>(null);
  const [checkingLive, setCheckingLive] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration gate; this component is client-only
    setMounted(true);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- reset when selection changes */
  useEffect(() => {
    setAnalysis(null);
    setTailored(null);
    setDecision(null);
    setLiveness(null);
    setShowFullDesc(false);
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/jobs/${selectedId}/state`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAnalysis(data.analysis ?? null);
        setTailored(data.tailored ?? null);
        if (data.decision?.status) setDecision(data.decision.status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function setJobDecision(status: string) {
    if (!selectedId || deciding) return;
    setDeciding(true);
    try {
      const res = await fetch(`/api/jobs/${selectedId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Decision failed");
      setDecision(data.status);
    } catch {
      // The workspace and tracker remain available; no destructive fallback.
    } finally {
      setDeciding(false);
    }
  }

  async function checkLiveness() {
    if (!selectedId || checkingLive) return;
    setCheckingLive(true);
    try {
      const res = await fetch(`/api/jobs/${selectedId}/liveness`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) setLiveness(data);
    } catch {
      // Keep the last known state.
    } finally {
      setCheckingLive(false);
    }
  }

  if (!job) return null;

  const workModeLabel =
    job.workMode === "REMOTE"
      ? "Remote"
      : job.workMode === "HYBRID"
        ? "Hybrid"
        : "On-site";
  const resumeStatus = tailored?.status ?? null;

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 flex items-center justify-between gap-4 px-6 py-5 border-b border-black/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#111] text-white grid place-items-center text-[12px] font-semibold shrink-0">
            {job.company.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] text-black/45">
              Job detail
            </div>
            <div className="text-[13px] font-medium truncate">
              {job.company.name}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close job detail"
          className="w-9 h-9 rounded-full border border-black/15 grid place-items-center text-black/50 hover:text-black hover:border-black/35 transition-colors"
        >
          ×
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-7 space-y-7">
        <section>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] border border-black/10 rounded-full px-2.5 py-1 text-black/55">
              {enumLabel(job.company.companyType)}
            </span>
            <span className="text-[11px] text-black/45">
              {job.source} · {formatDaysAgo(job.postedAt)}
            </span>
          </div>
          <h1 className="font-serif-calm text-[38px] leading-[1.02] mt-3">
            {job.title}
          </h1>
          <div className="text-[14px] font-semibold text-black/55 mt-1">
            {job.company.name}
          </div>
          <div className="text-[12px] text-black/55 mt-2">
            {[
              job.location,
              workModeLabel,
              formatSalary(
                job.salaryMin ?? undefined,
                job.salaryMax ?? undefined,
                job.salaryCurr ?? undefined,
              ),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </section>

        <section>
          <h2 className="font-serif-calm text-[22px] mb-3">Role facts</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {(
              [
                ["Level", enumLabel(job.experience ?? "ENTRY")],
                ["Type", job.jobType ? enumLabel(job.jobType) : null],
                ["Work mode", workModeLabel],
                ["Location", job.location ?? null],
                ["Source", enumLabel(job.source)],
                ["Posted", formatDaysAgo(job.postedAt)],
              ] as [string, string | null][]
            ).map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-black/40">
                    {label}
                  </dt>
                  <dd className="text-[13px] mt-0.5">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </section>

        {job.skills.length > 0 && (
          <section>
            <h2 className="font-serif-calm text-[22px] mb-3">Skills</h2>
            <div className="flex flex-wrap gap-1.5">
              {job.skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-black/60"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-serif-calm text-[22px]">About</h2>
            <button
              type="button"
              onClick={() => setShowFullDesc((open) => !open)}
              className="text-[11px] text-black/50 underline underline-offset-4 hover:text-black"
            >
              {showFullDesc ? "Show less" : "Read full posting"}
            </button>
          </div>
          <p
            className={`text-[13px] leading-relaxed text-black/65 mt-3 whitespace-pre-line ${
              showFullDesc ? "" : "line-clamp-[8]"
            }`}
          >
            {job.description}
          </p>
        </section>

        <section className="rounded-[18px] border border-black/10 bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-full bg-black/[0.04] grid place-items-center shrink-0">
              <Briefcase className="w-3.5 h-3.5 text-black/50" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-serif-calm text-[22px]">Application</h2>
              <p className="text-[12px] text-black/55 mt-1">
                Analysis, tailoring, editing, approval, and the apply handoff
                happen in the workspace. The resume gets the full screen.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {analysis && (
                  <span className="rounded-full border border-black/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-black/55">
                    AI {analysis.verdict.toLowerCase()}
                  </span>
                )}
                <span className="rounded-full border border-black/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-black/55">
                  {resumeStatus === "APPROVED"
                    ? `Resume approved · v${tailored?.version ?? 1}`
                    : resumeStatus === "DRAFT"
                      ? `Resume draft · v${tailored?.version ?? 1}`
                      : "Resume not started"}
                </span>
                {tailored && tailored.warnings.length > 0 && (
                  <span className="rounded-full border border-amber-600/20 bg-amber-50 px-2.5 py-1 text-[10px] text-amber-900/80">
                    {tailored.warnings.length} warning
                    {tailored.warnings.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <Link
                href={`/apply/${job.id}`}
                className="inline-flex items-center justify-center gap-2 mt-4 w-full rounded-full bg-[#111] text-white px-5 py-3 text-[13px] font-medium hover:opacity-85 transition-opacity"
              >
                <FileText className="w-4 h-4" />
                {tailored ? "Continue application" : "Review & tailor resume"}
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-t border-black/10 bg-white px-6 py-4 space-y-3">
        {(decision || liveness) && (
          <div className="flex flex-wrap items-center gap-2">
            {decision && (
              <span
                data-testid="decision-badge"
                className="rounded-full bg-[#111] text-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
              >
                {decision}
              </span>
            )}
            {liveness && (
              <span
                className={`rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  liveness.alive ? "text-green-700" : "text-red-600"
                }`}
                title={liveness.evidence ?? undefined}
              >
                {liveness.alive ? "● Live" : "● Closed?"}
              </span>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setJobDecision("QUEUED")}
            disabled={!mounted || deciding}
            className="flex-1 rounded-full border border-black/10 px-3 py-2 text-[12px] font-medium hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
          >
            Queue
          </button>
          <button
            onClick={() => setJobDecision("SAVED")}
            disabled={!mounted || deciding}
            className="flex-1 rounded-full border border-black/10 px-3 py-2 text-[12px] font-medium hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => setJobDecision("SKIPPED")}
            disabled={!mounted || deciding}
            className="flex-1 rounded-full border border-black/10 px-3 py-2 text-[12px] font-medium hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={checkLiveness}
            disabled={!mounted || checkingLive}
            className="flex-1 rounded-full border border-black/10 px-3 py-2 text-[12px] font-medium hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
          >
            {checkingLive ? "Checking…" : "Check live"}
          </button>
        </div>
        <p className="text-[11px] text-black/45">
          The company application opens from the workspace after you approve the
          resume.
        </p>
      </footer>
    </div>
  );
}
