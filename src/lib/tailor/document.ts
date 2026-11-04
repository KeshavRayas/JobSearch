import type { ResumeData } from "@/lib/resume.types";
import type { TailoredItem, TailoredResumeData } from "@/lib/tailor/contract";

type TailoredSection = TailoredResumeData["sections"][number];

// ─── Draft enrichment ────────────────────────────────────────────────────────
// The model rewrites prose; it should not have to restate facts that already
// exist in the base resume. Models routinely drop company names, dates, school
// locations, and project titles. This module fills those factual fields from
// the base evidence so the rendered document is complete while the model's
// rewritten summary and bullets remain intact.

type BaseItem = Record<string, unknown> & { id?: string };

const ACTION_VERBS =
  /^(developed|built|designed|implemented|worked|contributed|diagnosed|created|led|wrote|achieved|automated|improved|managed|optimized|engineered|collaborated|deployed|maintained|tested|analyzed|evaluated|integrated|architected|reduced|increased|supported|owned|used|applied|trained|fine-tuned)\b/i;

const COMMON_TECH = [
  "Stable-Baselines3",
  "Scikit-learn",
  "TensorFlow",
  "PostgreSQL",
  "JavaScript",
  "TypeScript",
  "WebSockets",
  "Kubernetes",
  "Gymnasium",
  "MediaPipe",
  "Streamlit",
  "PyTorch",
  "Next.js",
  "FastAPI",
  "MongoDB",
  "Docker",
  "Prisma",
  "Node.js",
  "Python",
  "React",
  "Redis",
  "AWS",
  "Azure",
  "Linux",
  "Pandas",
  "NumPy",
  "LSTM",
  "ARIMA",
  "SARIMA",
  "GitHub",
  "Java",
  "Go",
  "C++",
  "C#",
  "SQL",
  "Git",
];

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arr(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function baseSections(data: ResumeData) {
  return (data.sections ?? []) as unknown as {
    type?: string;
    items?: BaseItem[];
  }[];
}

function baseItemsOfType(data: ResumeData, type: string): BaseItem[] {
  const section = baseSections(data).find((s) => s.type === type);
  return section?.items ?? [];
}

function findBaseItem(sourceIds: string[], items: BaseItem[]): BaseItem | null {
  for (const id of sourceIds) {
    const exact = items.find((item) => item.id === id);
    if (exact) return exact;
    const parent = items.find(
      (item) => typeof item.id === "string" && id.startsWith(`${item.id}_b`),
    );
    if (parent) return parent;
  }
  return null;
}

function field(item: TailoredItem, key: string): unknown {
  return item.fields[key];
}

function setField(item: TailoredItem, key: string, value: unknown): void {
  item.fields = {
    ...item.fields,
    [key]: value as TailoredItem["fields"][string],
  };
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Fill missing factual fields; existing prose from the model is preserved. */
function fillFacts(
  item: TailoredItem,
  base: BaseItem | null,
  keys: string[],
  overwrite = false,
): void {
  if (!base) return;
  for (const key of keys) {
    const baseValue = base[key];
    if (isBlank(baseValue)) continue;
    if (overwrite || isBlank(field(item, key))) {
      setField(item, key, baseValue);
    }
  }
}

function parseDegree(raw: string): {
  degree: string;
  endDate: string;
  gpa: string;
} {
  let degree = raw.replace(/\s+/g, " ").trim();
  const expected = degree.match(/expected\s+(\d{4})/i);
  const gpa = degree.match(/(?:cgpa|gpa)\s*[:=]?\s*([\d.]+\s*(?:\/\s*\d+)?)/i);
  degree = degree
    .replace(/expected\s+\d{4}/gi, "")
    .replace(/(?:cgpa|gpa)\s*[:=]?\s*[\d.]+\s*(?:\/\s*\d+)?/gi, "")
    .replace(/\s*\|\s*$/g, "")
    .replace(/\s*[|,]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  degree = degree
    .replace(/\s*\.\s*in\s+/i, ". in ")
    .replace(/\s*\.\s*$/g, "")
    .trim();
  return {
    degree,
    endDate: expected ? `Expected ${expected[1]}` : "",
    gpa: gpa ? `GPA: ${gpa[1].replace(/\s*\/\s*/g, "/")}` : "",
  };
}

function splitSchool(raw: string): { school: string; location: string } {
  const value = raw.replace(/\s+/g, " ").trim();
  const at = value.lastIndexOf(",");
  if (at > 0) {
    const before = value.slice(0, at).trim();
    const after = value.slice(at + 1).trim();
    const words = before.split(" ");
    const last = words[words.length - 1] ?? "";
    const isSchoolWord =
      /^(college|university|institute|school|technology)$/i.test(last);
    if (
      after &&
      /^[A-Z][a-z]+$/.test(last) &&
      !isSchoolWord &&
      /college|university|institute|school/i.test(before)
    ) {
      return {
        school: words.slice(0, -1).join(" "),
        location: `${last}, ${after}`,
      };
    }
    return { school: before, location: after };
  }
  return { school: value, location: "" };
}

function techTerms(base: ResumeData): string[] {
  const terms = new Set(COMMON_TECH);
  const skills = baseItemsOfType(base, "skills");
  for (const item of skills) {
    for (const entry of arr(item.skills)) {
      for (const token of entry.split(/[^A-Za-z0-9.+#/-]+/)) {
        const looksLikeTech =
          token.length >= 2 &&
          /[A-Za-z]/.test(token) &&
          (/^[A-Z0-9]/.test(token) || /[.+#/-]/.test(token));
        if (looksLikeTech) terms.add(token);
      }
    }
  }
  const projects = baseItemsOfType(base, "projects");
  for (const item of projects) {
    for (const tech of arr(item.technologies)) terms.add(tech);
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

function splitProjectTitle(
  line: string,
  terms: string[],
): { name: string; technologies: string[] } {
  const value = line.replace(/\s+/g, " ").trim();
  const lower = value.toLowerCase();
  let cut = -1;
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index > 0 && (cut === -1 || index < cut)) cut = index;
  }
  if (cut <= 0) return { name: value, technologies: [] };
  const name = value
    .slice(0, cut)
    .replace(/[\s,;:–-]+$/g, "")
    .trim();
  const technologies = value
    .slice(cut)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    name: name.length >= 3 ? name : value,
    technologies,
  };
}

function bulletNumber(sourceId: string): number | null {
  const match = sourceId.match(/_b(\d+)$/);
  return match ? Number(match[1]) - 1 : null;
}

function looksLikeProjectTitle(line: string, terms: string[]): boolean {
  const value = line.replace(/\s+/g, " ").trim();
  if (!value || value.length > 180) return false;
  if (ACTION_VERBS.test(value)) return false;
  if (!/^[A-Z0-9]/.test(value)) return false;
  const lower = value.toLowerCase();
  const matches = terms.filter((term) => lower.includes(term.toLowerCase()));
  return matches.length >= 2 || value.includes(":");
}

function projectTitles(
  base: BaseItem,
  terms: string[],
): { at: number; name: string; technologies: string[] }[] {
  const bullets = arr(base.bulletPoints);
  const titles: { at: number; name: string; technologies: string[] }[] = [];
  const header = str(base.name);
  if (header) {
    titles.push({ at: -1, ...splitProjectTitle(header, terms) });
  }
  bullets.forEach((line, index) => {
    if (!looksLikeProjectTitle(line, terms)) return;
    titles.push({ at: index, ...splitProjectTitle(line, terms) });
  });
  return titles;
}

function enrichProjects(section: TailoredSection, base: ResumeData): void {
  const baseProjects = baseItemsOfType(base, "projects");
  const terms = techTerms(base);
  for (const item of section.items) {
    const baseItem = findBaseItem(item.provenance.sourceIds, baseProjects);
    if (!baseItem) continue;
    const titles = projectTitles(baseItem, terms);
    const used = item.provenance.sourceIds
      .map(bulletNumber)
      .filter((n): n is number => n !== null);
    const earliest = used.length > 0 ? Math.min(...used) : -1;
    const candidates = titles.filter((t) => t.at <= earliest);
    const chosen = candidates[candidates.length - 1] ?? titles[0];
    if (!chosen) continue;
    if (isBlank(field(item, "name"))) setField(item, "name", chosen.name);
    if (isBlank(field(item, "technologies")) && chosen.technologies.length) {
      setField(item, "technologies", chosen.technologies);
    }
  }
}

export function isContactLike(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
  const links = /linkedin\.com|github\.com/i.test(text);
  const pipes = (text.match(/\|/g) ?? []).length;
  return email && (links || pipes >= 1);
}

function normalizeGpa(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /(?:cgpa|gpa)/i.test(value) ? value : `GPA: ${value}`;
}

function normalizeEndDate(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^\d{4}$/.test(value) ? `Expected ${value}` : value;
}

/** Enrich a tailored draft with factual fields from the base resume. */
export function enrichTailoredData(
  data: TailoredResumeData,
  base: ResumeData,
): TailoredResumeData {
  const out = JSON.parse(JSON.stringify(data)) as TailoredResumeData;
  const experiences = baseItemsOfType(base, "experience");
  const educations = baseItemsOfType(base, "education");
  const projects = baseItemsOfType(base, "projects");

  for (const section of out.sections) {
    if (section.type === "summary") {
      const prose = section.items.filter(
        (item) => !isContactLike(str(field(item, "content"))),
      );
      if (prose.length > 0) {
        section.items = prose;
      } else {
        const fallback = baseItemsOfType(base, "summary")
          .map((item) => str(item.content))
          .find((content) => content && !isContactLike(content));
        if (fallback && section.items[0]) {
          setField(section.items[0], "content", fallback);
        }
      }
    } else if (section.type === "experience") {
      for (const item of section.items) {
        const baseItem = findBaseItem(item.provenance.sourceIds, experiences);
        fillFacts(item, baseItem, ["company", "current"], true);
        fillFacts(item, baseItem, ["startDate", "endDate"]);
      }
    } else if (section.type === "education") {
      for (const item of section.items) {
        const baseItem = findBaseItem(item.provenance.sourceIds, educations);
        if (!baseItem) continue;
        const rawDegree =
          str(field(item, "degree")) ||
          [str(baseItem.degree), str(baseItem.field)]
            .filter(Boolean)
            .join(" in ");
        const parsed = parseDegree(rawDegree);
        if (parsed.degree) setField(item, "degree", parsed.degree);
        if (isBlank(field(item, "field"))) setField(item, "field", "");
        const providedEnd = normalizeEndDate(str(field(item, "endDate")));
        if (providedEnd) setField(item, "endDate", providedEnd);
        else if (parsed.endDate) setField(item, "endDate", parsed.endDate);
        const providedGpa = normalizeGpa(str(field(item, "gpa")));
        if (providedGpa) setField(item, "gpa", providedGpa);
        else if (parsed.gpa) setField(item, "gpa", parsed.gpa);
        const school = splitSchool(
          str(field(item, "school")) || str(baseItem.school),
        );
        const baseSchool = splitSchool(str(baseItem.school));
        if (school.school) setField(item, "school", school.school);
        if (isBlank(field(item, "location"))) {
          const location = school.location || baseSchool.location;
          if (location) setField(item, "location", location);
        }
        fillFacts(item, baseItem, ["startDate"]);
      }
    } else if (section.type === "projects") {
      enrichProjects(section, base);
      // If the base has one project item and the model emitted several, the
      // per-ordinal title walk above is enough; no further merging.
      void projects;
    } else if (section.type === "skills" && section.items.length > 1) {
      // Models sometimes emit the same full skills list several times. Skills
      // are facts copied from the base, so one deduped item is canonical.
      const first = section.items[0];
      const merged: string[] = [];
      for (const item of section.items) {
        for (const skill of arr(field(item, "skills"))) {
          if (!merged.includes(skill)) merged.push(skill);
        }
      }
      if (merged.length > 0) setField(first, "skills", merged);
      section.items = [first];
    }
  }

  return out;
}

/** Parse the flattened skills list into display categories. */
export function skillCategories(
  skills: string[],
): { category: string; items: string[] }[] {
  const prefixes = [
    "Libraries / Frameworks",
    "Cloud / Infrastructure",
    "Developer Tools",
    "Soft Skills",
    "Core CS",
    "Languages",
    "Backend",
    "Frontend",
    "Databases",
    "Tools",
    "Frameworks",
    "Programming Languages",
  ];
  const groups: { category: string; items: string[] }[] = [];
  const cleaned: string[] = [];
  for (const raw of skills) {
    const value = raw.trim();
    if (!value) continue;
    const previous = cleaned[cleaned.length - 1];
    if (value === "tomation" && previous?.endsWith("Au")) {
      cleaned[cleaned.length - 1] = `${previous.slice(0, -2)}Automation`;
      continue;
    }
    if (value === "learn" && previous?.endsWith("Scikit")) {
      cleaned[cleaned.length - 1] = `${previous}-learn`;
      continue;
    }
    cleaned.push(value);
  }
  for (const value of cleaned) {
    const lower = value.toLowerCase();
    const prefix = prefixes.find((p) => {
      const key = p.toLowerCase();
      return (
        lower.startsWith(key) &&
        (value.length === p.length ||
          value[p.length] === " " ||
          /^[A-Z]/.test(value.slice(p.length)))
      );
    });
    if (prefix) {
      const rest = value.slice(prefix.length).trim();
      groups.push({
        category: prefix,
        items: rest ? [rest] : [],
      });
    } else if (groups.length > 0) {
      groups[groups.length - 1].items.push(value);
    } else {
      groups.push({ category: "Skills", items: [value] });
    }
  }
  return groups.filter((g) => g.items.length > 0);
}

/** Convert the base resume into the tailored contract shape (revert to base). */
export function baseToTailoredData(base: ResumeData): TailoredResumeData {
  const sections: TailoredSection[] = [];
  for (const [sectionIndex, section] of (base.sections ?? []).entries()) {
    const type = section.type ?? "custom";
    const kind: TailoredItem["kind"] = (
      [
        "summary",
        "experience",
        "education",
        "skills",
        "projects",
        "certifications",
        "custom",
      ].includes(type)
        ? type
        : "custom"
    ) as TailoredItem["kind"];

    const items: TailoredItem[] = [];
    for (const [itemIndex, baseItem] of (section.items ?? []).entries()) {
      const item = baseItem as unknown as Record<string, unknown>;
      const id = str(item.id) || `base_${sectionIndex}_${itemIndex}`;
      const fields: Record<string, unknown> = {};

      if (type === "summary") {
        const content = str(item.content);
        if (!content || isContactLike(content)) continue;
        fields.content = content;
      } else if (type === "experience") {
        for (const key of [
          "title",
          "company",
          "startDate",
          "endDate",
          "description",
        ]) {
          if (typeof item[key] === "string") fields[key] = item[key];
        }
        fields.current = Boolean(item.current);
        fields.bulletPoints = arr(item.bulletPoints);
      } else if (type === "education") {
        const parsed = parseDegree(
          [str(item.degree), str(item.field)].filter(Boolean).join(" "),
        );
        fields.degree = parsed.degree || str(item.degree);
        fields.field = "";
        fields.endDate = parsed.endDate;
        fields.gpa = parsed.gpa;
        for (const key of ["school", "location", "startDate", "description"]) {
          if (typeof item[key] === "string") fields[key] = item[key];
        }
      } else if (type === "projects") {
        for (const key of ["name", "description"]) {
          if (typeof item[key] === "string") fields[key] = item[key];
        }
        fields.technologies = arr(item.technologies);
        fields.bulletPoints = arr(item.bulletPoints);
      } else if (type === "skills") {
        fields.category = str(item.category) || "Skills";
        fields.skills = arr(item.skills);
      } else if (type === "certifications") {
        for (const key of ["name", "issuer", "date"]) {
          if (typeof item[key] === "string") fields[key] = item[key];
        }
      } else {
        for (const [key, value] of Object.entries(item)) {
          if (key === "id") continue;
          if (typeof value === "string" || typeof value === "boolean") {
            fields[key] = value;
          } else if (Array.isArray(value)) {
            fields[key] = arr(value);
          }
        }
      }

      items.push({
        id,
        kind,
        fields: fields as TailoredItem["fields"],
        provenance: { sourceIds: [id], change: "UNCHANGED" },
      });
    }

    if (items.length === 0) continue;
    sections.push({
      id: str(section.id) || `base_section_${sectionIndex}`,
      type,
      title: str(section.title) || "Section",
      items,
    });
  }

  if (sections.length === 0) {
    return {
      sections: [
        {
          id: "base_empty",
          type: "summary",
          title: "Summary",
          items: [
            {
              id: "base_empty_item",
              kind: "summary",
              fields: { content: "" },
              provenance: {
                sourceIds: ["base_empty_item"],
                change: "UNCHANGED",
              },
            },
          ],
        },
      ],
    };
  }
  return { sections };
}
