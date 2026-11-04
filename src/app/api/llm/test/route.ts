import { resolveProvider, usageOf, MissingModelError } from "@/lib/llm/userKey";
import { LlmError } from "@/lib/llm/types";

// ─── Key check (Phase 5A: BYOK "Test & save") ─────────────────────────────────
// Validates user-supplied credentials with one tiny call before the UI
// stores them. Never persists or logs the key — it only travels in.

export async function POST(req: Request) {
  let resolved;
  try {
    resolved = resolveProvider(req.headers);
  } catch (err) {
    if (err instanceof MissingModelError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
  const { provider, meta } = resolved;
  if (meta.source !== "user") {
    return Response.json(
      { error: "provide a key to test (x-llm-key header)" },
      { status: 400 },
    );
  }
  try {
    const out = (await provider.generateJson(
      'Reply with exactly this JSON object and nothing else: {"ok": true}',
      "ping",
    )) as { ok?: unknown };
    if (out?.ok !== true) {
      return Response.json(
        { error: "endpoint answered, but not with the expected payload" },
        { status: 502 },
      );
    }
    return Response.json({
      ok: true,
      model: meta.model,
      usage: usageOf(provider),
      provider: meta,
    });
  } catch (err) {
    if (err instanceof LlmError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
