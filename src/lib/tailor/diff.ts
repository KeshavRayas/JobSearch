import type { ResumeData } from "@/lib/resume.types";
import { isContactLike } from "@/lib/tailor/document";

// ─── Resume change map ───────────────────────────────────────────────────────
// Deterministic, model-free diff between the base resume and the current
// tailored draft. The workspace renders green additions and red removals; the
// PDF never sees these segments.

export type DiffKind = "same" | "add" | "del";
export type DiffSegment = { text: string; kind: DiffKind };

export type ItemDiff = {
  summary?: DiffSegment[];
  bullets: Record<number, DiffSegment[]>;
  removedBullets: string[];
};

export type ResumeDiff = Record<string, ItemDiff>;

type DiffItem = {
  fields: Record<string, unknown>;
  provenance: { sourceIds: string[] };
};

type DiffSection = {
  type: string;
  items: DiffItem[];
};

export type DiffInput = { sections: DiffSection[] };

type BaseItem = Record<string, unknown> & { id?: string };

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

function merge(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const segment of segments) {
    const last = out[out.length - 1];
    if (last && last.kind === segment.kind) last.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

/** Word-level LCS diff. Whitespace is preserved as tokens. */
export function wordDiff(base: string, next: string): DiffSegment[] {
  if (base === next) return base ? [{ text: base, kind: "same" }] : [];
  if (!base) return next ? [{ text: next, kind: "add" }] : [];
  if (!next) return [{ text: base, kind: "del" }];

  const a = tokenize(base);
  const b = tokenize(next);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      segments.push({ text: a[i], kind: "same" });
      i++;
      j++;
    } else if (
      j < b.length &&
      (i === a.length || table[i][j + 1] >= table[i + 1][j])
    ) {
      segments.push({ text: b[j], kind: "add" });
      j++;
    } else {
      segments.push({ text: a[i], kind: "del" });
      i++;
    }
  }
  return merge(segments);
}

function words(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 1),
  );
}

function similarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / Math.max(left.size, right.size);
}

function itemsOfType(base: ResumeData, type: string): BaseItem[] {
  return (base.sections ?? [])
    .filter((section) => section.type === type)
    .flatMap((section) => (section.items ?? []) as unknown as BaseItem[]);
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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function baseSummary(base: ResumeData): string {
  const summaries = itemsOfType(base, "summary")
    .map((item) => text(item.content))
    .filter((value) => value && !isContactLike(value));
  return summaries.sort((a, b) => b.length - a.length)[0] ?? "";
}

function bulletDiffs(
  tailoredBullets: string[],
  baseBullets: string[],
): Pick<ItemDiff, "bullets" | "removedBullets"> {
  const used = new Set<number>();
  const bullets: Record<number, DiffSegment[]> = {};

  tailoredBullets.forEach((bullet, index) => {
    let best = -1;
    let bestScore = 0;
    baseBullets.forEach((candidate, candidateIndex) => {
      if (used.has(candidateIndex)) return;
      const score = similarity(candidate, bullet);
      if (score > bestScore) {
        best = candidateIndex;
        bestScore = score;
      }
    });
    if (best >= 0 && bestScore >= 0.55) {
      used.add(best);
      bullets[index] = wordDiff(baseBullets[best], bullet);
    } else {
      bullets[index] = [{ text: bullet, kind: "add" }];
    }
  });

  const removedBullets = baseBullets
    .filter((_, index) => !used.has(index))
    .filter((baseBullet) => {
      const strongest = tailoredBullets.reduce(
        (score, bullet) => Math.max(score, similarity(baseBullet, bullet)),
        0,
      );
      return strongest < 0.35;
    });
  return { bullets, removedBullets };
}

/** Merge PDF-extracted visual lines back into logical bullets. */
function logicalBullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const value = raw.trim();
    if (!value) continue;
    const previous = out[out.length - 1];
    const continuation =
      previous &&
      (previous.endsWith("-") || /^[a-z]/.test(value)) &&
      !/^[A-Z]/.test(value);
    if (continuation && previous) {
      out[out.length - 1] = `${previous.replace(/-$/, "")} ${value}`.replace(
        /\s+/g,
        " ",
      );
    } else {
      out.push(value);
    }
  }
  return out;
}

function citedBulletIndices(sourceIds: string[]): number[] {
  return sourceIds
    .map((id) => {
      const match = id.match(/_b(\d+)$/);
      return match ? Number(match[1]) - 1 : -1;
    })
    .filter((index) => index >= 0);
}

function baseBulletsFor(
  sectionType: string,
  item: DiffItem,
  baseItem: BaseItem | null,
): string[] {
  const lines = list(baseItem?.bulletPoints);
  if (sectionType !== "projects" || lines.length === 0) {
    return logicalBullets(lines);
  }

  const indices = citedBulletIndices(item.provenance.sourceIds);
  if (indices.length === 0) return logicalBullets(lines);
  const start = Math.min(...indices);
  const end = Math.max(...indices);
  const name = text(item.fields.name).toLowerCase();
  const subset = lines.slice(start, end + 1).filter((line) => {
    const value = line.trim().toLowerCase();
    if (!value) return false;
    if (name && value.startsWith(name.slice(0, Math.min(24, name.length)))) {
      return false;
    }
    return true;
  });
  return logicalBullets(subset);
}

export function buildResumeDiff(
  base: ResumeData,
  tailored: DiffInput,
): ResumeDiff {
  const diff: ResumeDiff = {};
  const summaryBase = baseSummary(base);

  tailored.sections.forEach((section, sectionIndex) => {
    const baseItems = itemsOfType(base, section.type);
    section.items.forEach((item, itemIndex) => {
      const baseItem = findBaseItem(item.provenance.sourceIds, baseItems);
      const key = `${sectionIndex}:${itemIndex}`;
      const entry: ItemDiff = { bullets: {}, removedBullets: [] };

      if (section.type === "summary") {
        const next = text(item.fields.content ?? item.fields.summary);
        if (summaryBase || next) entry.summary = wordDiff(summaryBase, next);
      }

      if (section.type === "experience" || section.type === "projects") {
        const nextBullets = list(
          item.fields.bulletPoints ?? item.fields.bullets,
        ).filter(Boolean);
        const baseBullets = baseBulletsFor(section.type, item, baseItem);
        Object.assign(entry, bulletDiffs(nextBullets, baseBullets));
      }

      if (
        entry.summary ||
        Object.keys(entry.bullets).length ||
        entry.removedBullets.length
      ) {
        diff[key] = entry;
      }
    });
  });

  return diff;
}
