import { runIngestionPipeline } from "@/lib/ingestion/pipeline";
import { cronAuthError } from "@/lib/jobs/cron";

export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;
  try {
    await runIngestionPipeline();
    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
