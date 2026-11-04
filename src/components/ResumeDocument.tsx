"use client";

import { useRef } from "react";
import { skillCategories } from "@/lib/tailor/document";
import type { DiffSegment, ResumeDiff } from "@/lib/tailor/diff";

export type DraftField = string | boolean | string[];

export type DraftSection = {
  id: string;
  type: string;
  title: string;
  items: {
    id: string;
    kind: string;
    fields: Record<string, DraftField>;
    provenance: { sourceIds: string[]; change: string };
  }[];
};

export type ResumeProfileView = {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  location: string | null;
};

const PAPER_FONT = 'Georgia, "Times New Roman", Times, serif';

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function EditableText({
  value,
  onChange,
  editable,
  className = "",
  multiline = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  className?: string;
  multiline?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  if (!editable) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span
      ref={ref}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline || undefined}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={`resume-editable ${className}`}
      onBlur={(e) =>
        onChange(
          (e.currentTarget.innerText || "").replace(/\u00a0/g, " ").trim(),
        )
      }
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.innerText = value;
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </span>
  );
}

function diffParts(segments: DiffSegment[]): {
  old: string;
  next: string;
  changed: boolean;
  significant: boolean;
} {
  const old = segments
    .filter((segment) => segment.kind !== "add")
    .map((segment) => segment.text)
    .join("");
  const next = segments
    .filter((segment) => segment.kind !== "del")
    .map((segment) => segment.text)
    .join("");
  const changed = segments.some((segment) => segment.kind !== "same");
  const changedWords = segments
    .filter((segment) => segment.kind !== "same")
    .flatMap((segment) => segment.text.trim().split(/\s+/))
    .filter((word) => /[A-Za-z0-9]/.test(word));
  const totalWords = [...old.split(/\s+/), ...next.split(/\s+/)].filter(
    (word) => /[A-Za-z0-9]/.test(word),
  ).length;
  return {
    old,
    next,
    changed,
    significant:
      changed &&
      (changedWords.length >= 3 ||
        changedWords.length / Math.max(totalWords, 1) >= 0.25),
  };
}

function bulletsOf(item: DraftSection["items"][number]): string[] {
  return list(item.fields.bulletPoints ?? item.fields.bullets);
}

function dateRange(fields: Record<string, DraftField>): string {
  const start = text(fields.startDate);
  const end = text(fields.endDate);
  if (fields.current === true)
    return [start, "Present"].filter(Boolean).join(" — ");
  return [start, end].filter(Boolean).join(" — ");
}

function contactLine(profile: ResumeProfileView | null): string {
  if (!profile) return "";
  const links = [profile.linkedin, profile.github]
    .filter((v): v is string => Boolean(v))
    .map((url) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""));
  return [profile.location, profile.phone, profile.email, ...links]
    .filter((v): v is string => Boolean(v))
    .join("  |  ");
}

// ─── Resume paper ────────────────────────────────────────────────────────────
// The draft is rendered as the document the user will actually send, not as a
// form. Every visible field is click-to-edit; the underlying generic item
// fields stay the source of truth for saving and PDF rendering.

export function ResumeDocument({
  profile,
  sections,
  editable,
  mode,
  diff,
  onChangeSectionTitle,
  onChangeField,
  onChangeBullet,
  onAddBullet,
  onRemoveBullet,
  onChangeSkills,
  onRestoreSummary,
  onRestoreBullet,
}: {
  profile: ResumeProfileView | null;
  sections: DraftSection[];
  editable: boolean;
  mode?: "edit" | "changes" | "final";
  diff?: ResumeDiff;
  onChangeSectionTitle: (sectionIndex: number, value: string) => void;
  onChangeField: (
    sectionIndex: number,
    itemIndex: number,
    key: string,
    value: DraftField,
  ) => void;
  onChangeBullet: (
    sectionIndex: number,
    itemIndex: number,
    bulletIndex: number,
    value: string,
  ) => void;
  onAddBullet: (sectionIndex: number, itemIndex: number) => void;
  onRemoveBullet: (
    sectionIndex: number,
    itemIndex: number,
    bulletIndex: number,
  ) => void;
  onChangeSkills: (
    sectionIndex: number,
    itemIndex: number,
    skills: string[],
  ) => void;
  onRestoreSummary: (
    sectionIndex: number,
    itemIndex: number,
    value: string,
  ) => void;
  onRestoreBullet: (
    sectionIndex: number,
    itemIndex: number,
    bulletIndex: number,
    value: string,
  ) => void;
}) {
  const isEditing = mode ? mode === "edit" : editable;
  const showChanges = mode === "changes";
  return (
    <article
      className="resume-paper mx-auto w-full max-w-[760px] bg-white border border-black/[0.12] px-8 sm:px-11 py-9 text-[#171717]"
      style={{ fontFamily: PAPER_FONT }}
      aria-label="Resume document"
    >
      <header className="text-center">
        <div className="text-[26px] leading-tight font-bold tracking-[-0.01em]">
          {profile?.name || "Your Name"}
        </div>
        <div className="text-[11.5px] leading-[1.5] mt-1 text-[#222]">
          {contactLine(profile)}
        </div>
      </header>

      {sections.map((section, si) => (
        <section key={section.id} className="mt-4">
          <div className="flex items-center gap-2 border-b border-[#222] pb-[2px] mb-2">
            <EditableText
              value={section.title}
              onChange={(value) => onChangeSectionTitle(si, value)}
              editable={isEditing}
              ariaLabel={`Section title ${section.title}`}
              className="text-[11px] font-bold uppercase tracking-[0.1em]"
            />
          </div>

          {section.type === "summary" &&
            section.items.map((item, ii) => {
              const itemDiff = diff?.[`${si}:${ii}`];
              if (showChanges && itemDiff?.summary) {
                const parts = diffParts(itemDiff.summary);
                if (parts.significant) {
                  return (
                    <div key={item.id} className="space-y-1">
                      <div className="resume-add block text-[11.5px] leading-[1.5] text-justify whitespace-pre-wrap">
                        {parts.next}
                      </div>
                      <div className="resume-before text-[10px] leading-[1.45] text-justify">
                        <span className="not-italic font-semibold text-[#8c2f2f]">
                          Before:{" "}
                        </span>
                        <del className="resume-del">{parts.old}</del>{" "}
                        <button
                          type="button"
                          onClick={() => onRestoreSummary(si, ii, parts.old)}
                          className="resume-restore"
                        >
                          Restore base
                        </button>
                      </div>
                    </div>
                  );
                }
              }
              return (
                <EditableText
                  key={item.id}
                  value={text(item.fields.content ?? item.fields.summary)}
                  onChange={(value) => onChangeField(si, ii, "content", value)}
                  editable={isEditing}
                  multiline
                  ariaLabel="Summary"
                  className="block text-[11.5px] leading-[1.5] text-justify whitespace-pre-wrap"
                />
              );
            })}

          {section.type === "experience" && (
            <div className="space-y-3">
              {section.items.map((item, ii) => {
                const fields = item.fields;
                const company = text(fields.company);
                const title = text(fields.title);
                const location = text(fields.location);
                const showCompany =
                  company &&
                  !title.toLowerCase().includes(company.toLowerCase());
                const companyLine = showCompany
                  ? [
                      company,
                      location &&
                      !company.toLowerCase().includes(location.toLowerCase())
                        ? location
                        : "",
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : "";
                const dates = dateRange(fields);
                return (
                  <div key={item.id}>
                    <div className="flex items-baseline justify-between gap-4">
                      <EditableText
                        value={title}
                        onChange={(value) =>
                          onChangeField(si, ii, "title", value)
                        }
                        editable={isEditing}
                        ariaLabel={`Role ${ii + 1}`}
                        className="text-[11.5px] font-bold leading-snug"
                      />
                      {dates && (
                        <span className="text-[10.5px] whitespace-nowrap text-[#333]">
                          {dates}
                        </span>
                      )}
                    </div>
                    {companyLine && (
                      <div className="text-[11px] italic text-[#333] leading-snug">
                        {companyLine}
                      </div>
                    )}
                    {(() => {
                      const bullets = bulletsOf(item);
                      const itemDiff = diff?.[`${si}:${ii}`];
                      const removed =
                        showChanges && itemDiff?.removedBullets
                          ? itemDiff.removedBullets
                          : [];
                      if (bullets.length === 0 && removed.length === 0) {
                        return null;
                      }
                      return (
                        <div className="mt-1 space-y-[1px]">
                          {bullets.map((bullet, bi) => {
                            const segments = itemDiff?.bullets[bi];
                            return (
                              <div
                                key={`${item.id}-b${bi}`}
                                className="group flex items-start gap-1.5 text-[11.5px] leading-[1.4]"
                              >
                                <span className="mt-[1px]">•</span>
                                {showChanges && segments ? (
                                  (() => {
                                    const parts = diffParts(segments);
                                    if (!parts.significant) {
                                      return (
                                        <span className="flex-1 text-justify">
                                          {parts.next}
                                        </span>
                                      );
                                    }
                                    return (
                                      <div className="flex-1">
                                        <div className="resume-add text-justify">
                                          {parts.next}
                                        </div>
                                        <div className="resume-before text-justify">
                                          <span className="not-italic font-semibold text-[#8c2f2f]">
                                            Before:{" "}
                                          </span>
                                          <del className="resume-del">
                                            {parts.old}
                                          </del>{" "}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onRestoreBullet(
                                                si,
                                                ii,
                                                bi,
                                                parts.old,
                                              )
                                            }
                                            className="resume-restore"
                                          >
                                            Restore base
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <EditableText
                                    value={bullet}
                                    onChange={(value) =>
                                      onChangeBullet(si, ii, bi, value)
                                    }
                                    editable={isEditing}
                                    multiline
                                    ariaLabel={`Bullet ${bi + 1}`}
                                    className="flex-1 text-justify"
                                  />
                                )}
                                {isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => onRemoveBullet(si, ii, bi)}
                                    aria-label={`Remove bullet ${bi + 1}`}
                                    className="opacity-0 group-hover:opacity-100 text-[11px] text-black/35 hover:text-black transition-opacity"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {removed.map((bullet, index) => (
                            <div
                              key={`${item.id}-removed-${index}`}
                              className="flex items-start gap-1.5 text-[11.5px] leading-[1.4]"
                            >
                              <span className="mt-[1px]">−</span>
                              <del className="resume-del flex-1 text-justify">
                                {bullet}
                              </del>
                            </div>
                          ))}
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => onAddBullet(si, ii)}
                              className="text-[10px] text-black/35 hover:text-black"
                            >
                              + bullet
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {section.type === "education" && (
            <div className="space-y-2">
              {section.items.map((item, ii) => {
                const fields = item.fields;
                const degree = [text(fields.degree), text(fields.field)]
                  .filter(Boolean)
                  .join(" ");
                const right = [text(fields.endDate), text(fields.gpa)]
                  .filter(Boolean)
                  .join("  |  ");
                return (
                  <div key={item.id}>
                    <div className="flex items-baseline justify-between gap-4">
                      <EditableText
                        value={degree}
                        onChange={(value) =>
                          onChangeField(si, ii, "degree", value)
                        }
                        editable={isEditing}
                        ariaLabel="Degree"
                        className="text-[11.5px] font-bold"
                      />
                      {right && (
                        <span className="text-[10.5px] whitespace-nowrap text-[#333]">
                          {right}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <EditableText
                        value={text(fields.school)}
                        onChange={(value) =>
                          onChangeField(si, ii, "school", value)
                        }
                        editable={isEditing}
                        ariaLabel="School"
                        className="text-[11.5px]"
                      />
                      <EditableText
                        value={text(fields.location)}
                        onChange={(value) =>
                          onChangeField(si, ii, "location", value)
                        }
                        editable={isEditing}
                        ariaLabel="School location"
                        className="text-[10.5px] whitespace-nowrap text-[#333]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {section.type === "projects" && (
            <div className="space-y-3">
              {section.items.map((item, ii) => {
                const tech = list(item.fields.technologies);
                return (
                  <div key={item.id}>
                    <div className="flex items-baseline justify-between gap-4">
                      <EditableText
                        value={text(item.fields.name ?? item.fields.title)}
                        onChange={(value) =>
                          onChangeField(si, ii, "name", value)
                        }
                        editable={isEditing}
                        ariaLabel={`Project ${ii + 1}`}
                        className="text-[11.5px] font-bold"
                      />
                      {tech.length > 0 && (
                        <span className="text-[10px] text-[#333] text-right">
                          {tech.join(", ")}
                        </span>
                      )}
                    </div>
                    {(() => {
                      const bullets = bulletsOf(item);
                      const itemDiff = diff?.[`${si}:${ii}`];
                      const removed =
                        showChanges && itemDiff?.removedBullets
                          ? itemDiff.removedBullets
                          : [];
                      if (bullets.length === 0 && removed.length === 0) {
                        return null;
                      }
                      return (
                        <div className="mt-1 space-y-[1px]">
                          {bullets.map((bullet, bi) => {
                            const segments = itemDiff?.bullets[bi];
                            return (
                              <div
                                key={`${item.id}-b${bi}`}
                                className="group flex items-start gap-1.5 text-[11.5px] leading-[1.4]"
                              >
                                <span className="mt-[1px]">•</span>
                                {showChanges && segments ? (
                                  (() => {
                                    const parts = diffParts(segments);
                                    if (!parts.significant) {
                                      return (
                                        <span className="flex-1 text-justify">
                                          {parts.next}
                                        </span>
                                      );
                                    }
                                    return (
                                      <div className="flex-1">
                                        <div className="resume-add text-justify">
                                          {parts.next}
                                        </div>
                                        <div className="resume-before text-justify">
                                          <span className="not-italic font-semibold text-[#8c2f2f]">
                                            Before:{" "}
                                          </span>
                                          <del className="resume-del">
                                            {parts.old}
                                          </del>{" "}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onRestoreBullet(
                                                si,
                                                ii,
                                                bi,
                                                parts.old,
                                              )
                                            }
                                            className="resume-restore"
                                          >
                                            Restore base
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <EditableText
                                    value={bullet}
                                    onChange={(value) =>
                                      onChangeBullet(si, ii, bi, value)
                                    }
                                    editable={isEditing}
                                    multiline
                                    ariaLabel={`Project bullet ${bi + 1}`}
                                    className="flex-1 text-justify"
                                  />
                                )}
                                {isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => onRemoveBullet(si, ii, bi)}
                                    aria-label={`Remove project bullet ${bi + 1}`}
                                    className="opacity-0 group-hover:opacity-100 text-[11px] text-black/35 hover:text-black transition-opacity"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          {removed.map((bullet, index) => (
                            <div
                              key={`${item.id}-removed-${index}`}
                              className="flex items-start gap-1.5 text-[11.5px] leading-[1.4]"
                            >
                              <span className="mt-[1px]">−</span>
                              <del className="resume-del flex-1 text-justify">
                                {bullet}
                              </del>
                            </div>
                          ))}
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => onAddBullet(si, ii)}
                              className="text-[10px] text-black/35 hover:text-black"
                            >
                              + bullet
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {section.type === "skills" && (
            <div className="space-y-[3px]">
              {section.items.map((item, ii) => {
                const groups = skillCategories(list(item.fields.skills));
                return groups.map((group) => (
                  <div
                    key={`${item.id}-${group.category}`}
                    className="flex gap-1 text-[11.5px] leading-[1.45]"
                  >
                    <span className="font-bold whitespace-nowrap">
                      {group.category}:
                    </span>
                    <EditableText
                      value={group.items.join(", ")}
                      onChange={(value) => {
                        const next = groups.map((g) =>
                          g.category === group.category
                            ? {
                                ...g,
                                items: value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : g,
                        );
                        const flat = next.flatMap((g) =>
                          g.items.map((skill, index) =>
                            index === 0 ? `${g.category} ${skill}` : skill,
                          ),
                        );
                        onChangeSkills(si, ii, flat);
                      }}
                      editable={isEditing}
                      ariaLabel={`${group.category} skills`}
                      className="flex-1"
                    />
                  </div>
                ));
              })}
            </div>
          )}

          {![
            "summary",
            "experience",
            "education",
            "projects",
            "skills",
          ].includes(section.type) && (
            <div className="space-y-1">
              {section.items.map((item) => (
                <div key={item.id} className="text-[11.5px]">
                  {Object.entries(item.fields)
                    .filter(([, value]) => typeof value === "string")
                    .map(([key, value]) => (
                      <div key={key}>{String(value)}</div>
                    ))}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </article>
  );
}
