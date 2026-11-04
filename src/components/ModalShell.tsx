"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// ─── Centered calm modal shell ───────────────────────────────────────────────
// Replaces the old right-aligned sheet: more room (max-w-2xl), backdrop click
// and Escape to close. Close preserves active filters — only `selected` is
// dropped, mirroring JobDetailPanel's own close button.

export function ModalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selected");
    router.push(`/?${params.toString()}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close reads live searchParams; re-subscribing per keystroke is waste
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/20" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl h-[88vh] max-h-[860px] overflow-hidden bg-[#FAFAF7] border border-black/10 rounded-[24px] calm-enter shadow-[0_20px_50px_-20px_rgba(0,0,0,0.18)]"
      >
        {children}
      </div>
    </div>
  );
}
