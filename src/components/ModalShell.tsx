"use client";

import { useEffect } from "react";

// ─── Centered calm modal shell ───────────────────────────────────────────────
// Closing is client-side: the browser owns the selection URL, so opening and
// closing a job never triggers a server round trip.

export function ModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/20" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl h-[92vh] max-h-[960px] overflow-hidden bg-[#FAFAF7] border border-black/10 rounded-[24px] calm-enter shadow-[0_20px_50px_-20px_rgba(0,0,0,0.18)]"
      >
        {children}
      </div>
    </div>
  );
}
