import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { LlmError, type LlmProvider } from "@/lib/llm/types";

// ─── OpenCode CLI passthrough provider ───────────────────────────────────────
// Reuses the free model already configured for OpenCode on this machine by
// shelling out to `opencode run --format json`. This only works when the app
// runs on a host with the OpenCode CLI installed (local `npm run dev`) —
// never on Vercel. Swap in a cloud provider later via the LlmProvider
// interface without touching callers.

const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * Binary resolution. Prefers the real opencode.exe (spawned without a shell,
 * so long prompts dodge cmd.exe's ~8k command-line limit):
 * OPENCODE_BIN → <npm root -g>/opencode-ai/bin/opencode.exe → PATH lookup.
 * Falls back to a shell lookup of `opencode` (short prompts only).
 */
function resolveCommand(): { cmd: string; shell: boolean } {
  if (process.env.OPENCODE_BIN)
    return { cmd: process.env.OPENCODE_BIN, shell: false };
  // execPath-derived global root needs no subprocess and works regardless
  // of PATH (npm/node shims are not resolvable without a shell on Windows).
  try {
    const exe = path.join(
      path.dirname(process.execPath),
      "node_modules",
      "opencode-ai",
      "bin",
      "opencode.exe",
    );
    if (existsSync(exe)) return { cmd: exe, shell: false };
  } catch {
    // fall through
  }
  try {
    const root = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    }).trim();
    const exe = path.join(root, "opencode-ai", "bin", "opencode.exe");
    if (existsSync(exe)) return { cmd: exe, shell: false };
  } catch {
    // npm unavailable — fall through to PATH lookup.
  }
  if (process.platform === "win32") return { cmd: "opencode", shell: true };
  return { cmd: "opencode", shell: false };
}

let resolveLogged = false;

/** Diagnostic: logs which spawn path the server uses (once per process). */
export function logResolveCommand(): void {
  if (resolveLogged) return;
  resolveLogged = true;
  try {
    console.log(`[llm] resolveCommand: ${JSON.stringify(resolveCommand())}`);
  } catch {
    // never break callers over diagnostics
  }
}

function timeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * Extracts the last balanced {...} object from free-form model output.
 * The opencode agent may emit commentary/tool chatter before its final
 * answer, so the LAST object is the answer candidate. Falls back to the
 * first object when only one exists.
 */
export function extractJsonObject(text: string): unknown {
  const objects = scanAllObjects(text);
  if (objects.length === 0) {
    throw new Error("no JSON object found in model output");
  }
  return objects[objects.length - 1];
}

function scanAllObjects(text: string): unknown[] {
  const found: unknown[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{", i);
    if (start === -1) break;
    const end = matchClose(text, start);
    if (end === -1) break;
    try {
      found.push(JSON.parse(text.slice(start, end + 1)));
    } catch {
      // Not valid JSON (e.g. prose braces) — skip past it.
    }
    i = end + 1;
  }
  return found;
}

function matchClose(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/** Joins assistant text chunks from `opencode run --format json` events. */
function collectEventText(stdout: string): string {
  const chunks: string[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const evt = JSON.parse(trimmed) as {
        part?: { type?: string; text?: string };
      };
      if (evt.part?.type === "text" && typeof evt.part.text === "string") {
        chunks.push(evt.part.text);
      }
    } catch {
      // Non-JSON line — ignore; extraction works on text chunks alone.
    }
  }
  return chunks.join("\n");
}

export class OpencodeCliProvider implements LlmProvider {
  readonly name = "opencode-cli";

  async generateJson(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<unknown> {
    const message = `${systemPrompt}\n\n---\n\n${userPrompt}`;
    const output = await this.run(message);
    const text = collectEventText(output);
    try {
      return extractJsonObject(text);
    } catch (err) {
      throw new LlmError(
        this.name,
        "model did not return parseable JSON",
        `${String(err)} :: ${text.slice(0, 500)}`,
      );
    }
  }

  private run(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const { cmd, shell } = resolveCommand();
      // Default (build) agent: subagent routing (--agent) demonstrably drops
      // long message content in the delegation handoff, so the message must
      // go straight to the primary. The prompt itself forbids tool use.
      // Override with OPENCODE_AGENT=<name> to force a specific agent.
      const agent = process.env.OPENCODE_AGENT;
      // Pin the model explicitly so local runs do not depend on whatever
      // `opencode` happens to have selected globally. Unset keeps the CLI
      // default, preserving the old behaviour.
      const model = process.env.OPENCODE_MODEL;
      const args = ["run", "--format", "json"];
      if (model && model.trim()) args.push("--model", model.trim());
      if (agent && agent !== "build") args.push("--agent", agent);
      args.push(message);
      const child = spawn(cmd, args, {
        shell,
        timeout: timeoutMs(),
        // stdin must be ignored: an open pipe makes `opencode run` wait
        // for piped input forever and the call dies at our timeout.
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", (err) =>
        reject(
          new LlmError(
            this.name,
            "failed to spawn opencode CLI (is it installed on this host? set OPENCODE_BIN to its path)",
            String(err),
          ),
        ),
      );
      child.on("close", (code) => {
        if (code === 0 && stdout.trim()) resolve(stdout);
        else {
          const detail = stderr || stdout;
          const authFailure =
            /api_key_expired|authentication_error|invalid.*api key|401/i.test(
              detail,
            );
          reject(
            new LlmError(
              this.name,
              authFailure
                ? "LLM provider rejected the request (expired or invalid API key). Run `opencode auth login`, or set OPENCODE_MODEL to a model whose provider is authenticated."
                : `opencode run exited with code ${code}`,
              detail.slice(0, 1000),
            ),
          );
        }
      });
    });
  }
}
