import "dotenv/config";
import { envSchema, validateEnv } from "@/lib/env";

// ─── Setup doctor ────────────────────────────────────────────────────────────
// `bun run check:env` — validates every variable the app reads, masks secrets,
// and explains which optional features will be skipped.

const MASKED = new Set([
  "DATABASE_URL",
  "LLM_API_KEY",
  "CRON_SECRET",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "JOOBLE_API_KEY",
  "RESEND_API_KEY",
]);

function mask(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

const result = validateEnv();

if (!result.success) {
  console.error("[!!] Environment is not valid:\n");
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "(root)";
    console.error(`  ${key}: ${issue.message}`);
  }
  console.error(
    "\nFix .env (see .env.example), then re-run `bun run check:env`.",
  );
  process.exit(1);
}

const env = result.data;
console.log("[ok] DATABASE_URL is set");

const provider =
  env.LLM_PROVIDER === "cloud" ? "cloud" : "opencode CLI (local)";
console.log(`[ok] LLM provider: ${provider}`);

if (env.LLM_PROVIDER === "cloud") {
  if (!env.LLM_API_KEY || !env.LLM_MODEL) {
    console.error(
      "[!!] LLM_PROVIDER=cloud needs both LLM_API_KEY and LLM_MODEL.",
    );
    process.exit(1);
  }
  console.log(`  model: ${env.LLM_MODEL}`);
  if (env.LLM_BASE_URL) console.log(`  base URL: ${env.LLM_BASE_URL}`);
} else {
  console.log(
    "  requires the OpenCode CLI on this machine (or set OPENCODE_BIN)",
  );
}

const sources = [
  ["Adzuna", env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY],
  ["Jooble", env.JOOBLE_API_KEY],
] as const;
for (const [name, configured] of sources) {
  console.log(
    `${configured ? "[ok]" : "[--]"} ${name}: ${configured ? "ready" : "skipped (no key)"}`,
  );
}
console.log("[ok] Remotive, Greenhouse, Lever, Ashby, Workday: no key needed");

console.log(
  `${env.RESEND_API_KEY && env.DIGEST_TO_EMAIL ? "[ok]" : "[--]"} Digest: ${
    env.RESEND_API_KEY && env.DIGEST_TO_EMAIL
      ? `→ ${env.DIGEST_TO_EMAIL}`
      : "skipped (needs RESEND_API_KEY + DIGEST_TO_EMAIL)"
  }`,
);
console.log(`[ok] PDF backend: ${env.PDF_BACKEND ?? "typst"}`);

// Show the keys we know about, masked, so it is obvious what was read.
const known = Object.keys(envSchema.shape).filter(
  (k) => process.env[k] !== undefined && process.env[k] !== "",
);
console.log("\nRead from environment:");
for (const key of known) {
  const value = process.env[key]!;
  console.log(`  ${key}=${MASKED.has(key) ? mask(value) : value}`);
}
