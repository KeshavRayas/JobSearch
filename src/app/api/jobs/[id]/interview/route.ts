import { prisma } from "@/lib/prisma";
import {
  generateInterviewPrep,
  getInterviewPrep,
  NeedsAnalysisError,
  NeedsValidTailoredResumeError,
  EmptyResumeError,
  InterviewValidationError,
} from "@/lib/interview/service";
import { LlmError } from "@/lib/llm/types";
import {
  resolveProvider,
  usageOf,
  MissingModelError,
} from "@/lib/llm/userKey";

type Params = Promise<{ id: string }>;

export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;
  const [prep, job] = await Promise.all([
    getInterviewPrep(id),
    prisma.job.findUnique({ where: { id }, select: { id: true } }),
  ]);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!prep) {
    return Response.json({ error: "No interview prep yet" }, { status: 404 });
  }
  return Response.json({ ...prep, cached: true });
}

export async function POST(req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("refresh") !== "1") {
      const existing = await getInterviewPrep(id);
      if (existing) return Response.json({ ...existing, cached: true });
    }
    const { provider, meta } = resolveProvider(req.headers);
    const { prep } = await generateInterviewPrep(id, provider);
    return Response.json(
      { ...prep, cached: false, usage: usageOf(provider), provider: meta },
      { status: 201 },
    );
  } catch (err) {
    if (
      err instanceof NeedsAnalysisError ||
      err instanceof NeedsValidTailoredResumeError ||
      err instanceof EmptyResumeError
    ) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof MissingModelError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof InterviewValidationError || err instanceof LlmError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    if (err instanceof Error && err.message.startsWith("job not found")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
