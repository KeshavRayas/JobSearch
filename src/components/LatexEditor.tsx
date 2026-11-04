"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { ResumeData } from "@/lib/resume.types";
import { LatexPreview } from "./LatexPreview";
import { Save, Download, Loader2, Check, Briefcase } from "lucide-react";
import Link from "next/link";

type LatexEditorProps = {
  resumeId?: string;
  initialData: ResumeData;
  initialTitle: string;
};

export function LatexEditor({
  resumeId,
  initialData,
  initialTitle,
}: LatexEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [source, setSource] = useState(initialData.originalContent ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const currentIdRef = useRef(resumeId);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const content: ResumeData = {
        sections: [],
        originalContent: source,
        originalFormat: "tex",
      };

      const id = currentIdRef.current;
      if (!id) {
        const res = await fetch("/api/resumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, skills: [] }),
        });
        if (res.ok) {
          const created = await res.json();
          currentIdRef.current = created.id;
          window.history.replaceState(null, "", `/resumes/${created.id}`);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } else {
        const res = await fetch(`/api/resumes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, skills: [] }),
        });
        if (res.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }, [title, source]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 500);
  }, [save]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function handleSourceChange(value: string) {
    setSource(value);
    scheduleSave();
  }

  async function handleDownload() {
    const blob = new Blob([source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.tex`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full flex flex-col bg-[#FAFAF7] text-[#111]">
      {/* Header */}
      <div className="bg-white border-b border-black/10 px-6 py-4 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-serif-calm text-xl shrink-0"
            title="Job Search home"
          >
            <Briefcase className="w-4 h-4" />
          </Link>
          <Link href="/resumes" className="calm-pill">
            Resumes
          </Link>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave();
            }}
            className="bg-transparent font-serif-calm text-xl outline-none w-64 placeholder:text-black/35"
            placeholder="Resume title"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="bg-[#111] text-white rounded-full px-6 py-2.5 text-[13px] font-medium transition-all duration-500 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
          <button onClick={handleDownload} className="calm-pill">
            <Download className="w-4 h-4" />
            Download .tex
          </button>
        </div>
      </div>

      {/* Split editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: source editor */}
        <div className="flex-1 flex flex-col border-r border-black/10">
          <div className="px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-black/45 border-b border-black/10">
            Source
          </div>
          <textarea
            value={source}
            onChange={(e) => handleSourceChange(e.target.value)}
            className="flex-1 w-full border-none outline-none resize-none p-4 text-[13px] font-mono leading-relaxed bg-white"
            spellCheck={false}
          />
        </div>

        {/* Right: preview */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-black/45 border-b border-black/10">
            Preview
          </div>
          <LatexPreview source={source} />
        </div>
      </div>
    </div>
  );
}
