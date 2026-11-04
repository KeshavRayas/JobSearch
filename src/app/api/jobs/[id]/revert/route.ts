import { revertTailoredResume, EmptyResumeError } from "@/lib/tailor/service";

type Params = Promise<{ id: string }>;

// POST /api/jobs/:id/revert — create a new draft from the base resume.
export async function POST(_req: Request, ctx: { params: Params }) {
  const { id } = await ctx.params;
  try {
    const draft = await revertTailoredResume(id);
    return Response.json(draft, { status: 201 });
  } catch (err) {
    if (err instanceof EmptyResumeError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof Error && err.message.startsWith("job not found")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
