"use client";

import { useState } from "react";
import { Trash2, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

export function DeleteResumeButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/resumes/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-7 h-7 rounded-full border border-red-300 flex items-center justify-center text-red-600 transition-all duration-500 disabled:opacity-50"
          title="Confirm delete"
        >
          {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "✓"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-black/60 hover:text-black hover:border-black/30 transition-all duration-500"
          title="Keep"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-black/40 hover:text-red-600 hover:border-red-300 transition-all duration-500 shrink-0"
      title="Delete resume"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
