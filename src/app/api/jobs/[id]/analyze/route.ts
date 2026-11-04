import { prisma } from "@/lib/prisma";
import {
  analyzeJob,
  getAnalysis,
  JobNotFoundError,
  AnalysisValidationError,
  EmptyProfileError,
} from "@/lib/analysis/service";
import { LlmError } from "@/lib/llm/types";
import { logResolveCommand } from "@/lib/llm/opencode";
import {
  resolveProvider,
  usageOf,
  MissingModelError,
} from "@/lib/llm/userKey";

type Params = Promise<{ id: string }>;

export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;
  const [analysis, job] = await Promise.all([
    getAnalysis(id),
    prisma.job.findUnique({ where: { id }, select: { id: true } }),
  ]);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!analysis) {
    return Response.json({ error: "No analysis yet" }, { status: 404 });
  }
  return Response.json({ ...analysis, cached: true });
}

export async function POST(req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;
  logResolveCommand();

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("refresh") !== "1") {
      const existing = await getAnalysis(id);
      if (existing) return Response.json({ ...existing, cached: true });
    }
    const { provider, meta } = resolveProvider(req.headers);
    const { analysis } = await analyzeJob(id, provider);
    return Response.json(
      { ...analysis, cached: false, usage: usageOf(provider), provider: meta },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof JobNotFoundError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof EmptyProfileError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof MissingModelError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof AnalysisValidationError || err instanceof LlmError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
