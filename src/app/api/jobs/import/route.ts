import { importJobFromUrl } from "@/lib/ingestion/import";

// ─── Paste-a-URL import (Phase 2B) ───────────────────────────────────────────
// POST { url } → 201 { jobId } on success, 422 { error } when the page fails
// any pipeline gate (not CS, not entry-level, ineligible location). Rejections
// persist nothing, mirroring the tailor 422/502 contract.

export async function POST(req: Request) {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  const result = await importJobFromUrl(body.url.trim());
  if (!result.ok) return Response.json({ error: result.reason }, { status: 422 });
  return Response.json({ jobId: result.jobId }, { status: 201 });
}
