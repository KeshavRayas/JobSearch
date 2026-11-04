"use client";

import { useSyncExternalStore, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ResumeEditor } from "@/components/ResumeEditor";
import { defaultResumeData } from "@/lib/resume.utils";
import type { ResumeData } from "@/lib/resume.types";

function subscribeToLocalStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

let _cachedRaw: string | null = null;
let _cachedSnapshot: { name: string; data: ResumeData } | null = null;

function getUploadedResumesSnapshot() {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("uploadedResumes");
    if (raw === _cachedRaw) return _cachedSnapshot;
    _cachedRaw = raw;
    if (raw) {
      const list = JSON.parse(raw);
      _cachedSnapshot =
        list.length > 0
          ? (list[0] as { name: string; data: ResumeData })
          : null;
    } else {
      _cachedSnapshot = null;
    }
    return _cachedSnapshot;
  } catch {
    return null;
  }
}

function getServerSnapshot() {
  return null;
}

function NewResumeContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job") || undefined;

  const latest = useSyncExternalStore(
    subscribeToLocalStorage,
    getUploadedResumesSnapshot,
    getServerSnapshot,
  );

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#FAFAF7]">
      <ResumeEditor
        key={latest?.name ?? "default"}
        initialData={latest?.data ?? defaultResumeData()}
        initialTitle={latest?.name ?? "My Resume"}
        jobId={jobId}
      />
    </div>
  );
}

export default function NewResumePage() {
  return (
    <Suspense>
      <NewResumeContent />
    </Suspense>
  );
}
