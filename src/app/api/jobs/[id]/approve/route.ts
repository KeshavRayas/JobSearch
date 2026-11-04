import {
  approveTailoredResume,
  NothingToApproveError,
} from "@/lib/tailor/service";

type Params = Promise<{ id: string }>;

// POST /api/jobs/:id/approve — lock the current draft so PDF can render.
export async function POST(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;
  try {
    const draft = await approveTailoredResume(id);
    return Response.json(draft);
  } catch (err) {
    if (err instanceof NothingToApproveError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
