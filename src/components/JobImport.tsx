"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ─── Paste-a-URL import (Phase 2B) ───────────────────────────────────────────
// One quiet disclosure under the hero filters. Success opens the imported
// job's detail overlay; rejections show the pipeline reason inline.

export function JobImport() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  // Same hydration gate as JobDetailPanel: the submit has no listener until
  // React hydrates, so it stays disabled until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration gate: first client render must match SSR (disabled), then enable
    setMounted(true);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/jobs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "could not import that URL");
        return;
      }
      setIsError(false);
      setMessage("Imported — opening it now.");
      setUrl("");
      router.push(`/?selected=${data.jobId}`);
    } catch {
      setIsError(true);
      setMessage("could not import that URL");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-4 w-full max-w-xl mx-auto text-left bg-white border border-black/10 rounded-[22px] px-6 py-4">
      <summary className="cursor-pointer text-[13px] text-black/60 hover:text-black transition-colors duration-300 list-none text-center">
        Have a link? Add it ↓
      </summary>
      <form onSubmit={submit} className="pt-4">
        <div className="flex items-center gap-2 bg-[#F4F4F1] border border-black/10 rounded-full px-5 py-3 transition-colors duration-500 focus-within:border-black/30">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a job posting URL…"
            className="bg-transparent outline-none flex-1 text-[15px] placeholder:text-black/35 text-left"
          />
          <button
            type="submit"
            disabled={!mounted || busy || !url.trim()}
            className="text-[13px] font-medium underline underline-offset-4 decoration-black/20 hover:decoration-black transition-all duration-500 disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add →"}
          </button>
        </div>
        {message && (
          <p
            className={`mt-3 text-center text-[13px] ${isError ? "text-black/70" : "text-black/50"}`}
          >
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
