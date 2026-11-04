import { readByokHeaders } from "@/lib/llm/byok";

// ─── Model discovery ─────────────────────────────────────────────────────────
// Validates a provider key by listing its models. This is the Settings save
// action: the user never types a model id; the job panel picks from the list.

export const dynamic = "force-dynamic";

function modelsUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/$/, "");
  // OpenCode Go serves models from the /go/v1 root, not /go/openai/v1.
  if (clean.includes("opencode.ai/inference/go/openai/v1")) {
    return "https://opencode.ai/inference/go/v1/models";
  }
  return `${clean}/models`;
}

export async function POST(req: Request) {
  const { key, baseUrl } = readByokHeaders(req.headers);
  if (!key) return Response.json({ error: "API key is required" }, { status: 400 });
  if (!baseUrl) return Response.json({ error: "Base URL is required" }, { status: 400 });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  if (baseUrl.includes("githubcopilot.com")) {
    headers["Copilot-Integration-Id"] = "vscode-chat";
    headers["Editor-Version"] = "vscode/1.95.0";
  }
  if (baseUrl.includes("opencode.ai")) {
    headers["x-opencode-session"] =
      process.env.LLM_SESSION_ID ?? "job-search-local";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(modelsUrl(baseUrl), {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      return Response.json(
        {
          error: `provider returned ${res.status}`,
          detail: (await res.text()).slice(0, 500),
        },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      data?: { id?: unknown }[];
      models?: { id?: unknown; name?: unknown }[];
    };
    const entries = Array.isArray(data.data)
      ? data.data.map((m) => m.id)
      : Array.isArray(data.models)
        ? data.models.map((m) => m.id)
        : [];
    const models = [
      ...new Set(
        entries.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ].sort((a, b) => a.localeCompare(b));

    if (models.length === 0) {
      return Response.json(
        { error: "provider returned no models" },
        { status: 502 },
      );
    }
    return Response.json({ models });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "model discovery failed" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
