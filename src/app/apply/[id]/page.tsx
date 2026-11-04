import { ApplyWorkspace } from "@/components/ApplyWorkspace";

type Params = Promise<{ id: string }>;

// ─── Full-screen application workspace ───────────────────────────────────────
// The job modal stays compact. Analysis, tailoring, resume editing, approval,
// and the manual apply handoff live here, using most of the viewport.

export default async function ApplyPage({ params }: { params: Params }) {
  const { id } = await params;
  return <ApplyWorkspace jobId={id} />;
}
