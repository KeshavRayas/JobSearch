import { describe, it, expect } from "vitest";
import { enrichTailoredData, skillCategories } from "@/lib/tailor/document";
import type { ResumeData } from "@/lib/resume.types";
import type { TailoredResumeData } from "@/lib/tailor/contract";

const base = {
  sections: [
    {
      id: "base_sum",
      type: "summary",
      title: "Summary",
      items: [
        {
          id: "base_contact",
          content: "Ada Lovelace London | ada@example.com",
        },
        { id: "base_summary", content: "Engineer." },
      ],
    },
    {
      id: "base_exp",
      type: "experience",
      title: "Experience",
      items: [
        {
          id: "base_exp_1",
          title: "Software Intern",
          company: "Analytical Engines Ltd",
          location: "London",
          startDate: "Feb 2026",
          endDate: "",
          current: true,
          bulletPoints: ["Developed engines."],
        },
      ],
    },
    {
      id: "base_edu",
      type: "education",
      title: "Education",
      items: [
        {
          id: "base_edu_1",
          school: "Example College, London",
          degree: "B.E",
          field: ". in Computer Science Expected 2026 | CGPA: 8.1/10",
        },
      ],
    },
    {
      id: "base_proj",
      type: "projects",
      title: "Projects",
      items: [
        {
          id: "base_proj_1",
          name: "RL for Grid Optimization Python, PyTorch, Gymnasium",
          bulletPoints: [
            "Developed a dispatch framework.",
            "Built a Gymnasium environment.",
            "SignBridge: Sign Recognition Next.js, FastAPI, MediaPipe",
            "Developed a recognition system.",
            "Designed a Docker monorepo.",
            "Weather Prediction using ML Python, TensorFlow, Streamlit",
            "Built a forecasting system.",
          ],
          technologies: [],
        },
      ],
    },
    {
      id: "base_skills",
      type: "skills",
      title: "Skills",
      items: [
        {
          id: "base_skills_1",
          category: "General",
          skills: [
            "Languages Python",
            "Go",
            "Cloud / Infrastructure Infrastructure Au",
            "tomation",
            "Libraries / Frameworks Scikit",
            "learn",
          ],
        },
      ],
    },
  ],
} as unknown as ResumeData;

const sparse = {
  sections: [
    {
      id: "s1",
      type: "summary",
      title: "Summary",
      items: [
        {
          id: "summary",
          kind: "summary",
          fields: { content: "Engineer." },
          provenance: { sourceIds: ["base_summary"], change: "REWRITE" },
        },
      ],
    },
    {
      id: "s2",
      type: "experience",
      title: "Experience",
      items: [
        {
          id: "exp",
          kind: "experience",
          fields: { title: "Software Intern", bulletPoints: ["Built things."] },
          provenance: { sourceIds: ["base_exp_1_b1"], change: "REWRITE" },
        },
      ],
    },
    {
      id: "s3",
      type: "education",
      title: "Education",
      items: [
        {
          id: "edu",
          kind: "education",
          fields: {
            degree: "B.E . in Computer Science Expected 2026 | CGPA: 8.1/10",
          },
          provenance: { sourceIds: ["base_edu_1"], change: "REWRITE" },
        },
      ],
    },
    {
      id: "s4",
      type: "projects",
      title: "Projects",
      items: [
        {
          id: "p1",
          kind: "projects",
          fields: { bulletPoints: ["Built a Gymnasium environment."] },
          provenance: {
            sourceIds: ["base_proj_1_b1", "base_proj_1_b2"],
            change: "REWRITE",
          },
        },
        {
          id: "p2",
          kind: "projects",
          fields: { bulletPoints: ["Developed recognition."] },
          provenance: {
            sourceIds: ["base_proj_1_b3", "base_proj_1_b4"],
            change: "REWRITE",
          },
        },
        {
          id: "p3",
          kind: "projects",
          fields: { bulletPoints: ["Built forecasting."] },
          provenance: {
            sourceIds: ["base_proj_1_b6", "base_proj_1_b7"],
            change: "REWRITE",
          },
        },
      ],
    },
    {
      id: "s5",
      type: "skills",
      title: "Skills",
      items: [
        {
          id: "skills",
          kind: "skills",
          fields: { category: "General", skills: [] },
          provenance: { sourceIds: ["base_skills_1"], change: "UNCHANGED" },
        },
      ],
    },
  ],
} as unknown as TailoredResumeData;

describe("enrichTailoredData", () => {
  it("fills facts and keeps model prose", () => {
    const out = enrichTailoredData(sparse, base);
    const exp = out.sections[1].items[0];
    expect(exp.fields.company).toBe("Analytical Engines Ltd");
    expect(exp.fields.startDate).toBe("Feb 2026");
    expect(exp.fields.current).toBe(true);
    expect((exp.fields.bulletPoints as string[])[0]).toBe("Built things.");

    const edu = out.sections[2].items[0];
    expect(edu.fields.degree).toBe("B.E. in Computer Science");
    expect(edu.fields.endDate).toBe("Expected 2026");
    expect(edu.fields.gpa).toBe("GPA: 8.1/10");
  });

  it("recovers project names and technologies from cited bullets", () => {
    const out = enrichTailoredData(sparse, base);
    const projects = out.sections[3].items;
    expect(projects[0].fields.name).toBe("RL for Grid Optimization");
    expect(projects[0].fields.technologies).toEqual([
      "Python",
      "PyTorch",
      "Gymnasium",
    ]);
    expect(projects[1].fields.name).toBe("SignBridge: Sign Recognition");
    expect(projects[1].fields.technologies).toEqual([
      "Next.js",
      "FastAPI",
      "MediaPipe",
    ]);
    expect(projects[2].fields.name).toBe("Weather Prediction using ML");
    expect(projects[2].fields.technologies).toEqual([
      "Python",
      "TensorFlow",
      "Streamlit",
    ]);
  });

  it("drops a contact summary and collapses duplicate skills items", () => {
    const noisy = JSON.parse(JSON.stringify(sparse)) as TailoredResumeData;
    noisy.sections[0].items.unshift({
      id: "contact",
      kind: "summary",
      fields: {
        content:
          "Ada Lovelace London | ada@example.com | linkedin.com/in/ada | github.com/ada",
      },
      provenance: { sourceIds: ["base_contact"], change: "UNCHANGED" },
    });
    noisy.sections[4].items.push({
      id: "skills-duplicate",
      kind: "skills",
      fields: { category: "General", skills: [] },
      provenance: { sourceIds: ["base_skills_1"], change: "UNCHANGED" },
    });

    const out = enrichTailoredData(noisy, base);
    expect(out.sections[0].items).toHaveLength(1);
    expect(out.sections[0].items[0].fields.content).toBe("Engineer.");
    expect(out.sections[4].items).toHaveLength(1);
  });
});

describe("skillCategories", () => {
  it("repairs split extraction fragments and preserves categories", () => {
    expect(
      skillCategories([
        "Languages Python",
        "Go",
        "Cloud / Infrastructure Infrastructure Au",
        "tomation",
        "Libraries / Frameworks Scikit",
        "learn",
      ]),
    ).toEqual([
      { category: "Languages", items: ["Python", "Go"] },
      {
        category: "Cloud / Infrastructure",
        items: ["Infrastructure Automation"],
      },
      { category: "Libraries / Frameworks", items: ["Scikit-learn"] },
    ]);
  });
});
