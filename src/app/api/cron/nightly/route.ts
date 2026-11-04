import { runNightly } from "@/lib/matching/nightly";
import { cronAuthError } from "@/lib/jobs/cron";

export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;
  try {
    const result = await runNightly();
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
