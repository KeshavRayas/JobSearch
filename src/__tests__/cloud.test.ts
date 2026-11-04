import { describe, it, expect, vi, afterEach } from "vitest";
import { CloudJsonProvider } from "@/lib/llm/cloud";
import { LlmError } from "@/lib/llm/types";

const ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

function setCloudEnv() {
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "test-model";
}

function okFetch(payload: unknown, usage = true) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
      ...(usage ? { usage: { prompt_tokens: 10, completion_tokens: 5 } } : {}),
    }),
  });
}

describe("CloudJsonProvider", () => {
  it("returns parsed JSON from a chat-completions endpoint", async () => {
    setCloudEnv();
    const fetch = okFetch({ verdict: "STRONG" });
    vi.stubGlobal("fetch", fetch);
    const out = await new CloudJsonProvider().generateJson("sys", "user");
    expect(out).toEqual({ verdict: "STRONG" });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-model");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      "system",
      "user",
    ]);
  });

  it("honors LLM_BASE_URL", async () => {
    setCloudEnv();
    process.env.LLM_BASE_URL = "https://proxy.internal/v1/";
    const fetch = okFetch({});
    vi.stubGlobal("fetch", fetch);
    await new CloudJsonProvider().generateJson("sys", "user");
    const [url] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proxy.internal/v1/chat/completions");
  });

  it("throws LlmError without key/model configured", async () => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    await expect(
      new CloudJsonProvider().generateJson("sys", "user"),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it("throws LlmError on non-2xx", async () => {
    setCloudEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "rate limited",
      }),
    );
    const err: unknown = await new CloudJsonProvider()
      .generateJson("sys", "user")
      .catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(String((err as Error).message)).toContain("429");
  });

  it("throws LlmError on non-JSON content", async () => {
    setCloudEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "not json at all" } }],
        }),
      }),
    );
    await expect(
      new CloudJsonProvider().generateJson("sys", "user"),
    ).rejects.toBeInstanceOf(LlmError);
  });
});
