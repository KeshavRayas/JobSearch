import { generateJsonSanitized } from "@/lib/llm/sanitize";
import type { LlmProvider } from "@/lib/llm/types";

// ─── Single-retry Zod parse boundary ─────────────────────────────────────────
// tailor and cover services shared an identical flow: safeParse the
// model output, log + retry once with a correction prompt, then throw a
// service-specific validation error. One helper keeps the retry budget ("once")
// and the prompt wording in a single place.

type IssueLike = { path: PropertyKey[]; message: string };
type ErrorLike = { issues: IssueLike[] };
type SchemaLike<T> = {
  safeParse: (
    raw: unknown,
  ) => { success: true; data: T } | { success: false; error: ErrorLike };
};

/** "path.to.field: message; ..." — identical wording in all three services. */
export function formatValidationIssues(error: ErrorLike): string {
  return error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
}

/** Correction prompt sent back to the model after a schema failure. */
export function buildValidationRetryPrompt(
  prompt: string,
  issues: string,
): string {
  return (
    `Your previous output failed validation: ${issues}\n` +
    `Return ONLY the corrected JSON in exactly the requested shape.\n\n---\n\n${prompt}`
  );
}

export async function parseWithSingleRetry<T>(opts: {
  schema: SchemaLike<T>;
  raw: unknown;
  jobId: string;
  /** e.g. "tailor" — used in the console.error prefix. */
  logTag: string;
  provider: LlmProvider;
  systemPrompt: string;
  prompt: string;
  makeError: (detail: string) => Error;
}): Promise<{ data: T; raw: unknown }> {
  const first = opts.schema.safeParse(opts.raw);
  if (first.success) return { data: first.data, raw: opts.raw };
  const issues = formatValidationIssues(first.error);
  console.error(
    `[${opts.logTag}] schema invalid for job ${opts.jobId}: ${issues}`,
  );
  const retryRaw = await generateJsonSanitized(
    opts.provider,
    opts.systemPrompt,
    buildValidationRetryPrompt(opts.prompt, issues),
  );
  const second = opts.schema.safeParse(retryRaw);
  if (!second.success) {
    throw opts.makeError(formatValidationIssues(second.error));
  }
  return { data: second.data, raw: retryRaw };
}
