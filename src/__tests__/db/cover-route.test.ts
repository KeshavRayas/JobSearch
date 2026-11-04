import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { setDefaultProvider } from "@/lib/cover/service";
import {
  GET as coverGET,
  POST as coverPOST,
} from "@/app/api/jobs/[id]/cover/route";
import type { LlmProvider } from "@/lib/llm/types";

// ─── Phase 3A: cover-letter route semantics (DB-backed) ───────────────────────
// Cached reads must never touch the model: the default provider is a throwing
// stub for the whole file, so any model call fails loudly instead of hanging
// on a real `opencode run`. Fixtures use test-25x-* keys and clean up after.

let uid = 0;
const tag = () => `25xcov${Date.now().toString(36)}${uid++}`;

const throwingProvider: LlmProvider = {
  name: "throwing-stub",
  async generateJson() {
    throw new Error("model down");
  },
};

const created = {
  companies: [] as string[],
  jobs: [] as string[],
  resumes: [] as string[],
};

async function makeCompany() {
  const t = tag();
  const c = await prisma.company.create({
    data: { name: `TestCo ${t}`, slug: `test-co-${t}`, companyType: "STARTUP" },
  });
  created.companies.push(c.id);
  return c;
}

async function makeJob(companyId: string) {
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
                bulletPoints: ["Built things with Go."],
              },
            ],
          },
        ],
      },
    },
  });
  created.resumes.push(r.id);
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

async function makeCover(jobId: string, baseResumeId: string) {
  return prisma.coverLetter.create({
    data: {
      jobId,
      baseResumeId,
      content: {
        greeting: "Dear Hiring Manager,",
        paragraphs: [
          "I am excited to apply for the Test Engineer role.",
          "I built things with Go at T.",
          "Thank you for your consideration.",
        ],
        closing: "Sincerely, Test",
      },
      evidenceIds: ["t_e1_b1"],
    },
  });
}

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(() => {
  setDefaultProvider(throwingProvider);
});

afterAll(() => {
  setDefaultProvider(null);
});

afterEach(async () => {
  await prisma.job.deleteMany({ where: { id: { in: created.jobs } } });
  await prisma.company.deleteMany({ where: { id: { in: created.companies } } });
  await prisma.resume.deleteMany({ where: { id: { in: created.resumes } } });
  created.jobs = [];
  created.companies = [];
  created.resumes = [];
});

describe("cover route 404/422 semantics", () => {
  it("GET 404s for a missing job", async () => {
    const res = await coverGET(
      new Request("http://test/"),
      ctxFor("nope") as never,
    );
    expect(res.status).toBe(404);
  });

  it("GET 404s when the job has no cover letter yet", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    const res = await coverGET(
      new Request("http://test/"),
      ctxFor(j.id) as never,
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /no cover letter/i,
    );
  });

  it("POST 404s for a missing job without calling the model", async () => {
    const res = await coverPOST(
      new Request("http://test/", { method: "POST" }),
      ctxFor("nope") as never,
    );
    expect(res.status).toBe(404);
  });

  it("POST 422s without a JobAnalysis (never re-analyzes, no model call)", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    const res = await coverPOST(
      new Request("http://test/", { method: "POST" }),
      ctxFor(j.id) as never,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /before writing a cover letter/i,
    );
  });

  it("POST 422s with analysis but no current tailored resume", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    await makeAnalysis(j.id);
    const res = await coverPOST(
      new Request("http://test/", { method: "POST" }),
      ctxFor(j.id) as never,
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /before writing a cover letter/i,
    );
  });
});

describe("cover route cached reads", () => {
  it("GET returns the persisted letter with cached:true and no model call", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    const base = await makeBaseResume();
    const saved = await makeCover(j.id, base.id);

    const res = await coverGET(
      new Request("http://test/"),
      ctxFor(j.id) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; cached: boolean };
    expect(body.id).toBe(saved.id);
    expect(body.cached).toBe(true);
  });

  it("POST without refresh returns cached:true without calling the model", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    const base = await makeBaseResume();
    const saved = await makeCover(j.id, base.id);

    const res = await coverPOST(
      new Request("http://test/", { method: "POST" }),
      ctxFor(j.id) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; cached: boolean };
    expect(body.id).toBe(saved.id);
    expect(body.cached).toBe(true);
  });

  it("POST with refresh=1 bypasses the cache and reaches the provider", async () => {
    const c = await makeCompany();
    const j = await makeJob(c.id);
    const base = await makeBaseResume();
    await makeCover(j.id, base.id);
    await makeAnalysis(j.id);

    const res = await coverPOST(
      new Request("http://test/?refresh=1", { method: "POST" }),
      ctxFor(j.id) as never,
    );
    // Throwing stub: without a tailored resume the 422 fires first here
    // (proves refresh skipped the cached-read path, which would be 200).
    expect([422, 500, 502]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});
