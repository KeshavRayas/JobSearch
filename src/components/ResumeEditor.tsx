"use client";

import { useState, useEffect } from "react";
import type { ResumeData } from "@/lib/resume.types";
import { ResumeForm } from "./ResumeForm";
import { LatexEditor } from "./LatexEditor";
import { MapPin, Clock, ArrowUpRight } from "lucide-react";
import { formatDaysAgo, formatSalary } from "@/lib/utils";
import type { JobSearchResult } from "@/lib/types";

type ResumeEditorProps = {
  resumeId?: string;
  initialData: ResumeData;
  initialTitle: string;
  jobId?: string;
};

export function ResumeEditor({
  resumeId,
  initialData,
  initialTitle,
  jobId,
}: ResumeEditorProps) {
  const [job, setJob] = useState<JobSearchResult | null>(null);
  const jobLoading = !!jobId && !job;

  useEffect(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${jobId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setJob(data))
      .catch(() => setJob(null));
  }, [jobId]);

  // LaTeX editor needs actual tex source. A row marked tex without
  // originalContent (e.g. seeded structured resumes) falls through to the
  // section form so the user never faces an empty SOURCE pane.
  const hasTexSource =
    typeof initialData.originalContent === "string" &&
    initialData.originalContent.length > 0;
  const isLatex =
    (initialData.originalFormat === "tex" && hasTexSource) ||
    (initialData.sections.length === 1 &&
      initialData.sections[0]?.type === "custom" &&
      initialData.sections[0]?.title === "LaTeX Document");

  if (isLatex) {
    return (
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <LatexEditor
            resumeId={resumeId}
            initialData={initialData}
            initialTitle={initialTitle}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <ResumeForm
          resumeId={resumeId}
          initialData={initialData}
          initialTitle={initialTitle}
        />
      </div>

      {jobId && (
        <aside className="w-[420px] shrink-0 border-l border-black/10 overflow-hidden flex flex-col bg-white">
          {jobLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-[14px] text-black/55">Loading job…</p>
            </div>
          ) : job ? (
            <>
              <div className="border-b border-black/10 px-6 py-4 shrink-0">
                <span className="text-[11px] uppercase tracking-[0.12em] text-black/45">
                  Job description
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                <div>
                  <h2 className="font-serif-calm text-2xl leading-tight">
                    {job.title}
                  </h2>
                  <p className="text-[13px] text-black/55 mt-1">
                    {job.company.name}
                  </p>
                </div>

                <hr className="border-t border-black/10" />

                <div className="space-y-2.5">
                  {job.location && (
                    <div className="flex items-center gap-2.5">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="text-[14px]">{job.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span className="text-[14px]">
                      {formatDaysAgo(job.postedAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 border border-black/10 rounded-[14px] bg-black/[0.03]">
                  <span className="font-serif-calm text-xl">
                    {formatSalary(
                      job.salaryMin ?? undefined,
                      job.salaryMax ?? undefined,
                      job.salaryCurr ?? undefined,
                    )}
                  </span>
                </div>

                {job.skills.length > 0 && (
                  <div>
                    <h3 className="font-serif-calm text-xl mb-3">
                      Required skills
                    </h3>
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

                <div>
                  <h3 className="font-serif-calm text-xl mb-3">Description</h3>
                  <p className="text-[14px] text-black/70 leading-relaxed whitespace-pre-line">
                    {job.description}
                  </p>
                </div>

                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-[#111] text-white font-medium px-5 py-2.5 rounded-full text-[13px] transition-all duration-500 hover:opacity-90"
                >
                  Apply
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <p className="text-[14px] text-black/55">Job not found.</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
