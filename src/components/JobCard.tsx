"use client";

import Link from "next/link";
import { formatDaysAgo, formatSalary } from "@/lib/utils";
import type { JobSearchResult } from "@/lib/types";

export function JobCard({
  job,
  index = 0,
  onSelect,
}: {
  job: JobSearchResult;
  index?: number;
  onSelect?: (id: string) => void;
}) {
  const meta = [
    job.location,
    formatSalary(job.salaryMin, job.salaryMax, job.salaryCurr),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/?selected=${job.id}`}
      scroll={false}
      onClick={(e) => {
        if (!onSelect) return;
        e.preventDefault();
        onSelect(job.id);
      }}
      className="calm-card calm-enter group block p-6"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
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
        Save →
      </div>
    </Link>
  );
}
