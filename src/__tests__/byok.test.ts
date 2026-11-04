import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveProvider, usageOf, MissingModelError } from "@/lib/llm/userKey";
import { maskKey, formatUsage, readByokHeaders } from "@/lib/llm/byok";
import { CloudJsonProvider } from "@/lib/llm/cloud";

const ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("readByokHeaders", () => {
  it("trims and drops empties", () => {
    const out = readByokHeaders(
      headers({ "x-llm-key": "  sk-abc  ", "x-llm-model": "" }),
    );
    expect(out.key).toBe("sk-abc");
    expect(out.model).toBeUndefined();
  });
});

describe("maskKey", () => {
  it("shows head and tail only", () => {
    expect(maskKey("sk-abcdefghij9f2a")).toBe("sk-…9f2a");
    expect(maskKey("short")).toBe("…");
  });
});

describe("formatUsage", () => {
  it("totals and names the model", () => {
    expect(
      formatUsage({
        prompt_tokens: 1800,
        completion_tokens: 42,
        model: "llama-3.3-70b",
      }),
    ).toBe("1,842 tokens · llama-3.3-70b");
  });

  it("tolerates null counts", () => {
    expect(
      formatUsage({ prompt_tokens: null, completion_tokens: null, model: "m" }),
    ).toBe("0 tokens · m");
  });
});

describe("resolveProvider", () => {
  it("prefers the user key with its model and label", () => {
    const { provider, meta } = resolveProvider(
      headers({
        "x-llm-key": "sk-user",
        "x-llm-model": "llama-3.3",
        "x-llm-base-url": "https://x.test/v1",
        "x-llm-label": "OpenRouter",
      }),
    );
    expect(provider).toBeInstanceOf(CloudJsonProvider);
    expect(meta).toEqual({
      source: "user",
      display: "your OpenRouter key",
      model: "llama-3.3",
    });
    expect(usageOf(provider)).toBeNull();
  });

  it("400s a key without a model", () => {
    expect(() => resolveProvider(headers({ "x-llm-key": "sk-user" }))).toThrow(
      MissingModelError,
    );
  });

  it("falls back to the default provider without headers", () => {
    const { meta } = resolveProvider(headers({}));
    expect(["env", "cli"]).toContain(meta.source);
  });
});
