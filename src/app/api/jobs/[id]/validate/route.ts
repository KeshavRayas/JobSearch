import { prisma } from "@/lib/prisma";
import {
  validateTailored,
  getValidation,
  NothingToValidateError,
  SemanticValidationError,
} from "@/lib/tailor/validateSemantic";
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
  const job = await prisma.job.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json({ ...(await getValidation(id)), cached: true });
  } catch (err) {
    if (err instanceof NothingToValidateError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("refresh") !== "1") {
      try {
        const existing = await getValidation(id);
        if (existing.validatedAt) {
          return Response.json({ ...existing, cached: true });
        }
      } catch {
        // No tailored row yet — fall through to run validation (404 below).
      }
    }
    const { provider, meta } = resolveProvider(req.headers);
    const { status, result } = await validateTailored(id, provider);
    return Response.json(
      { status, result, cached: false, usage: usageOf(provider), provider: meta },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof NothingToValidateError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof MissingModelError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof SemanticValidationError || err instanceof LlmError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    if (err instanceof Error && err.message.startsWith("job not found")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
