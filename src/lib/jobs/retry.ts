// ─── Step retry (Phase 4B) ───────────────────────────────────────────────────
// Keyless durability for cron work: per-step attempts with exponential
// backoff and a per-attempt timeout. A transient tenant outage retries
// inside the same run instead of waiting 6h for the next cron.
// (A hosted queue — Inngest/Trigger.dev — remains the follow-up for
// cross-run checkpointing. The seam is ready: cron routes are thin and
// every unit of work below is already a standalone function.)

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  label?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseDelayMs = opts.baseDelayMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const label = opts.label ?? "step";

  let lastError: unknown = new Error("unreachable");
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        console.log(
          `[retry] ${label} attempt ${attempt}/${attempts} failed (${String(err).slice(0, 120)}), retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  }
  console.log(`[retry] ${label} exhausted after ${attempts} attempts`);
  throw lastError;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
