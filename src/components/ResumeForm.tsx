"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useSyncExternalStore,
} from "react";
import type {
  ResumeData,
  ResumeSection,
  CustomSectionFormat,
} from "@/lib/resume.types";
import {
  createSection,
  SECTION_LABELS,
  SECTION_ORDER,
  uid,
} from "@/lib/resume.utils";
import { ResumeSectionEditor } from "./ResumeSectionEditor";
import {
  Save,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  X,
  Briefcase,
} from "lucide-react";
import { ResumeUploadButton } from "./ResumeUploadButton";
import Link from "next/link";

type ResumeFormProps = {
  resumeId?: string;
  initialData: ResumeData;
  initialTitle: string;
};

let _cachedRawResumes: string | null = null;
let _cachedResumes: { id: string; name: string; data: ResumeData }[] = [];

function getResumesSnapshot() {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem("uploadedResumes");
  if (raw === _cachedRawResumes) return _cachedResumes;
  _cachedRawResumes = raw;
  try {
    _cachedResumes = raw ? JSON.parse(raw) : [];
  } catch {
    _cachedResumes = [];
  }
  return _cachedResumes;
}

function ensureItemIds(data: ResumeData): ResumeData {
  return {
    ...data,
    sections: data.sections.map((s) => ({
      ...s,
      items: s.items.map((item) => (item.id ? item : { ...item, id: uid() })),
    })),
  };
}

export function ResumeForm({
  resumeId,
  initialData,
  initialTitle,
}: ResumeFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [data, setData] = useState<ResumeData>(() =>
    ensureItemIds(initialData),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSectionMenu, setShowSectionMenu] = useState(false);
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);

  const uploadedResumes = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    getResumesSnapshot,
    () => [],
  );
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [customSectionName, setCustomSectionName] = useState("");
  const [customSectionFormat, setCustomSectionFormat] =
    useState<CustomSectionFormat>("text");
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const currentIdRef = useRef(resumeId);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const currentData = dataRef.current;
      const skills: string[] = [];
      for (const section of currentData.sections) {
        if (section.type === "skills") {
          for (const item of section.items) {
            const sk = item as { skills: string[] };
            if (sk.skills) skills.push(...sk.skills.filter((s) => s.trim()));
          }
        }
      }

      const id = currentIdRef.current;
      if (!id) {
        const res = await fetch("/api/resumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: currentData, skills }),
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
          body: JSON.stringify({ title, content: currentData, skills }),
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
  }, [title]);

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

  function updateSection(sectionId: string, updated: ResumeSection) {
    setData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === sectionId ? updated : s)),
    }));
    scheduleSave();
  }

  function removeSection(sectionId: string) {
    setData((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sectionId),
    }));
    scheduleSave();
  }

  function addSection(
    type: string,
    customTitle?: string,
    customFormat?: CustomSectionFormat,
  ) {
    const newSection = createSection(type, customTitle, customFormat);
    setData((prev) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
    setShowSectionMenu(false);
  }

  function switchResume(r: { name: string; data: ResumeData }) {
    setTitle(r.name);
    setData(ensureItemIds(r.data));
    setShowSwitchMenu(false);
  }

  function handleAddCustom() {
    if (!customSectionName.trim()) return;
    addSection("custom", customSectionName.trim(), customSectionFormat);
    setShowCustomDialog(false);
    setCustomSectionName("");
    setCustomSectionFormat("text");
  }

  function moveSection(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= data.sections.length) return;
    setData((prev) => {
      const sections = [...prev.sections];
      [sections[index], sections[newIndex]] = [
        sections[newIndex],
        sections[index],
      ];
      return { ...prev, sections };
    });
  }

  async function handleDownload() {
    // If original LaTeX content exists, download as .tex (preserves original format)
    if (data.originalFormat === "tex" && data.originalContent) {
      const blob = new Blob([data.originalContent], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_")}.tex`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // If original PDF content exists, download the original PDF
    if (data.originalFormat === "pdf" && data.originalContent) {
      const binary = atob(data.originalContent);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // Fallback: generate PDF from parsed data
    const { pdf } = await import("@react-pdf/renderer");
    const { ResumePDF } = await import("./ResumePDF");
    const blob = await pdf(<ResumePDF data={data} title={title} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const availableTypes = SECTION_ORDER.filter(
    (t) => !data.sections.find((s) => s.type === t),
  );

  return (
    <div className="h-full flex flex-col bg-[#FAFAF7] text-[#111]">
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
          {uploadedResumes.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowSwitchMenu(!showSwitchMenu)}
                className="calm-pill"
              >
                Switch ↓
              </button>
              {showSwitchMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowSwitchMenu(false)}
                  />
                  <div className="absolute left-0 top-full mt-2 z-20 bg-white border border-black/10 rounded-[14px] overflow-hidden min-w-[200px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.18)]">
                    {uploadedResumes.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => switchResume(r)}
                        className="w-full px-4 py-2.5 text-left text-[14px] hover:bg-black/[0.04] transition-colors duration-300 border-b border-black/5 last:border-b-0 truncate"
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <span className="text-[11px] uppercase tracking-[0.12em] text-black/45">
          {data.sections.length} section{data.sections.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 max-w-4xl w-full mx-auto">
        {data.sections.length === 0 && (
          <div className="py-16 text-center">
            <p className="font-serif-calm text-3xl">Nothing here — yet.</p>
            <p className="text-[14px] text-black/55 mt-2">
              Add your first section below.
            </p>
          </div>
        )}

        {data.sections.map((section, index) => (
          <SectionCard
            key={section.id}
            section={section}
            index={index}
            total={data.sections.length}
            onUpdate={(updated) => updateSection(section.id, updated)}
            onRemove={() => removeSection(section.id)}
            onMoveUp={() => moveSection(index, -1)}
            onMoveDown={() => moveSection(index, 1)}
          />
        ))}

        <div className="relative">
          <button
            onClick={() => setShowSectionMenu(!showSectionMenu)}
            disabled={availableTypes.length === 0}
            className="calm-pill w-full justify-center py-3 disabled:opacity-30"
          >
            + Add section
          </button>

          {showSectionMenu && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white border border-black/10 rounded-[14px] overflow-hidden z-20 min-w-[200px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.18)]">
              {availableTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => addSection(type)}
                  className="w-full px-4 py-2.5 text-left text-[14px] hover:bg-black/[0.04] transition-colors duration-300"
                >
                  {SECTION_LABELS[type] || type}
                </button>
              ))}
              <div className="border-t border-black/10" />
              <button
                onClick={() => {
                  setShowSectionMenu(false);
                  setShowCustomDialog(true);
                  setCustomSectionName("");
                  setCustomSectionFormat("text");
                }}
                className="w-full px-4 py-2.5 text-left text-[14px] hover:bg-black/[0.04] transition-colors duration-300"
              >
                Custom section…
              </button>
            </div>
          )}
        </div>
      </div>

      {showCustomDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="bg-white border border-black/10 rounded-[22px] p-6 w-full max-w-md mx-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif-calm text-2xl">New custom section</h3>
              <button
                onClick={() => setShowCustomDialog(false)}
                className="w-8 h-8 rounded-full border border-black/10 flex items-center justify-center text-black/60 hover:text-black hover:border-black/30 transition-all duration-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block mb-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-black/45 mb-1 block">
                Section name
              </span>
              <input
                type="text"
                value={customSectionName}
                onChange={(e) => setCustomSectionName(e.target.value)}
                placeholder="e.g. Publications, Awards, Languages"
                className="w-full bg-white border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] outline-none focus:border-black/30 transition-colors duration-500 placeholder:text-black/35"
                autoFocus
              />
            </label>
            <label className="block mb-4">
              <span className="text-[11px] uppercase tracking-[0.12em] text-black/45 mb-1 block">
                Format
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCustomSectionFormat("text")}
                  className={`calm-pill flex-1 justify-center ${customSectionFormat === "text" ? "on" : ""}`}
                >
                  Text block
                </button>
                <button
                  onClick={() => setCustomSectionFormat("list")}
                  className={`calm-pill flex-1 justify-center ${customSectionFormat === "list" ? "on" : ""}`}
                >
                  List
                </button>
              </div>
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCustomDialog(false)}
                className="calm-pill"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustom}
                disabled={!customSectionName.trim()}
                className="bg-[#111] text-white rounded-full px-5 py-2.5 text-[13px] font-medium transition-all duration-500 hover:opacity-90 disabled:opacity-30"
              >
                Add section
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 bg-white border-t border-black/10 px-6 py-4 flex items-center gap-3 max-w-4xl w-full mx-auto">
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
        <button
          onClick={handleDownload}
          className="calm-pill"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
        <div className="ml-auto">
          <ResumeUploadButton
            variant="button"
            onUpload={(parsed) => setData(parsed)}
          />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  section,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  section: ResumeSection;
  index: number;
  total: number;
  onUpdate: (section: ResumeSection) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(() => section.title);
  const isCustom = section.type === "custom";

  return (
    <div className="calm-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-black/60 hover:text-black hover:border-black/30 transition-all duration-500 shrink-0"
          >
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
          {editingTitle ? (
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                onUpdate({ ...section, title: titleDraft });
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onUpdate({ ...section, title: titleDraft });
                  setEditingTitle(false);
                }
                if (e.key === "Escape") {
                  setTitleDraft(section.title);
                  setEditingTitle(false);
                }
              }}
              className="font-serif-calm text-xl bg-transparent border-b border-black/30 outline-none min-w-[100px]"
              autoFocus
            />
          ) : (
            <span
              className="font-serif-calm text-xl truncate cursor-pointer"
              onDoubleClick={() => isCustom && setEditingTitle(true)}
              title={isCustom ? "Double-click to rename" : undefined}
            >
              {SECTION_LABELS[section.type] || section.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-black/60 hover:text-black hover:border-black/30 transition-all duration-500 disabled:opacity-30 text-[13px]"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-black/60 hover:text-black hover:border-black/30 transition-all duration-500 disabled:opacity-30 text-[13px]"
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            className="w-7 h-7 rounded-full border border-black/10 flex items-center justify-center text-black/40 hover:text-red-600 hover:border-red-300 transition-all duration-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="p-5 space-y-3">
          <ResumeSectionEditor section={section} onChange={onUpdate} />
        </div>
      )}
    </div>
  );
}
