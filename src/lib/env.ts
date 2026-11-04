import { z } from "zod";

// ─── Environment contract ────────────────────────────────────────────────────
// One place that names every variable the app reads. `bun run check:env`
// prints a human-readable report; `requireEnv` gives startup errors a fixable
// message instead of a Prisma crash.

const optionalString = z.string().min(1).optional();

export const envSchema = z.object({
  // Database (required)
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => v.startsWith("postgres"), "must be a postgres:// URL"),

  // LLM provider: unset/anything-but-cloud → local OpenCode CLI passthrough
  LLM_PROVIDER: optionalString,
  LLM_API_KEY: optionalString,
  LLM_MODEL: optionalString,
  LLM_BASE_URL: z.string().url().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // Local OpenCode CLI overrides
  OPENCODE_BIN: optionalString,
  OPENCODE_AGENT: optionalString,

  // Cron protection (unset locally = open, Vercel sends the bearer token)
  CRON_SECRET: optionalString,

  // Job sources (each source is skipped when its keys are absent)
  ADZUNA_APP_ID: optionalString,
  ADZUNA_APP_KEY: optionalString,
  JOOBLE_API_KEY: optionalString,

  // PDF backend
  PDF_BACKEND: z.enum(["typst", "latex"]).optional(),
  PDFLATEX_BIN: optionalString,

  // Digest email
  RESEND_API_KEY: optionalString,
  DIGEST_TO_EMAIL: z.string().email().optional(),
  DIGEST_FROM_EMAIL: optionalString,
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(source: NodeJS.ProcessEnv = process.env) {
  return envSchema.safeParse(source);
}

export function requireEnv(key: keyof Env): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env, fill it in, then run \`bun run check:env\`.`,
    );
  }
  return value;
}
