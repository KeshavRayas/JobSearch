"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { JobSearchResult } from "@/lib/types";
import { JobCard } from "@/components/JobCard";
import { Pagination } from "@/components/Pagination";
import { ModalShell } from "@/components/ModalShell";

// The heavy panel is only downloaded when a job is selected.
const JobDetailPanel = dynamic(() =>
  import("@/components/JobDetailPanel").then((m) => m.JobDetailPanel),
);

export function JobBrowser({
  jobs,
  page,
  totalPages,
  initialSelected,
}: {
  jobs: JobSearchResult[];
  page: number;
  totalPages: number;
  initialSelected: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(initialSelected);

  // Back/forward should reopen the same client-side selection.
  useEffect(() => {
    function onPopState() {
      setSelected(new URL(window.location.href).searchParams.get("selected"));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const open = useCallback((id: string) => {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("selected", id);
    window.history.pushState({ selected: id }, "", url);
  }, []);

  const close = useCallback(() => {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("selected");
    window.history.pushState({}, "", url);
  }, []);

  return (
    <>
      <div className="calm-wrap mt-10 grid gap-4">
        {jobs.map((job, i) => (
          <JobCard key={job.id} job={job} index={i} onSelect={open} />
        ))}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} />

      {selected && (
        <ModalShell onClose={close}>
          <JobDetailPanel jobs={jobs} selectedId={selected} onClose={close} />
        </ModalShell>
      )}
    </>
  );
}
