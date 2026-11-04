import { describe, it, expect } from "vitest";
import { buildResumeDiff, wordDiff } from "@/lib/tailor/diff";
import { baseToTailoredData } from "@/lib/tailor/document";
import type { ResumeData } from "@/lib/resume.types";

describe("wordDiff", () => {
  it("marks additions and removals word by word", () => {
    const segments = wordDiff(
      "Built backend APIs with Postgres.",
      "Built reliable backend APIs with Postgres and Redis.",
    );
    expect(
      segments.some((s) => s.kind === "add" && s.text.includes("Redis")),
    ).toBe(true);
    expect(
      segments.some((s) => s.kind === "del" && s.text.includes("Postgres")),
    ).toBe(true);
  });

  it("returns only the new text when the base is empty", () => {
    expect(wordDiff("", "New bullet")).toEqual([
      { text: "New bullet", kind: "add" },
    ]);
  });
});

const base = {
  sections: [
    {
      id: "base_sum",
      type: "summary",
      title: "Summary",
      items: [
        { id: "contact", content: "Ada Lovelace | ada@example.com" },
        {
          id: "sum",
          content: "Computer science student building backend APIs.",
        },
      ],
    },
    {
      id: "base_exp",
      type: "experience",
      title: "Experience",
      items: [
        {
          id: "exp",
          title: "Intern",
          company: "Acme",
          startDate: "Feb 2026",
          current: true,
          bulletPoints: [
            "Built backend APIs with Postgres.",
            "Wrote integration tests.",
          ],
        },
      ],
    },
  ],
} as unknown as ResumeData;

const tailored = {
  sections: [
    {
      id: "s1",
      type: "summary",
      title: "Summary",
      items: [
        {
          id: "sum",
          kind: "summary",
          fields: { content: "Backend engineer building reliable APIs." },
          provenance: { sourceIds: ["sum"], change: "REWRITE" },
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
          fields: {
            title: "Intern",
            bulletPoints: [
              "Built reliable backend APIs with Postgres and Redis.",
            ],
          },
          provenance: { sourceIds: ["exp_b1", "exp_b2"], change: "REWRITE" },
        },
      ],
    },
  ],
} as unknown as Parameters<typeof buildResumeDiff>[1];

describe("buildResumeDiff", () => {
  it("diffs the summary and aligns bullets to the base item", () => {
    const diff = buildResumeDiff(base, tailored);
    expect(diff["0:0"].summary?.some((s) => s.kind === "add")).toBe(true);
    expect(diff["1:0"].bullets[0].some((s) => s.kind !== "same")).toBe(true);
    expect(diff["1:0"].removedBullets).toContain("Wrote integration tests.");
  });
});

describe("baseToTailoredData", () => {
  it("drops contact blocks and carries factual fields", () => {
    const data = baseToTailoredData(base);
    expect(data.sections[0].items).toHaveLength(1);
    expect(data.sections[0].items[0].fields.content).toBe(
      "Computer science student building backend APIs.",
    );
    expect(data.sections[1].items[0].fields.startDate).toBe("Feb 2026");
    expect(data.sections[1].items[0].fields.current).toBe(true);
  });
});
