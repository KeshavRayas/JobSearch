import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { analyzeJob } from "@/lib/analysis/service";
import { tailorResume } from "@/lib/tailor/service";
import { renderPdf } from "@/lib/pdf/service";
import { checkUrl } from "@/lib/liveness";
import { getTopMatches } from "@/lib/repositories/matches.repository";
import {
  POST as decisionPOST,
  GET as decisionGET,
} from "@/app/api/jobs/[id]/decision/route";
import { POST as judgePOST } from "@/app/api/jobs/[id]/judge/route";
import type { LlmProvider } from "@/lib/llm/types";

// ─── Phase 2.5.1: failure-path proof (DB-backed) ─────────────────────────────
// Every test uses isolated fixtures (test-25x-*) cleaned up afterwards.
// What is proven: a failed operation NEVER destroys the previous artifact.

let uid = 0;
const tag = () => `25x${Date.now().toString(36)}${uid++}`;

const throwingProvider: LlmProvider = {
  name: "throwing-stub",
  async generateJson() {
    throw new Error("model down");
  },
};

const garbageProvider: LlmProvider = {
  name: "garbage-stub",
  async generateJson() {
    return { nope: true };
  },
};

const created = {
  companies: [] as string[],
  jobs: [] as string[],
  resumes: [] as string[],
  runs: [] as string[],
};
let previousPin: { id: string; baseResumeId: string | null } | null = null;

async function makeCompany() {
  const t = tag();
  const c = await prisma.company.create({
    data: { name: `TestCo ${t}`, slug: `test-co-${t}`, companyType: "STARTUP" },
  });
  created.companies.push(c.id);
  return c;
}

async function makeJob(
  companyId: string,
  overrides: Record<string, unknown> = {},
) {
  const t = tag();
  const j = await prisma.job.create({
    data: {
      externalId: `test-${t}`,
      source: "GREENHOUSE",
      title: "Test Engineer",
      description: "Test posting about Go and APIs.",
      applyUrl: "https://example.com/jobs/1",
      companyId,
      skills: ["Go"],
      classificationScore: 0.8,
      ...overrides,
    } as never,
  });
  created.jobs.push(j.id);
  return j;
}

async function makeBaseResume() {
  const r = await prisma.resume.create({
    data: {
      title: `test-base ${tag()}`,
      skills: ["Go"],
      content: {
        sections: [
          {
            id: "t_sum",
            type: "summary",
            title: "Summary",
            items: [{ id: "t_s1", content: "Test engineer with Go." }],
          },
          {
            id: "t_exp",
            type: "experience",
            title: "Experience",
            items: [
              {
                id: "t_e1",
                company: "T",
                title: "Dev",
                location: "",
                startDate: "",
                endDate: "",
                current: false,
                description: "",
                bulletPoints: ["bullet_t_01: Built things with Go."],
              },
            ],
          },
          {
            id: "t_edu",
            type: "education",
            title: "Education",
            items: [
              {
                id: "t_d1",
                school: "S",
                degree: "B",
                field: "",
                startDate: "",
                endDate: "",
                gpa: "",
                description: "",
              },
            ],
          },
          {
            id: "t_skl",
            type: "skills",
            title: "Skills",
            items: [{ id: "t_k1", category: "L", skills: ["Go"] }],
          },
        ],
      },
    },
  });
  created.resumes.push(r.id);
  // Pin the profile to the fixture resume so services never depend on
  // timestamp ordering against real resumes. Restored in afterEach.
  const profile = await prisma.profile.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (profile) {
    previousPin = { id: profile.id, baseResumeId: profile.baseResumeId };
    await prisma.profile.update({
      where: { id: profile.id },
      data: { baseResumeId: r.id },
    });
  }
  return r;
}

async function makeAnalysis(jobId: string) {
  return prisma.jobAnalysis.create({
    data: {
      jobId,
      summary: "Fixture analysis.",
      responsibilities: [],
      requiredSkills: ["Go"],
      preferredSkills: [],
      matchedSkills: ["Go"],
      missingSkills: [],
      experienceRequirements: [],
      potentialConcerns: [],
      verdict: "POSSIBLE",
      verdictReasons: ["fixture"],
    },
  });
}

/** Minimal tailored output that passes the deterministic gate vs the fixture base. */
function validTailoredFixture() {
  return {
    sections: [
      {
        id: "t_sum",
        type: "summary",
        title: "Summary",
        items: [
          {
            id: "t_s1",
            kind: "summary",
            fields: { content: "Test engineer with Go." },
            provenance: { sourceIds: ["t_s1"], change: "UNCHANGED" },
          },
        ],
      },
      {
        id: "t_exp",
        type: "experience",
        title: "Experience",
        items: [
          {
            id: "t_e1",
            kind: "experience",
            fields: { title: "Dev", company: "T" },
            provenance: { sourceIds: ["t_e1"], change: "REWRITE" },
          },
        ],
      },
      {
        id: "t_edu",
        type: "education",
        title: "Education",
        items: [
          {
            id: "t_d1",
            kind: "education",
            fields: { school: "S" },
            provenance: { sourceIds: ["t_d1"], change: "REWRITE" },
          },
        ],
      },
      {
        id: "t_skl",
        type: "skills",
        title: "Skills",
        items: [
          {
            id: "t_k1",
            kind: "skills",
            fields: { category: "L", skills: ["Go"] },
            provenance: { sourceIds: ["t_k1"], change: "UNCHANGED" },
          },
        ],
      },
    ],
  };
}

function stubTailored(output: unknown): LlmProvider {
  return {
    name: "tailor-stub",
    async generateJson() {
      return output;
    },
  };
}

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });
async function postJson(
  route: (req: Request, ctx: never) => Promise<Response>,
  id: string,
  body: unknown,
) {
  const res = await route(
    new Request("http://test/", { method: "POST", body: JSON.stringify(body) }),
    ctxFor(id) as never,
  );
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

afterEach(async () => {
  await prisma.job.deleteMany({ where: { id: { in: created.jobs } } });
  await prisma.company.deleteMany({ where: { id: { in: created.companies } } });
  await prisma.resume.deleteMany({ where: { id: { in: created.resumes } } });
  await prisma.nightlyRun.deleteMany({ where: { id: { in: created.runs } } });
  if (previousPin) {
    await prisma.profile.update({
      where: { id: previousPin.id },
      data: { baseResumeId: previousPin.baseResumeId },
    });
  }
  created.jobs = [];
  created.companies = [];
  created.resumes = [];
  created.runs = [];
  previousPin = null;
});

beforeEach(async () => {
  await makeBaseResume();
});

describe("analyze failure preservation", () => {
  it("creates nothing when the model fails", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    await expect(analyzeJob(j.id, throwingProvider)).rejects.toThrow();
    expect(
      await prisma.jobAnalysis.findUnique({ where: { jobId: j.id } }),
    ).toBeNull();
  });

  it("keeps the previous analysis when re-analyze fails", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    const before = await makeAnalysis(j.id);
    await expect(analyzeJob(j.id, throwingProvider)).rejects.toThrow();
    const after = await prisma.jobAnalysis.findUnique({
      where: { jobId: j.id },
    });
    expect(after?.id).toBe(before.id);
    expect(after?.summary).toBe("Fixture analysis.");
    expect(after?.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });
});

describe("tailor failure preservation + versioning", () => {
  it("persists nothing on garbage output", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    await makeAnalysis(j.id);
    await expect(tailorResume(j.id, garbageProvider)).rejects.toThrow();
    expect(await prisma.tailoredResume.count({ where: { jobId: j.id } })).toBe(
      0,
    );
  });

  it("keeps v1 byte-identical when re-tailor is structurally invalid", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    await makeAnalysis(j.id);
    await tailorResume(j.id, stubTailored(validTailoredFixture()));
    const v1before = await prisma.tailoredResume.findFirst({
      where: { jobId: j.id },
    });

    const bad = validTailoredFixture();
    bad.sections[0].items[0].provenance = {
      sourceIds: ["bullet_nope_99"],
      change: "REWRITE",
    };
    await expect(tailorResume(j.id, stubTailored(bad))).rejects.toThrow(
      /provenance|validation/,
    );

    const rows = await prisma.tailoredResume.findMany({
      where: { jobId: j.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(v1before?.id);
    expect(rows[0].isCurrent).toBe(true);
    expect(rows[0].version).toBe(1);
    expect(JSON.stringify(rows[0].content)).toBe(
      JSON.stringify(v1before?.content),
    );
  });

  it("accumulates versions with exactly one current (invariant)", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    await makeAnalysis(j.id);
    await tailorResume(j.id, stubTailored(validTailoredFixture()));
    await tailorResume(j.id, stubTailored(validTailoredFixture()));
    const rows = await prisma.tailoredResume.findMany({
      where: { jobId: j.id },
      orderBy: { version: "asc" },
    });
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows.filter((r) => r.isCurrent)).toHaveLength(1);
    expect(rows.find((r) => r.isCurrent)?.version).toBe(2);
    // v1 demoted but intact.
    expect(rows[0].isCurrent).toBe(false);
  });
});

describe("pdf failure preservation", () => {
  it("marks FAILED without touching content on invalid stored content", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    const base = await prisma.resume.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    const row = await prisma.tailoredResume.create({
      data: {
        jobId: j.id,
        version: 1,
        isCurrent: true,
        baseResumeId: base!.id,
        content: { sections: [] },
        evidenceIds: [],
        validationStatus: "SEMANTIC_VALID",
      },
    });
    await expect(renderPdf(j.id)).rejects.toThrow();
    const after = await prisma.tailoredResume.findUnique({
      where: { id: row.id },
    });
    expect(after?.renderStatus).toBe("FAILED");
    expect(JSON.stringify(after?.content)).toBe(
      JSON.stringify({ sections: [] }),
    );
  });
});

describe("decision lifecycle", () => {
  it("OPENED never implies APPLIED; invalid statuses rejected", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    const opened = await postJson(decisionPOST, j.id, { status: "OPENED" });
    expect(opened.status).toBe(201);
    expect(opened.body.status).toBe("OPENED");

    const getRes = await decisionGET(
      new Request("http://test/"),
      ctxFor(j.id) as never,
    );
    expect(((await getRes.json()) as { status: string }).status).toBe("OPENED");

    const applied = await postJson(decisionPOST, j.id, { status: "APPLIED" });
    expect(applied.body.status).toBe("APPLIED");

    const bad = await postJson(decisionPOST, j.id, { status: "Hired!!!" });
    expect(bad.status).toBe(400);
  });
});

describe("judge is observational", () => {
  it("404 without a match; stores verdict; ranking order unchanged", async () => {
    const c = await makeCompany();
    const hi = await makeJob(c.id);
    const lo = await makeJob(c.id);
    const missing = await postJson(judgePOST, hi.id, { verdict: "GOOD" });
    expect(missing.status).toBe(404);

    const run = await prisma.nightlyRun.create({
      data: { startedAt: new Date(), success: true },
    });
    created.runs.push(run.id);
    for (const [job, score] of [
      [hi, 0.9],
      [lo, 0.5],
    ] as const) {
      await prisma.jobMatch.create({
        data: {
          jobId: job.id,
          score,
          matchedSkills: [],
          missingSkills: [],
          skillOverlap: 0.5,
          salaryFit: "UNKNOWN",
          salaryScore: 0.5,
          recencyDecay: 0.5,
          sourceTrust: 0.5,
          levelFit: 0.5,
          reasons: [],
          nightlyRunId: run.id,
        },
      });
    }
    const bad = await postJson(judgePOST, lo.id, { verdict: "SUPERB" });
    expect(bad.status).toBe(400);

    const ok = await postJson(judgePOST, lo.id, { verdict: "EXCELLENT" });
    expect(ok.status).toBe(201);

    // Wide limit: real nightly matches must not crowd fixtures out.
    const top = await getTopMatches(1000);
    const ids = top.map((t) => t.job.id);
    // Lower-scored job judged EXCELLENT still ranks below — verdicts don't rank.
    expect(ids.indexOf(hi.id)).toBeLessThan(ids.indexOf(lo.id));
  });
});

describe("liveness fails gracefully", () => {
  it("unroutable host reports dead without throwing", async () => {
    const r = await checkUrl("http://127.0.0.1:9/nope");
    expect(r.alive).toBe(false);
    expect(r.evidence).toBeTruthy();
  }, 15000);
});
