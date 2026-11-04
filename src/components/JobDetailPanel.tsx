"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, ArrowUpRight, Briefcase, FileText, Sparkles } from "lucide-react";
import type { JobSearchResult } from "@/lib/types";
import { formatDaysAgo, formatSalary, enumLabel } from "@/lib/utils";
import {
  activeConnection,
  activeModelFor,
  loadLlmStore,
  saveLlmStore,
  subscribeLlmStore,
  llmHeaders,
  type LlmStore,
} from "@/lib/llm/client";
import { formatUsage } from "@/lib/llm/byok";

interface LlmCallMeta {
  usage?: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    model: string;
  } | null;
  provider?: { source: string; display: string; model: string | null } | null;
}

function UsageLine({ meta }: { meta: LlmCallMeta }) {
  if (!meta.usage) return null;
  return (
    <p className="text-[11px] text-black/45">
      {formatUsage(meta.usage)}
      {meta.provider ? ` · via ${meta.provider.display}` : ""}
    </p>
  );
}

interface JobAnalysisView extends LlmCallMeta {
  id: string;
  summary: string;
  matchedSkills: string[];
  missingSkills: string[];
  potentialConcerns: string[];
  verdict: "STRONG" | "POSSIBLE" | "WEAK";
  verdictReasons: string[];
  cached?: boolean;
}

interface TailoredItemView {
  id: string;
  kind: string;
  fields: Record<string, string | boolean | string[]>;
  provenance: {
    sourceIds: string[];
    change: "UNCHANGED" | "REWRITE" | "REORDER" | "COMBINE";
  };
}

interface TailoredSectionView {
  id: string;
  type: string;
  title: string;
  items: TailoredItemView[];
}

interface SemanticIssueView {
  itemId: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
}

interface AtsResultView {
  textExtractable: boolean;
  charCount: number;
  sections: {
    summary: boolean;
    experience: boolean;
    education: boolean;
    skills: boolean;
  };
  requiredSkillsFound: number;
  requiredSkillsTotal: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  keywordCoverage: number;
  warnings: string[];
}

interface TailoredResumeView extends LlmCallMeta {
  id: string;
  baseResumeId: string;
  version?: number;
  versionCount?: number;
  sections: TailoredSectionView[];
  validationStatus?: "STRUCTURAL_VALID" | "SEMANTIC_VALID" | "SEMANTIC_INVALID";
  validationResult?: { valid: boolean; issues: SemanticIssueView[] } | null;
  validatedAt?: string | null;
  renderStatus?: "PENDING" | "SUCCESS" | "FAILED";
  atsStatus?: "PENDING" | "CHECKED";
  atsResult?: AtsResultView | null;
  cached?: boolean;
}

interface CoverLetterView extends LlmCallMeta {
  id: string;
  content: {
    subject?: string;
    greeting: string;
    paragraphs: string[];
    closing: string;
  };
  cached?: boolean;
}

function renderTailoredFields(fields: TailoredItemView["fields"]): string {
  const parts: string[] = [];
  for (const value of Object.values(fields)) {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
    else if (Array.isArray(value) && value.length > 0)
      parts.push(value.join(" • "));
  }
  return parts.join(" — ");
}

const CHANGE_STYLES: Record<TailoredItemView["provenance"]["change"], string> =
  {
    UNCHANGED: "border-black/10 text-black/60",
    REWRITE: "border-black/30 text-black",
    REORDER: "border-black/10 text-black/60",
    COMBINE: "border-black/30 text-black",
  };

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
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const [analysis, setAnalysis] = useState<JobAnalysisView | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [tailored, setTailored] = useState<TailoredResumeView | null>(null);
  const [tailoring, setTailoring] = useState(false);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [rendering, setRendering] = useState(false);

  const [cover, setCover] = useState<CoverLetterView | null>(null);
  const [covering, setCovering] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [decision, setDecision] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  // Hydration gate: server-rendered buttons have no listeners until React
  // hydrates (seconds on dev/Turbopack, longer on slow networks). Clicks in
  // that window are silently lost — buttons stay disabled until mounted so
  // the affordance is honest and e2e clicks can't race hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration gate: first client render must match SSR (disabled), then enable
    setMounted(true);
  }, []);
  const [liveness, setLiveness] = useState<{
    alive: boolean;
    evidence: string | null;
  } | null>(null);
  const [checkingLive, setCheckingLive] = useState(false);

  // ─── AI provider selection (keys live in Settings) ──────────────────────
  const [llmStore, setLlmStore] = useState<LlmStore>({
    connections: [],
    activeId: null,
    activeModel: null,
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only; this syncs the store after hydration
    setLlmStore(loadLlmStore());
    return subscribeLlmStore(() => setLlmStore(loadLlmStore()));
  }, []);
  const activeLlm = activeConnection(llmStore);
  const activeModel = activeModelFor(llmStore);

  // ─── Long-call timer + cancel (Phase 5A) ─────────────────────────────────
  // One in-flight model call at a time in practice; tracked by endpoint so
  // cancel always hits the right request.
  const [callTimer, setCallTimer] = useState<{
    endpoint: string;
    elapsed: number;
  } | null>(null);
  const callControllers = useRef(new Map<string, AbortController>());
  const callTick = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCallTimer(endpoint: string) {
    const startedAt = Date.now();
    setCallTimer({ endpoint, elapsed: 0 });
    if (callTick.current) clearInterval(callTick.current);
    callTick.current = setInterval(() => {
      setCallTimer((t) =>
        t && t.endpoint === endpoint
          ? { ...t, elapsed: Math.floor((Date.now() - startedAt) / 1000) }
          : t,
      );
    }, 1000);
  }

  function stopCallTimer(endpoint: string) {
    if (callTick.current) {
      clearInterval(callTick.current);
      callTick.current = null;
    }
    callControllers.current.delete(endpoint);
    setCallTimer((t) => (t?.endpoint === endpoint ? null : t));
  }

  function cancelCall(endpoint: string) {
    callControllers.current.get(endpoint)?.abort();
  }

  function timerFor(endpoint: string): string {
    return callTimer?.endpoint === endpoint ? ` · ${callTimer.elapsed}s` : "";
  }

  // Full description toggle (pre-apply detail). Reset with the selection.
  const [showFullDesc, setShowFullDesc] = useState(false);

  // Intentional reset-on-selection-change: clears the previous job's
  // cached AI results before fetching the new selection below.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setAnalysis(null);
    setAnalysisError(null);
    setTailored(null);
    setTailorError(null);
    setCover(null);
    setCoverError(null);
    setDecision(null);
    setLiveness(null);
    setShowFullDesc(false);
    // A new selection orphans any in-flight model call: abort it so a late
    // response can't land in the wrong job's panel.
    for (const c of callControllers.current.values()) c.abort();
    if (callTick.current) clearInterval(callTick.current);
    setCallTimer(null);
    if (!selectedId) return;
    let cancelled = false;
    // One request returns every persisted artifact for this job. Previously
    // the panel made five separate HTTP calls (analyze, tailor, decision,
    // cover), each paying its own Neon round trip.
    fetch(`/api/jobs/${selectedId}/state`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAnalysis(data.analysis ?? null);
        if (data.tailored?.sections) {
          setTailored({
            ...data.tailored,
            versionCount: data.versionCount ?? 1,
          });
        }
        if (data.decision?.status && data.decision.status !== "QUEUED") {
          setDecision(data.decision.status);
        }
        if (data.cover?.content) setCover(data.cover);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function runJobPost<T>(
    busy: boolean,
    setBusy: (v: boolean) => void,
    setError: (e: string | null) => void,
    endpoint: string,
    refresh: boolean,
    fallback: string,
    onSuccess: (data: T) => void,
    blocked = false,
  ) {
    if (!selectedId || busy || blocked) return;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    callControllers.current.set(endpoint, controller);
    startCallTimer(endpoint);
    try {
      const res = await fetch(
        `/api/jobs/${selectedId}${endpoint}${refresh ? "?refresh=1" : ""}`,
        {
          method: "POST",
          headers: llmHeaders(activeLlm, activeModel),
          signal: controller.signal,
        },
      );
      const data = (await res.json()) as T & { error?: string };
      if (!res.ok) throw new Error(data.error ?? fallback);
      onSuccess(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Cancelled.");
      } else {
        setError(err instanceof Error ? err.message : fallback);
      }
    } finally {
      stopCallTimer(endpoint);
      setBusy(false);
    }
  }

  function cancelButton(endpoint: string, busy: boolean) {
    if (!busy || callTimer?.endpoint !== endpoint) return null;
    return (
      <button
        onClick={() => cancelCall(endpoint)}
        className="text-[12px] text-black/50 underline underline-offset-4 hover:text-black transition-colors duration-300"
      >
        Cancel
      </button>
    );
  }

  function runAnalysis(refresh: boolean) {
    return runJobPost(
      analyzing,
      setAnalyzing,
      setAnalysisError,
      "/analyze",
      refresh,
      "Analysis failed",
      setAnalysis,
    );
  }

  function runTailor(refresh: boolean) {
    return runJobPost(
      tailoring,
      setTailoring,
      setTailorError,
      "/tailor",
      refresh,
      "Tailoring failed",
      setTailored,
      !analysis,
    );
  }

  async function runValidation() {
    if (!selectedId || validating) return;
    setValidating(true);
    setTailorError(null);
    const controller = new AbortController();
    callControllers.current.set("/validate", controller);
    startCallTimer("/validate");
    try {
      const res = await fetch(`/api/jobs/${selectedId}/validate`, {
        method: "POST",
        headers: llmHeaders(activeLlm, activeModel),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Validation failed");
      const refreshed = await fetch(`/api/jobs/${selectedId}/tailor`).then(
        (r) => (r.ok ? r.json() : null),
      );
      if (refreshed?.sections) setTailored(refreshed);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setTailorError("Cancelled.");
      } else {
        setTailorError(
          err instanceof Error ? err.message : "Validation failed",
        );
      }
    } finally {
      stopCallTimer("/validate");
      setValidating(false);
    }
  }

  async function runRender(refresh: boolean) {
    if (!selectedId || rendering) return;
    setRendering(true);
    setTailorError(null);
    try {
      const res = await fetch(
        `/api/jobs/${selectedId}/pdf${refresh ? "?refresh=1" : ""}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Render failed");
      const refreshed = await fetch(`/api/jobs/${selectedId}/tailor`).then(
        (r) => (r.ok ? r.json() : null),
      );
      if (refreshed?.sections) setTailored(refreshed);
    } catch (err) {
      setTailorError(err instanceof Error ? err.message : "Render failed");
    } finally {
      setRendering(false);
    }
  }

  function runCover(refresh: boolean) {
    return runJobPost(
      covering,
      setCovering,
      setCoverError,
      "/cover",
      refresh,
      "Cover letter failed",
      setCover,
      !analysis || !tailored,
    );
  }

  async function setJobDecision(status: string, openUrl = false) {
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
      // Opening the URL records OPENED — it never implies APPLIED.
      if (openUrl && job) window.open(job.applyUrl, "_blank", "noopener");
    } catch (err) {
      setTailorError(err instanceof Error ? err.message : "Decision failed");
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
      if (!res.ok) throw new Error(data.error ?? "Liveness check failed");
      setLiveness({ alive: data.alive, evidence: data.evidence });
    } catch {
      setLiveness({ alive: false, evidence: "check failed" });
    } finally {
      setCheckingLive(false);
    }
  }

  function close() {
    onClose();
  }

  if (!selectedId) return null;

  const workModeLabel =
    job?.workMode === "REMOTE"
      ? "Remote"
      : job?.workMode === "HYBRID"
        ? "Hybrid"
        : "On-site";

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="bg-[#FAFAF7] border-b border-black/10 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-black flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <span className="text-title font-bold">Job Detail</span>
        </div>
        <button
          onClick={close}
          className="w-9 h-9 rounded-full border border-black/10 flex items-center justify-center hover:bg-black hover:text-white transition-all duration-500"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!job && (
          <div className="flex items-center justify-center h-full px-6">
            <div className="text-center">
              <span className="text-display block mb-4">👋</span>
              <p className="text-title font-bold mb-3">Select a role</p>
              <p className="text-body font-medium text-black/55 leading-relaxed">
                View:
                <br />
                &bull; Requirements
                <br />
                &bull; Skills
                <br />
                &bull; Salary
                <br />
                &bull; Application link
                <br />
                &bull; Company details
              </p>
            </div>
          </div>
        )}

        {job && (
          <div className="p-6 space-y-6">
            {/* Header Section */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border border-black/10 flex items-center justify-center bg-black/[0.03] shrink-0">
                <span className="text-title font-black">
                  {job.company.name.charAt(0)}
                </span>
              </div>
              <div>
                <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] border border-black/10 text-black/55">
                  {job.company.companyType === "STARTUP" ? "Startup" : "MNC"}
                </span>
              </div>
            </div>

            {/* Job Meta Section */}
            <div>
              <h2 className="font-serif-calm text-[32px] leading-tight">
                {job.title}
              </h2>
              <p className="text-body font-bold text-black/55 mt-1">
                {job.company.name}
              </p>
            </div>

            <hr className="border-t border-black/10" />

            {/* Role facts — everything stored about this posting, no model
                call needed. Read this before applying. */}
            <div>
              <h3 className="font-serif-calm text-[22px] mb-3">Role facts</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {(
                  [
                    ["Type", enumLabel(job.jobType)],
                    ["Level", enumLabel(job.experience)],
                    ["Work mode", workModeLabel],
                    ["Location", job.location ?? null],
                    [
                      "Posted",
                      job.postedAt ? formatDaysAgo(job.postedAt) : null,
                    ],
                    ["Source", enumLabel(job.source)],
                  ] as [string, string | null][]
                ).map(([label, value]) =>
                  value ? (
                    <div key={label} className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-[0.12em] text-black/45">
                        {label}
                      </dt>
                      <dd className="text-[13px] truncate" title={value}>
                        {value}
                      </dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </div>

            {/* Salary Section */}
            <div className="flex items-center gap-3 p-4 border border-black/10 rounded-[14px] bg-black/[0.03]">
              <span className="text-title font-bold">
                {formatSalary(job.salaryMin, job.salaryMax, job.salaryCurr)}
              </span>
            </div>

            {/* Skills / Tags Section */}
            {job.skills.length > 0 && (
              <div>
                <h3 className="text-title font-bold mb-3">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {job.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2.5 py-1 rounded-full bg-black/[0.04] text-[11px] font-medium text-black/60"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* About Section — full text on demand; apply only after reading */}
            <div>
              <h3 className="font-serif-calm text-[22px] mb-3">About</h3>
              <p
                className={`text-body font-medium text-black/55 leading-relaxed ${
                  showFullDesc ? "whitespace-pre-line" : "line-clamp-4"
                }`}
              >
                {job.description}
              </p>
              <button
                onClick={() => setShowFullDesc((v) => !v)}
                className="mt-2 text-[13px] underline underline-offset-4 decoration-black/20 hover:decoration-black transition-all duration-300"
              >
                {showFullDesc ? "Show less ↑" : "Read full posting ↓"}
              </button>
            </div>

            {/* AI Analysis Section */}
            <div className="p-4 border border-black/10 rounded-[14px] bg-black/[0.03] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif-calm text-[22px] flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI Analysis
                </h3>
                {analysis && (
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] border border-black/10 bg-white ${
                      analysis.verdict === "STRONG"
                        ? "text-green-700"
                        : analysis.verdict === "POSSIBLE"
                          ? "text-yellow-700"
                          : "text-red-600"
                    }`}
                  >
                    {analysis.verdict}
                  </span>
                )}
              </div>

              {analysis && (
                <div className="space-y-2">
                  <p className="text-body font-medium leading-relaxed">
                    {analysis.summary}
                  </p>
                  {analysis.verdictReasons.length > 0 && (
                    <ul className="text-body font-medium text-black/55 leading-relaxed list-disc pl-5">
                      {analysis.verdictReasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                  {analysis.missingSkills.length > 0 && (
                    <p className="text-body font-medium">
                      <span className="font-bold">Gaps: </span>
                      {analysis.missingSkills.join(", ")}
                    </p>
                  )}
                  {analysis.potentialConcerns.length > 0 && (
                    <p className="text-body font-medium">
                      <span className="font-bold">Concerns: </span>
                      {analysis.potentialConcerns.join("; ")}
                    </p>
                  )}
                </div>
              )}

              {analysisError && (
                <p className="text-body font-bold text-red">{analysisError}</p>
              )}

              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="job-ai-model"
                  className="text-[11px] uppercase tracking-[0.12em] text-black/45"
                >
                  Model
                </label>
                <select
                  id="job-ai-model"
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
                  className="max-w-[62%] bg-white border border-black/10 rounded-[12px] px-3 py-2 text-[13px] outline-none focus:border-black/30"
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
              </div>
              <p className="text-[11px] text-black/45">
                {activeLlm && activeModel
                  ? `Using ${activeLlm.label} · ${activeModel}.`
                  : "Using the server default provider."}{" "}
                <Link
                  href="/settings"
                  className="underline underline-offset-4 hover:text-black"
                >
                  Manage keys in Settings
                </Link>
              </p>

              <button
                onClick={() => runAnalysis(!!analysis)}
                disabled={!mounted || analyzing}
                className="w-full flex items-center justify-center gap-2 bg-[#111] text-white font-medium px-4 py-3 rounded-full text-[13px] transition-all duration-300 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {analyzing
                  ? `Analyzing…${timerFor("/analyze")}`
                  : analysis
                    ? "Re-analyze Job"
                    : "Analyze Job"}
              </button>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium text-black/55">
                  {activeLlm && activeModel
                    ? `Using ${activeLlm.label} · ${activeModel}`
                    : "Using the server default provider"}
                  {" — one call per job, result saved and reused."}
                </p>
                {cancelButton("/analyze", analyzing)}
              </div>
              {analysis && <UsageLine meta={analysis} />}
            </div>

            {/* Tailored Resume Section */}
            <div className="p-4 border border-black/10 rounded-[14px] bg-black/[0.03] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif-calm text-[22px] flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Tailored Resume
                </h3>
                {tailored && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] border border-black/10 bg-white text-green-700">
                    {tailored.sections.reduce((n, s) => n + s.items.length, 0)}{" "}
                    items
                    {tailored.version ? ` · v${tailored.version}` : ""}
                    {tailored.versionCount && tailored.versionCount > 1
                      ? ` of ${tailored.versionCount}`
                      : ""}
                  </span>
                )}
              </div>

              {tailored && (
                <div className="space-y-4">
                  {tailored.sections.map((section) => (
                    <div key={section.id}>
                      <p className="text-[12px] font-bold uppercase tracking-widest mb-1.5">
                        {section.title}
                      </p>
                      <div className="space-y-1.5">
                        {section.items.map((item) => (
                          <div key={item.id} className="flex items-start gap-2">
                            <span
                              className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] border ${CHANGE_STYLES[item.provenance.change]}`}
                            >
                              {item.provenance.change}
                            </span>
                            <p className="text-body font-medium leading-relaxed">
                              {renderTailoredFields(item.fields)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tailorError && (
                <p className="text-body font-bold text-red">{tailorError}</p>
              )}

              {tailored && (
                <div className="p-3 border border-black/10 rounded-[12px] bg-white space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold uppercase tracking-widest">
                      Evidence check
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] border border-black/10 bg-white ${
                        tailored.validationStatus === "SEMANTIC_VALID"
                          ? "text-green-700"
                          : tailored.validationStatus === "SEMANTIC_INVALID"
                            ? "text-red-600"
                            : "text-yellow-700"
                      }`}
                    >
                      {tailored.validationStatus === "SEMANTIC_VALID"
                        ? "Valid"
                        : tailored.validationStatus === "SEMANTIC_INVALID"
                          ? "Issues found"
                          : "Structural only"}
                    </span>
                  </div>

                  {tailored.validationResult?.issues?.length ? (
                    <ul className="space-y-1.5">
                      {tailored.validationResult.issues.map((issue, i) => (
                        <li
                          key={`${issue.itemId}-${i}`}
                          className="text-body font-medium leading-relaxed"
                        >
                          <span className="font-bold">[{issue.severity}]</span>{" "}
                          <span className="font-bold">{issue.itemId}</span> —{" "}
                          {issue.explanation}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    tailored.validationStatus === "SEMANTIC_VALID" && (
                      <p className="text-body font-medium">
                        Every claim traces to base-resume evidence. Render the
                        PDF below.
                      </p>
                    )
                  )}

                  <button
                    onClick={runValidation}
                    disabled={!mounted || validating}
                    className="w-full flex items-center justify-center gap-2 bg-white text-black font-medium px-4 py-2.5 rounded-full border border-black/10 text-[13px] hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
                  >
                    {validating
                      ? `Checking…${timerFor("/validate")}`
                      : "Check Evidence"}
                  </button>
                  {cancelButton("/validate", validating)}
                </div>
              )}

              {/* Keyword gap (Phase 3A): pure read of the saved analysis —
                  no model call. Shows what the JD asks vs what the resume
                  evidences, before tailoring. Hidden once tailored. */}
              {analysis && !tailored && (
                <div className="p-3 border border-black/10 rounded-[12px] bg-white space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold uppercase tracking-widest">
                      Keyword fit
                    </span>
                    <span className="text-[12px] font-bold uppercase tracking-widest text-black/55">
                      {analysis.matchedSkills.length} of{" "}
                      {analysis.matchedSkills.length +
                        analysis.missingSkills.length}{" "}
                      covered
                    </span>
                  </div>
                  {analysis.matchedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.matchedSkills.map((s) => (
                        <span
                          key={s}
                          className="px-2.5 py-1 rounded-full bg-black/[0.04] text-[11px] font-medium text-black/60"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {analysis.missingSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.missingSkills.map((s) => (
                        <span
                          key={s}
                          className="px-2.5 py-1 rounded-full text-[12px] font-bold uppercase tracking-widest border border-black/10 bg-white"
                        >
                          {s} · gap
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[12px] font-medium text-black/55">
                    Tailoring rephrases from your evidence — it never invents
                    the gaps above.
                  </p>
                </div>
              )}

              <button
                onClick={() => runTailor(!!tailored)}
                disabled={!mounted || tailoring || !analysis}
                className="w-full flex items-center justify-center gap-2 bg-[#111] text-white font-medium px-4 py-3 rounded-full text-[13px] transition-all duration-300 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {tailoring
                  ? `Tailoring…${timerFor("/tailor")}`
                  : tailored
                    ? "Re-tailor Resume"
                    : "Tailor Resume"}
              </button>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium text-black/55">
                  {analysis
                    ? "Built from your base resume + the analysis above. Every item cites its evidence."
                    : "Analyze the job first — tailoring builds on the analysis."}
                </p>
                {cancelButton("/tailor", tailoring)}
              </div>
              {tailored && <UsageLine meta={tailored} />}

              {tailored && tailored.validationStatus === "SEMANTIC_VALID" && (
                <div className="p-3 border border-black/10 rounded-[12px] bg-white space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold uppercase tracking-widest">
                      PDF + ATS check
                    </span>
                    {tailored.renderStatus === "SUCCESS" && (
                      <a
                        href={`/api/jobs/${selectedId}/pdf/download`}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] border border-black/30 text-black"
                      >
                        Download
                      </a>
                    )}
                  </div>

                  {tailored.atsStatus === "CHECKED" && tailored.atsResult && (
                    <ul className="space-y-1">
                      <li className="text-body font-medium">
                        {tailored.atsResult.textExtractable ? "✓" : "✗"} PDF
                        text is extractable
                      </li>
                      <li className="text-body font-medium">
                        {Object.values(tailored.atsResult.sections).every(
                          Boolean,
                        )
                          ? "✓"
                          : "⚠"}{" "}
                        Sections detected (
                        {
                          Object.values(tailored.atsResult.sections).filter(
                            Boolean,
                          ).length
                        }
                        /4)
                      </li>
                      <li className="text-body font-medium">
                        {tailored.atsResult.missingKeywords.length === 0
                          ? "✓"
                          : "⚠"}{" "}
                        {tailored.atsResult.requiredSkillsFound}/
                        {tailored.atsResult.requiredSkillsTotal} required skills
                        present
                      </li>
                      {tailored.atsResult.warnings.slice(0, 6).map((w) => (
                        <li
                          key={w}
                          className="text-body font-medium text-black/55"
                        >
                          ⚠ {w}
                        </li>
                      ))}
                    </ul>
                  )}

                  {tailored.renderStatus === "FAILED" && (
                    <p className="text-body font-bold text-red">
                      Render failed — check server logs. Content is untouched;
                      fix the template and re-render.
                    </p>
                  )}

                  <button
                    onClick={() =>
                      runRender(tailored.renderStatus === "SUCCESS")
                    }
                    disabled={!mounted || rendering}
                    className="w-full flex items-center justify-center gap-2 bg-white text-black font-medium px-4 py-2.5 rounded-full border border-black/10 text-[13px] hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
                  >
                    {rendering
                      ? "Rendering…"
                      : tailored.renderStatus === "SUCCESS"
                        ? "Re-render PDF"
                        : "Render PDF"}
                  </button>
                </div>
              )}
            </div>

            {/* Cover Letter Section */}
            <div className="p-4 border border-black/10 rounded-[14px] bg-black/[0.03] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif-calm text-[22px] flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Cover letter
                </h3>
                {cover && (
                  <span className="px-2.5 py-1 rounded-full text-[12px] font-bold uppercase tracking-widest border border-black/10 bg-white">
                    Saved
                  </span>
                )}
              </div>

              {cover && (
                <div className="p-3 border border-black/10 rounded-[12px] bg-white space-y-2">
                  {cover.content.subject && (
                    <p className="text-body font-bold leading-relaxed">
                      {cover.content.subject}
                    </p>
                  )}
                  <p className="text-body font-medium leading-relaxed">
                    {cover.content.greeting}
                  </p>
                  {cover.content.paragraphs.map((p) => (
                    <p
                      key={p.slice(0, 32)}
                      className="text-body font-medium leading-relaxed"
                    >
                      {p}
                    </p>
                  ))}
                  <p className="text-body font-medium leading-relaxed">
                    {cover.content.closing}
                  </p>
                </div>
              )}

              {coverError && (
                <p className="text-body font-bold text-red">{coverError}</p>
              )}

              <button
                onClick={() => runCover(!!cover)}
                disabled={!mounted || covering || !analysis || !tailored}
                className="w-full flex items-center justify-center gap-2 bg-[#111] text-white font-medium px-4 py-3 rounded-full text-[13px] transition-all duration-300 disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {covering
                  ? `Writing…${timerFor("/cover")}`
                  : cover
                    ? "Regenerate letter"
                    : "Write cover letter"}
              </button>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium text-black/55">
                  {analysis && tailored
                    ? "Built from the analysis + tailored resume above. Every claim cites base-resume evidence."
                    : "Analyze the job and tailor a resume first — the letter builds on both."}
                </p>
                {cancelButton("/cover", covering)}
              </div>
              {cover && <UsageLine meta={cover} />}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Footer — application lifecycle (2.5.3/2.5.4) */}
      {job && (
        <div className="sticky bottom-0 bg-white border-t border-black/10 px-6 py-5 shrink-0 z-10 space-y-3">
          {(decision || liveness) && (
            <div className="flex flex-wrap items-center gap-2">
              {decision && (
                <span
                  data-testid="decision-badge"
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] bg-[#111] text-white"
                >
                  {decision}
                </span>
              )}
              {liveness && (
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] border border-black/10 bg-white ${liveness.alive ? "text-green-700" : "text-red-600"}`}
                  title={liveness.evidence ?? undefined}
                >
                  {liveness.alive ? "● Live" : "● Closed?"}
                </span>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setJobDecision("OPENED", true)}
              disabled={!mounted || deciding}
              className="flex-1 flex items-center justify-center gap-2 bg-[#111] text-white font-medium px-4 py-3 rounded-full text-[13px] transition-all duration-300 disabled:opacity-50"
            >
              Open application
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setJobDecision("APPLIED")}
              disabled={!mounted || deciding}
              className="flex-1 flex items-center justify-center gap-2 bg-[#111] text-white font-medium px-4 py-3 rounded-full text-[13px] transition-all duration-300 disabled:opacity-50"
            >
              I&apos;ve applied
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setJobDecision("SAVED")}
              disabled={!mounted || deciding}
              className="flex-1 text-[13px] font-medium px-3 py-2 rounded-full border border-black/10 hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setJobDecision("SKIPPED")}
              disabled={!mounted || deciding}
              className="flex-1 text-[13px] font-medium px-3 py-2 rounded-full border border-black/10 hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
            >
              Skip
            </button>
            <button
              onClick={checkLiveness}
              disabled={!mounted || checkingLive}
              className="flex-1 text-[13px] font-medium px-3 py-2 rounded-full border border-black/10 hover:bg-black hover:text-white transition-all duration-500 disabled:opacity-50"
            >
              {checkingLive ? "Checking…" : "Check live"}
            </button>
          </div>
          <p className="text-[12px] font-medium text-black/55">
            Opening records OPENED only — confirm with I&apos;ve Applied after
            you submit.
          </p>
        </div>
      )}
    </div>
  );
}
