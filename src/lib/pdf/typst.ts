import type { CanonicalResume } from "@/lib/tailor/canonical";
import type { ResumeContact } from "@/lib/pdf/latex";
import { displayUrl } from "@/lib/pdf/latex";

// ─── Typst rendering (Phase 1 + 5A template) ────────────────────────────────
// Data serialization, not markup building: all presentation lives in
// assets/resume-template.typ (functions). User text travels as Typst string
// arguments, so escaping is just backslash + double-quote — the old
// 14-character markup escaper is gone. The renderer assumes canonical
// fields (see canonical.ts) and performs NO normalization.

/** Escape for inside Typst double-quoted strings. Markup chars are literal. */
export function escapeTypst(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function typstStr(text: string): string {
  return `"${escapeTypst(text)}"`;
}

function typstArr(items: string[]): string {
  return typstTuple(items.map(typstStr));
}

/**
 * Tuple of pre-formatted elements. NOTE: `(x)` is just grouping in Typst —
 * only the trailing comma makes a 1-tuple. Forgetting it makes map/at
 * iterate string characters (we debugged exactly that: "L a G o").
 */
function typstTuple(items: string[]): string {
  if (items.length === 0) return "()";
  if (items.length === 1) return `(${items[0]},)`;
  return `(${items.join(", ")})`;
}

function contactParts(c: ResumeContact): { line1: string[]; links: string } {
  const line1: string[] = [];
  if (c.location) line1.push(c.location);
  if (c.phone) line1.push(c.phone);
  if (c.email) line1.push(c.email);
  const links: [string, string][] = [];
  if (c.linkedin) links.push([displayUrl(c.linkedin), c.linkedin]);
  if (c.github) links.push([displayUrl(c.github), c.github]);
  const linkTuple = typstTuple(
    links.map(([text, url]) => `(${typstStr(text)}, ${typstStr(url)})`),
  );
  return { line1, links: linkTuple };
}

export function renderTypst(
  resume: CanonicalResume,
  contact: ResumeContact,
): string {
  const { line1, links } = contactParts(contact);
  const header = [
    '#import "resume-template.typ": *',
    "",
    '#set page(paper: "a4", margin: (left: 0.55in, right: 0.55in, top: 0.5in, bottom: 0.5in))',
    '#set text(font: "Libertinus Serif", size: 10pt)',
    "#set par(spacing: 5pt, leading: 0.6em)",
    "#set list(marker: [\u2022], indent: 14pt, body-indent: 6pt, spacing: 1pt)",
    "",
    `#doc-header(${typstStr(contact.name)}, ${typstArr(line1)}, ${links})`,
    "",
  ].join("\n");

  const bodies: string[] = [];
  for (const section of resume.sections) {
    const parts: string[] = [];
    for (const item of section.items) {
      const f = item.fields as unknown as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" ? v : "");
      const arr = (v: unknown) =>
        Array.isArray(v)
          ? v.filter((x): x is string => typeof x === "string")
          : [];
      switch (section.type) {
        case "summary": {
          const content = s(f.content);
          if (content) parts.push(`${typstStr(content)} + parbreak()`);
          break;
        }
        case "experience": {
          if (!s(f.title) && !s(f.company)) break;
          const dates = [
            s(f.startDate),
            s(f.endDate) || (f.current ? "Present" : ""),
          ]
            .filter(Boolean)
            .join(" \u2013 ");
          const rest = s(f.company) ? ` \u2013 ${s(f.company)}` : "";
          parts.push(
            `#entry(${typstStr(s(f.title))}, ${typstStr(rest)}, ${typstStr(dates)}, ${typstStr(s(f.location))}, ${typstStr(s(f.description))}, ${typstArr(arr(f.bulletPoints).filter((b) => b.trim()))})`,
          );
          break;
        }
        case "education": {
          if (!s(f.school) && !s(f.degree)) break;
          const degree = [s(f.degree), s(f.field)].filter(Boolean).join(" in ");
          const dates = [s(f.startDate), s(f.endDate)]
            .filter(Boolean)
            .join(" \u2013 ");
          parts.push(
            `#entry(${typstStr(s(f.school))}, "", ${typstStr(dates)}, "", ${typstStr(degree + (s(f.gpa) ? ` (${s(f.gpa)})` : "") + (s(f.description) ? ` ${s(f.description)}` : ""))}, ())`,
          );
          break;
        }
        case "skills": {
          const skills = arr(f.skills);
          if (skills.length === 0) break;
          parts.push(
            `(${typstStr(s(f.category) || "Skills")}, ${typstStr(skills.join(", "))})`,
          );
          break;
        }
        case "projects": {
          if (!s(f.name)) break;
          const tech = arr(f.technologies);
          parts.push(
            `#entry(${typstStr(s(f.name))}, "", ${typstStr(tech.join(", "))}, "", ${typstStr(s(f.description))}, ${typstArr(arr(f.bulletPoints).filter((b) => b.trim()))})`,
          );
          break;
        }
        case "certifications": {
          if (!s(f.name)) break;
          const rest = s(f.issuer) ? ` \u2013 ${s(f.issuer)}` : "";
          parts.push(
            `#cert-line(${typstStr(s(f.name))}, ${typstStr(rest)}, ${typstStr(s(f.date))})`,
          );
          break;
        }
        default: {
          const content = s(f.content);
          if (content) parts.push(`${typstStr(content)} + parbreak()`);
        }
      }
    }
    if (parts.length === 0) continue;
    // Skills render as a two-column grid; everything else stacks.
    // parts holds (label, body) tuples for skills, content calls otherwise.
    const body =
      section.type === "skills"
        ? `#skill-grid(${typstTuple(parts)})`
        : parts.join("\n");
    bodies.push(`#section(${typstStr(section.title)})[\n${body}\n]`);
  }

  return `${header}\n${bodies.join("\n")}`;
}
