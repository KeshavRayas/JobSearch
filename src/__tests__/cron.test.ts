import { describe, it, expect } from "vitest";
import { cronAuthError } from "@/lib/jobs/cron";

describe("cronAuthError", () => {
  const ENV = { ...process.env };

  it("allows everything when CRON_SECRET is unset (local dev)", () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthError(new Request("http://x/cron"))).toBeNull();
    process.env = { ...ENV };
  });

  it("accepts the Vercel cron bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    const req = new Request("http://x/cron", {
      headers: { Authorization: "Bearer s3cret" },
    });
    expect(cronAuthError(req)).toBeNull();
    process.env = { ...ENV };
  });

  it("rejects missing and wrong tokens with 401", async () => {
    process.env.CRON_SECRET = "s3cret";
    const cases: HeadersInit[] = [{}, { Authorization: "Bearer wrong" }];
    for (const headers of cases) {
      const res = cronAuthError(new Request("http://x/cron", { headers }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
    }
    process.env = { ...ENV };
  });
});
