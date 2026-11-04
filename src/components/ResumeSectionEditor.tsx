"use client";

import { useState, useCallback } from "react";
import type {
  ResumeSection,
  ResumeSummaryItem,
  ResumeExperienceItem,
  ResumeEducationItem,
  ResumeSkillsItem,
  ResumeProjectItem,
  ResumeCertificationItem,
  ResumeCustomItem,
} from "@/lib/resume.types";
import { addItemToSection, removeItemFromSection } from "@/lib/resume.utils";
import { Plus, Trash2, X } from "lucide-react";

type Props = {
  section: ResumeSection;
  onChange: (section: ResumeSection) => void;
};

export function ResumeSectionEditor({ section, onChange }: Props) {
  const addItem = useCallback(() => {
    onChange(addItemToSection(section));
  }, [section, onChange]);

  const removeItem = useCallback(
    (itemId: string) => {
      onChange(removeItemFromSection(section, itemId));
    },
    [section, onChange],
  );

  const updateItem = useCallback(
    (itemId: string, patch: Record<string, unknown>) => {
      onChange({
        ...section,
        items: section.items.map((i) =>
          i.id === itemId ? { ...i, ...patch } : i,
        ),
      });
    },
    [section, onChange],
  );

  switch (section.type) {
    case "summary":
      return (
        <SummaryEditor
          items={section.items as ResumeSummaryItem[]}
          onItemChange={updateItem}
        />
      );
    case "experience":
      return (
        <ItemListEditor
          items={section.items as ResumeExperienceItem[]}
          onItemChange={updateItem}
          onRemove={removeItem}
          onAdd={addItem}
          renderItem={(item, onChange) => (
            <ExperienceItemEditor item={item} onChange={onChange} />
          )}
        />
      );
    case "education":
      return (
        <ItemListEditor
          items={section.items as ResumeEducationItem[]}
          onItemChange={updateItem}
          onRemove={removeItem}
          onAdd={addItem}
          renderItem={(item, onChange) => (
            <EducationItemEditor item={item} onChange={onChange} />
          )}
        />
      );
    case "skills":
      return (
        <SkillsEditor
          items={section.items as ResumeSkillsItem[]}
          onItemChange={updateItem}
        />
      );
    case "projects":
      return (
        <ItemListEditor
          items={section.items as ResumeProjectItem[]}
          onItemChange={updateItem}
          onRemove={removeItem}
          onAdd={addItem}
          renderItem={(item, onChange) => (
            <ProjectItemEditor item={item} onChange={onChange} />
          )}
        />
      );
    case "certifications":
      return (
        <ItemListEditor
          items={section.items as ResumeCertificationItem[]}
          onItemChange={updateItem}
          onRemove={removeItem}
          onAdd={addItem}
          renderItem={(item, onChange) => (
            <CertificationItemEditor item={item} onChange={onChange} />
          )}
        />
      );
    case "custom":
      return (
        <CustomSectionEditor
          section={section}
          onItemChange={updateItem}
          onRemove={removeItem}
          onAdd={addItem}
          onFormatChange={(fmt) => {
            onChange({ ...section, customFormat: fmt });
          }}
        />
      );
    default:
      return <p className="text-[14px] text-black/55">Unknown section type</p>;
  }
}

function SummaryEditor({
  items,
  onItemChange,
}: {
  items: ResumeSummaryItem[];
  onItemChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const item = items[0];
  if (!item) return null;
  return (
    <textarea
      value={item.content}
      onChange={(e) => onItemChange(item.id, { content: e.target.value })}
      placeholder="Write a brief professional summary..."
      rows={4}
      className="w-full border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500 resize-y focus:border-black"
    />
  );
}

function ExperienceItemEditor({
  item,
  onChange,
}: {
  item: ResumeExperienceItem;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const addBullet = () => {
    onChange(item.id, { bulletPoints: [...item.bulletPoints, ""] });
  };
  const updateBullet = (index: number, value: string) => {
    const bps = [...item.bulletPoints];
    bps[index] = value;
    onChange(item.id, { bulletPoints: bps });
  };
  const removeBullet = (index: number) => {
    const bps = item.bulletPoints.filter((_, i) => i !== index);
    onChange(item.id, { bulletPoints: bps });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={item.company}
          onChange={(e) => onChange(item.id, { company: e.target.value })}
          placeholder="Company"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
        <input
          type="text"
          value={item.title}
          onChange={(e) => onChange(item.id, { title: e.target.value })}
          placeholder="Title"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <input
          type="text"
          value={item.location}
          onChange={(e) => onChange(item.id, { location: e.target.value })}
          placeholder="Location"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
        <input
          type="text"
          value={item.startDate}
          onChange={(e) => onChange(item.id, { startDate: e.target.value })}
          placeholder="Start (e.g. Jan 2022)"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={item.endDate}
            onChange={(e) => onChange(item.id, { endDate: e.target.value })}
            placeholder="End (or Present)"
            className="flex-1 border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
          />
          <label className="flex items-center gap-1.5 text-label font-bold shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={item.current}
              onChange={(e) =>
                onChange(item.id, {
                  current: e.target.checked,
                  endDate: e.target.checked ? "Present" : item.endDate,
                })
              }
              className="accent-[#111] w-4 h-4 shrink-0"
            />
            Current
          </label>
        </div>
      </div>
      <textarea
        value={item.description}
        onChange={(e) => onChange(item.id, { description: e.target.value })}
        placeholder="Description"
        rows={2}
        className="w-full border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500 resize-y"
      />
      <div className="space-y-1.5">
        {item.bulletPoints.map((bp, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-label font-bold shrink-0">•</span>
            <input
              type="text"
              value={bp}
              onChange={(e) => updateBullet(i, e.target.value)}
              placeholder="Key achievement or responsibility"
              className="flex-1 border border-black/10 rounded-[14px] px-4 py-2 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
            />
            <button
              onClick={() => removeBullet(i)}
              className="w-6 h-6 rounded-full border border-black/10 flex items-center justify-center text-black/40 hover:text-red-600 hover:border-red-300 transition-all duration-500 shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={addBullet}
          className="flex items-center gap-1 text-[13px] text-black/50 hover:text-black transition-colors duration-300"
        >
          <Plus className="w-3 h-3" /> Add bullet point
        </button>
      </div>
    </div>
  );
}

function EducationItemEditor({
  item,
  onChange,
}: {
  item: ResumeEducationItem;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={item.school}
          onChange={(e) => onChange(item.id, { school: e.target.value })}
          placeholder="School / University"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
        <input
          type="text"
          value={item.degree}
          onChange={(e) => onChange(item.id, { degree: e.target.value })}
          placeholder="Degree"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <input
          type="text"
          value={item.field}
          onChange={(e) => onChange(item.id, { field: e.target.value })}
          placeholder="Field of study"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
        <input
          type="text"
          value={item.startDate}
          onChange={(e) => onChange(item.id, { startDate: e.target.value })}
          placeholder="Start"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
        <input
          type="text"
          value={item.endDate}
          onChange={(e) => onChange(item.id, { endDate: e.target.value })}
          placeholder="End"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={item.gpa}
          onChange={(e) => onChange(item.id, { gpa: e.target.value })}
          placeholder="GPA (optional)"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
      </div>
      <textarea
        value={item.description}
        onChange={(e) => onChange(item.id, { description: e.target.value })}
        placeholder="Description (optional)"
        rows={2}
        className="w-full border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500 resize-y"
      />
    </div>
  );
}

function SkillsEditor({
  items,
  onItemChange,
}: {
  items: ResumeSkillsItem[];
  onItemChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const item = items[0];
  if (!item) return null;

  const addSkill = (skill: string) => {
    if (skill.trim() && !item.skills.includes(skill.trim())) {
      onItemChange(item.id, {
        skills: [...item.skills, skill.trim()],
      });
    }
  };
  const removeSkill = (skill: string) => {
    onItemChange(item.id, {
      skills: item.skills.filter((s) => s !== skill),
    });
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={item.category}
        onChange={(e) => onItemChange(item.id, { category: e.target.value })}
        placeholder="Category (e.g. Languages, Frameworks)"
        className="w-full border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
      />
      <TagInput
        tags={item.skills}
        onAdd={addSkill}
        onRemove={removeSkill}
        placeholder="Type a skill and press Enter"
      />
    </div>
  );
}

function ProjectItemEditor({
  item,
  onChange,
}: {
  item: ResumeProjectItem;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  const addBullet = () => {
    onChange(item.id, { bulletPoints: [...item.bulletPoints, ""] });
  };
  const updateBullet = (index: number, value: string) => {
    const bps = [...item.bulletPoints];
    bps[index] = value;
    onChange(item.id, { bulletPoints: bps });
  };
  const removeBullet = (index: number) => {
    onChange(item.id, {
      bulletPoints: item.bulletPoints.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={item.name}
          onChange={(e) => onChange(item.id, { name: e.target.value })}
          placeholder="Project name"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
        <input
          type="text"
          value={item.url}
          onChange={(e) => onChange(item.id, { url: e.target.value })}
          placeholder="URL (optional)"
          className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
        />
      </div>
      <textarea
        value={item.description}
        onChange={(e) => onChange(item.id, { description: e.target.value })}
        placeholder="Description"
        rows={2}
        className="w-full border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500 resize-y"
      />
      <TagInput
        tags={item.technologies}
        onAdd={(t) =>
          onChange(item.id, { technologies: [...item.technologies, t.trim()] })
        }
        onRemove={(t) =>
          onChange(item.id, {
            technologies: item.technologies.filter((s) => s !== t),
          })
        }
        placeholder=" Technologies used"
      />
      <div className="space-y-1.5">
        {item.bulletPoints.map((bp, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-label font-bold shrink-0">•</span>
            <input
              type="text"
              value={bp}
              onChange={(e) => updateBullet(i, e.target.value)}
              placeholder="Key highlight"
              className="flex-1 border border-black/10 rounded-[14px] px-4 py-2 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
            />
            <button
              onClick={() => removeBullet(i)}
              className="w-6 h-6 rounded-full border border-black/10 flex items-center justify-center text-black/40 hover:text-red-600 hover:border-red-300 transition-all duration-500 shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={addBullet}
          className="flex items-center gap-1 text-[13px] text-black/50 hover:text-black transition-colors duration-300"
        >
          <Plus className="w-3 h-3" /> Add bullet point
        </button>
      </div>
    </div>
  );
}

function CertificationItemEditor({
  item,
  onChange,
}: {
  item: ResumeCertificationItem;
  onChange: (id: string, patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <input
        type="text"
        value={item.name}
        onChange={(e) => onChange(item.id, { name: e.target.value })}
        placeholder="Certification name"
        className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
      />
      <input
        type="text"
        value={item.issuer}
        onChange={(e) => onChange(item.id, { issuer: e.target.value })}
        placeholder="Issuer"
        className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
      />
      <input
        type="text"
        value={item.date}
        onChange={(e) => onChange(item.id, { date: e.target.value })}
        placeholder="Date"
        className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
      />
      <input
        type="text"
        value={item.url}
        onChange={(e) => onChange(item.id, { url: e.target.value })}
        placeholder="URL (optional)"
        className="border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500"
      />
    </div>
  );
}

function CustomSectionEditor({
  section,
  onItemChange,
  onRemove,
  onAdd,
  onFormatChange,
}: {
  section: ResumeSection;
  onItemChange: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onFormatChange: (fmt: "text" | "list") => void;
}) {
  const isText = section.customFormat !== "list";
  const items = section.items as ResumeCustomItem[];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] uppercase tracking-[0.12em] text-black/45">
          Format
        </span>
        <button
          onClick={() => onFormatChange("text")}
          className={`calm-pill ${isText ? "on" : ""}`}
        >
          Text block
        </button>
        <button
          onClick={() => onFormatChange("list")}
          className={`calm-pill ${!isText ? "on" : ""}`}
        >
          List
        </button>
      </div>

      {isText ? (
        <textarea
          value={items[0]?.content || ""}
          onChange={(e) => {
            if (items[0])
              onItemChange(items[0].id, { content: e.target.value });
          }}
          placeholder="Enter content..."
          rows={5}
          className="w-full border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500 resize-y"
        />
      ) : (
        <ItemListEditor
          items={items}
          onItemChange={onItemChange}
          onRemove={onRemove}
          onAdd={onAdd}
          renderItem={(item, onChange) => (
            <textarea
              value={(item as ResumeCustomItem).content}
              onChange={(e) => onChange(item.id, { content: e.target.value })}
              placeholder="Entry content..."
              rows={2}
              className="w-full border border-black/10 rounded-[14px] px-4 py-2.5 text-[14px] bg-white placeholder:text-black/35 outline-none focus:border-black/30 transition-colors duration-500 resize-y"
            />
          )}
        />
      )}
    </div>
  );
}

function ItemListEditor<T extends { id: string }>({
  items,
  onItemChange,
  onRemove,
  onAdd,
  renderItem,
}: {
  items: T[];
  onItemChange: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  renderItem: (
    item: T,
    onChange: (id: string, patch: Record<string, unknown>) => void,
  ) => React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div
          key={item.id ?? i}
          className="border border-black/10 rounded-[14px] p-4 relative bg-white"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-[0.12em] text-black/45">
              #{i + 1}
            </span>
            <button
              onClick={() => onRemove(item.id)}
              className="w-6 h-6 rounded-full border border-black/10 flex items-center justify-center text-black/40 hover:text-red-600 hover:border-red-300 transition-all duration-500"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {renderItem(item, onItemChange)}
        </div>
      ))}
      <button onClick={onAdd} className="calm-pill w-full justify-center">
        <Plus className="w-3.5 h-3.5" /> Add Entry
      </button>
    </div>
  );
}

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      onAdd(input.trim());
      setInput("");
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  }

  return (
    <div className="border border-black/10 rounded-[14px] px-3 py-2 flex flex-wrap gap-1.5 items-center bg-white focus-within:border-black/30 transition-colors duration-500">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/[0.04] text-[11px] font-medium text-black/60"
        >
          {tag}
          <button
            onClick={() => onRemove(tag)}
            className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:text-black transition-colors duration-300"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] text-[14px] bg-transparent outline-none placeholder:text-black/35"
      />
    </div>
  );
}
