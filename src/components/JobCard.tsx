"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDaysAgo, formatSalary } from "@/lib/utils";
import type { JobSearchResult } from "@/lib/types";

// One card, two actions: open the review, or queue the role immediately.
// Queueing is the Tsenta-style entry point; it records ApplicationDecision
// QUEUED and opens the detail panel so the resume can be tailored and approved.

export function JobCard({
  job,
  index = 0,
  onSelect,
}: {
  job: JobSearchResult;
  index?: number;
  onSelect?: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(
    ["QUEUED", "OPENED", "SAVED"].includes(job.decisionStatus ?? ""),
  );
  const applied = job.decisionStatus === "APPLIED";
  const queueLabel =
    job.decisionStatus === "OPENED"
      ? "Application opened"
      : job.decisionStatus === "SAVED"
        ? "Saved for later"
        : "In your apply queue";

  const meta = [
    job.location,
    formatSalary(job.salaryMin, job.salaryMax, job.salaryCurr),
  ]
    .filter(Boolean)
    .join(" · ");

  async function queue() {
    if (busy || applied) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "QUEUED" }),
      });
      if (res.ok) setQueued(true);
    } catch {
      // The detail panel still opens; the user can queue from there.
    } finally {
      setBusy(false);
      window.location.assign(`/apply/${job.id}`);
    }
  }

  return (
    <div
      className="calm-card calm-enter group"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <Link
        href={`/?selected=${job.id}`}
        scroll={false}
        onClick={(e) => {
          if (!onSelect) return;
          e.preventDefault();
          onSelect(job.id);
        }}
        className="block p-6"
      >
        <div className="text-[11px] uppercase tracking-[0.12em] text-black/45">
          {job.company.name}
        </div>
        <h3 className="font-serif-calm text-2xl leading-tight mt-2 group-hover:translate-x-1 transition-transform duration-300">
          {job.title}
        </h3>
        <div className="text-[13px] text-black/55 mt-2">
          {meta || formatDaysAgo(job.postedAt)}
          {meta && (
            <>
              {" · "}
              <span>{formatDaysAgo(job.postedAt)}</span>
            </>
          )}
        </div>
        {job.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {job.skills.slice(0, 3).map((skill) => (
              <span
                key={skill}
                className="px-2.5 py-1 rounded-full bg-black/[0.04] text-[11px] font-medium text-black/60"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 text-[13px] underline underline-offset-4 decoration-black/20 group-hover:decoration-black transition-all duration-500">
          Review →
        </div>
      </Link>

      <div className="px-6 pb-5 flex items-center justify-between gap-3">
        <span className="text-[11px] text-black/40">
          {applied
            ? "Applied — resume saved"
            : queued
              ? queueLabel
              : "Tailor, approve, then apply"}
        </span>
        {applied ? (
          <span className="px-4 py-1.5 rounded-full border border-black/10 text-[12px] text-black/50">
            Applied
          </span>
        ) : queued ? (
          <Link
            href={`/apply/${job.id}`}
            className="px-4 py-1.5 rounded-full border border-black/15 text-[12px] font-medium hover:border-black/40 transition-colors"
          >
            Continue
          </Link>
        ) : (
          <button
            type="button"
            onClick={queue}
            disabled={busy}
            className="px-4 py-1.5 rounded-full bg-[#111] text-white text-[12px] font-medium hover:opacity-85 transition-opacity disabled:opacity-50"
          >
            {busy ? "Queueing…" : "Apply"}
          </button>
        )}
      </div>
    </div>
  );
}
