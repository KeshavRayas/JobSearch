import { prisma } from "@/lib/prisma";
import {
  generateCoverLetter,
  getCoverLetter,
  NeedsAnalysisError,
  NeedsTailoredResumeError,
  EmptyResumeError,
  CoverValidationError,
} from "@/lib/cover/service";
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
  const [cover, job] = await Promise.all([
    getCoverLetter(id),
    prisma.job.findUnique({ where: { id }, select: { id: true } }),
  ]);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  if (!cover) {
    return Response.json({ error: "No cover letter yet" }, { status: 404 });
  }
  return Response.json({ ...cover, cached: true });
}

export async function POST(req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("refresh") !== "1") {
      const existing = await getCoverLetter(id);
      if (existing) return Response.json({ ...existing, cached: true });
    }
    const { provider, meta } = resolveProvider(req.headers);
    const { cover } = await generateCoverLetter(id, provider);
    return Response.json(
      { ...cover, cached: false, usage: usageOf(provider), provider: meta },
      { status: 201 },
    );
  } catch (err) {
    if (
      err instanceof NeedsAnalysisError ||
      err instanceof NeedsTailoredResumeError ||
      err instanceof EmptyResumeError
    ) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof MissingModelError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof CoverValidationError || err instanceof LlmError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    if (err instanceof Error && err.message.startsWith("job not found")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
