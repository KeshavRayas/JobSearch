import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/jobs/retry";

describe("withRetry", () => {
  it("returns on first success without sleeping", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1 }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom-1"))
      .mockRejectedValueOnce(new Error("boom-2"))
      .mockResolvedValue("recovered");
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 1 }),
    ).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    await expect(
      withRetry(fn, { attempts: 2, baseDelayMs: 1 }),
    ).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("times out slow attempts", async () => {
    const fn = vi
      .fn()
      .mockImplementation(() => new Promise(() => {}));
    await expect(
      withRetry(fn, { attempts: 1, baseDelayMs: 1, timeoutMs: 20 }),
    ).rejects.toThrow("timed out");
  });
});
