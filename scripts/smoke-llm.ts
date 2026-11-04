import "dotenv/config";
import { getDefaultProvider } from "@/lib/analysis/service";

// ─── Provider smoke test ─────────────────────────────────────────────────────
// `bun run smoke:llm` proves the configured provider is reachable and returns
// parseable JSON. It spends one small call; no database writes.
async function main() {
  const provider = getDefaultProvider();
  const started = Date.now();
  try {
    const raw = await provider.generateJson(
      "You are a JSON API. Return only JSON.",
      'Return exactly {"ok":true} and nothing else.',
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: provider.name,
          ms: Date.now() - started,
          raw,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    const e = err as Error & { detail?: string };
    console.error(
      JSON.stringify(
        {
          ok: false,
          provider: provider.name,
          ms: Date.now() - started,
          name: e.name,
          message: e.message,
          detail: e.detail?.slice(0, 800) ?? null,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

main();
