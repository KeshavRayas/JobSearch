import { prisma } from "@/lib/prisma";
import {
  renderPdf,
  getPdfState,
  NothingToRenderError,
  NotApprovedError,
} from "@/lib/pdf/service";
import { RenderError } from "@/lib/pdf/compile";

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
    return Response.json({ ...(await getPdfState(id)), cached: true });
  } catch (err) {
    if (err instanceof NothingToRenderError) {
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
        const state = await getPdfState(id);
        if (state.renderStatus === "SUCCESS" && state.atsStatus === "CHECKED") {
          return Response.json({ ...state, cached: true });
        }
      } catch {
        // No tailored row yet — fall through (404 below).
      }
    }
    const { pdfPath, ats } = await renderPdf(id);
    const state = await getPdfState(id);
    return Response.json(
      { ...state, pdfPath, ats, cached: false },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof NothingToRenderError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof NotApprovedError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof RenderError) {
      return Response.json({ error: err.message }, { status: 500 });
    }
    if (err instanceof Error && err.message.startsWith("job not found")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
