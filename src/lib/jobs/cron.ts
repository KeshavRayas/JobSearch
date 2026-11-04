// ─── Cron route guard (Phase 4B) ─────────────────────────────────────────────
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
// the CRON_SECRET env var is set on the project. Enforce it when configured;
// leave local/dev runs frictionless (with a one-line warning).

export function cronAuthError(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("[cron] CRON_SECRET unset — accepting unauthenticated call");
    return null;
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
