import type { CanonicalResume } from "@/lib/tailor/canonical";

// ─── LaTeX rendering (Phase 2.4) ─────────────────────────────────────────────
// Pure string building: canonical resume + contact → pdflatex-safe .tex.
// The renderer assumes canonical fields (see canonical.ts) and performs NO
// normalization of its own. Keep pdflatex-compatible (no fontspec).

export interface ResumeContact {
  name: string;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  github?: string | null;
}

const ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciircumflex{}",
};

export function escapeLatex(text: string): string {
  return text.replace(/[\\&%$#_{}~^]/g, (ch) => ESCAPES[ch]);
}

function bullets(points: string[]): string {
  const items = points.filter((b) => b.trim());
  if (items.length === 0) return "";
  return `\\begin{itemize}\n${items.map((b) => `    \\item ${escapeLatex(b)}`).join("\n")}\n\\end{itemize}\n`;
}

function renderSection(title: string, body: string): string {
  if (!body.trim()) return "";
  return `\\section*{${escapeLatex(title)}}\n\n${body}\n`;
}

function contactLine(c: ResumeContact): string {
  const parts: string[] = [];
  if (c.location) parts.push(escapeLatex(c.location));
  if (c.phone) parts.push(escapeLatex(c.phone));
  if (c.email) parts.push(escapeLatex(c.email));
  const links: string[] = [];
  if (c.linkedin)
    links.push(
      `\\href{${escapeLatex(c.linkedin)}}{${escapeLatex(displayUrl(c.linkedin))}}`,
    );
  if (c.github)
    links.push(
      `\\href{${escapeLatex(c.github)}}{${escapeLatex(displayUrl(c.github))}}`,
    );
  const line1 = parts.join(" \\\\;|\\\\; ");
  const line2 = links.join("\n    \\\\;|\\\\; ");
  return [line1, line2].filter(Boolean).join(" \\\\[2pt]\n    ");
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export function renderLatex(
  resume: CanonicalResume,
  contact: ResumeContact,
): string {
  const header = [
    "\\documentclass[a4paper,10pt]{article}",
    "",
    "\\usepackage[left=0.55in,right=0.55in,top=0.5in,bottom=0.5in]{geometry}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[hidelinks]{hyperref}",
    "\\usepackage{enumitem}",
    "\\usepackage{titlesec}",
    "\\usepackage{tabularx}",
    "\\usepackage{array}",
    "",
    "\\pagestyle{empty}",
    "\\setlength{\\parindent}{0pt}",
    "\\setlength{\\tabcolsep}{0pt}",
    "",
    "\\titleformat{\\section}",
    "{\\large\\bfseries}",
    "{}",
    "{0em}",
    "{}[\\titlerule]",
    "",
    "\\titlespacing{\\section}{0pt}{5pt}{3pt}",
    "",
    "\\setlist[itemize]{",
    "    leftmargin=14pt,",
    "    itemsep=1pt,",
    "    topsep=1pt,",
    "    parsep=0pt,",
    "    partopsep=0pt",
    "}",
    "",
    "\\begin{document}",
    "",
    "%==================== HEADER ====================%",
    "\\begin{center}",
    `    {\\LARGE \\textbf{${escapeLatex(contact.name)}}} \\\\[3pt]`,
    `    ${contactLine(contact)}`,
    "\\end{center}",
    "",
    "\\vspace{-6pt}",
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
          if (content) parts.push(`${escapeLatex(content)}\n`);
          break;
        }
        case "experience": {
          if (!s(f.title) && !s(f.company)) break;
          const dates = [
            s(f.startDate),
            s(f.endDate) || (f.current ? "Present" : ""),
          ]
            .filter(Boolean)
            .join(" -- ");
          parts.push(
            `\\textbf{${escapeLatex(s(f.title))}}${s(f.company) ? ` -- ${escapeLatex(s(f.company))}` : ""} \\hfill ${escapeLatex(dates)} \\\\`,
          );
          if (s(f.location))
            parts.push(`\\textit{${escapeLatex(s(f.location))}}\n`);
          if (s(f.description))
            parts.push(`${escapeLatex(s(f.description))}\n`);
          parts.push(bullets(arr(f.bulletPoints)));
          break;
        }
        case "education": {
          if (!s(f.school) && !s(f.degree)) break;
          const degree = [s(f.degree), s(f.field)].filter(Boolean).join(" in ");
          parts.push(
            `\\textbf{${escapeLatex(s(f.school))}} \\hfill ${escapeLatex([s(f.startDate), s(f.endDate)].filter(Boolean).join(" -- "))} \\\\`,
          );
          if (degree)
            parts.push(
              `${escapeLatex(degree)}${s(f.gpa) ? ` \\hfill ${escapeLatex(s(f.gpa))}` : ""} \\\\\n`,
            );
          if (s(f.description))
            parts.push(`${escapeLatex(s(f.description))}\n`);
          break;
        }
        case "skills": {
          const skills = arr(f.skills);
          if (skills.length === 0) break;
          const label = s(f.category)
            ? `\\textbf{${escapeLatex(s(f.category))}} & `
            : "";
          parts.push(`${label}${skills.map(escapeLatex).join(", ")} \\\\\n`);
          break;
        }
        case "projects": {
          if (!s(f.name)) break;
          const tech = arr(f.technologies);
          parts.push(
            `\\textbf{${escapeLatex(s(f.name))}}${tech.length > 0 ? ` \\hfill ${escapeLatex(tech.join(", "))}` : ""} \\\\\n`,
          );
          if (s(f.description))
            parts.push(`${escapeLatex(s(f.description))}\n`);
          parts.push(bullets(arr(f.bulletPoints)));
          break;
        }
        case "certifications": {
          if (!s(f.name)) break;
          parts.push(
            `${escapeLatex(s(f.name))}${s(f.issuer) ? ` -- ${escapeLatex(s(f.issuer))}` : ""}${s(f.date) ? ` \\hfill ${escapeLatex(s(f.date))}` : ""} \\\\\n`,
          );
          break;
        }
        default: {
          const content = s(f.content);
          if (content) parts.push(`${escapeLatex(content)}\n`);
        }
      }
    }
    // Skills render as a table like the base template when present.
    if (section.type === "skills" && parts.length > 0) {
      bodies.push(
        renderSection(
          section.title,
          `\\begin{tabularx}{\\textwidth}{>{\\bfseries}l X}\n${parts.join("\n")}\\end{tabularx}\n`,
        ),
      );
    } else {
      bodies.push(renderSection(section.title, parts.join("\n")));
    }
  }

  return `${header}\n${bodies.join("\n")}\\end{document}\n`;
}
