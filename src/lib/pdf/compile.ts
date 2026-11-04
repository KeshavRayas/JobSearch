import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// Type-only: the WASM-backed compiler (and its multi-MB glue + .wasm
// assets) must never enter the static module graph — Turbopack dev holds
// every traced module in memory and this package alone has repeatedly
// pushed the dev server past its heap limit. Values load lazily inside
// getTypstCompiler() via dynamic import (code-split, on first render only).
import type {
  CompileFormatEnum as CompileFormatEnumType,
  TypstCompiler,
} from "@myriaddreamin/typst.ts/compiler";

// ─── LaTeX compilation (Phase 2.4) ───────────────────────────────────────────
// One pdflatex pass in an isolated temp dir. No network, no shell.

export class RenderError extends Error {
  readonly log: string;
  constructor(message: string, log: string) {
    super(message);
    this.name = "RenderError";
    this.log = log;
  }
}

function binary(): string {
  if (process.env.PDFLATEX_BIN) return process.env.PDFLATEX_BIN;
  return process.platform === "win32" ? "pdflatex.exe" : "pdflatex";
}

export async function compileLatex(
  tex: string,
  timeoutMs = 90_000,
): Promise<{ pdf: Buffer; log: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "resume-"));
  try {
    await writeFile(path.join(dir, "resume.tex"), tex, "utf8");
    const log = await runPdflatex(dir, timeoutMs);
    const pdf = await readFile(path.join(dir, "resume.pdf")).catch(() => null);
    if (!pdf || pdf.length === 0) {
      throw new RenderError("pdflatex produced no PDF", log.slice(-3000));
    }
    return { pdf, log };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runPdflatex(dir: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary(),
      ["-interaction=nonstopmode", "-halt-on-error", "resume.tex"],
      { cwd: dir, timeout: timeoutMs, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", (err) =>
      reject(new RenderError(`cannot run pdflatex: ${String(err)}`, "")),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else
        reject(
          new RenderError(
            `pdflatex exited with code ${code}`,
            out.slice(-3000),
          ),
        );
    });
  });
}

// ─── Typst compilation (Phase 1) ─────────────────────────────────────────────
// Same { pdf, log } contract as compileLatex. WASM via @myriaddreamin/typst.ts:
// no binary to install, millisecond compiles, runs anywhere Node runs
// (including Vercel — the wasm shim reads bytes with fs, no system deps).
// Fonts are vendored in assets/fonts (Libertinus Serif, OFL) and loaded from
// disk, so renders are deterministic with zero network at request time.

const TYPST_MAIN = "/main.typ";
const TYPST_TEMPLATE = "/resume-template.typ";
const TYPST_TEMPLATE_DISK = ["assets", "resume-template.typ"];

const TYPST_FONTS = [
  "LibertinusSerif-Regular.otf",
  "LibertinusSerif-Bold.otf",
  "LibertinusSerif-Italic.otf",
];

let typstCompiler: Promise<{
  compiler: TypstCompiler;
  pdfFormat: CompileFormatEnumType;
}> | null = null;

async function getTypstCompiler(): Promise<{
  compiler: TypstCompiler;
  pdfFormat: CompileFormatEnumType;
}> {
  if (!typstCompiler) {
    typstCompiler = (async () => {
      const { createTypstCompiler, CompileFormatEnum } =
        (await import("@myriaddreamin/typst.ts/compiler")) as typeof import("@myriaddreamin/typst.ts/compiler");
      const { loadFonts } =
        await import("@myriaddreamin/typst.ts/options.init");
      const { readFile } = await import("node:fs/promises");
      const compiler = createTypstCompiler();
      const fontData = await Promise.all(
        TYPST_FONTS.map((f) =>
          readFile(path.join(process.cwd(), "assets", "fonts", f)),
        ),
      );
      try {
        await compiler.init({
          // Resolve the wasm wrapper through the app's node_modules so
          // bundlers (bun, Next) don't have to trace the package's own
          // internal bare import.
          getWrapper: () => import("@myriaddreamin/typst-ts-web-compiler"),
          beforeBuild: [
            loadFonts(
              fontData.map((b) => new Uint8Array(b)),
              { assets: false },
            ),
          ],
        });
      } catch (err) {
        typstCompiler = null;
        throw err;
      }
      return {
        compiler: compiler as TypstCompiler,
        pdfFormat: CompileFormatEnum.pdf as CompileFormatEnumType,
      };
    })();
  }
  return typstCompiler;
}

// The WASM compiler is a process-wide singleton sharing one shadow FS, so
// concurrent renders must not interleave addSource/compile pairs. Renders
// are rare (explicit user clicks), so a simple FIFO chain is enough.
let typstQueue: Promise<unknown> = Promise.resolve();

let typstTemplate: Promise<string> | null = null;

function loadTypstTemplate(): Promise<string> {
  if (!typstTemplate) {
    typstTemplate = (async () => {
      const { readFile } = await import("node:fs/promises");
      return readFile(path.join(process.cwd(), ...TYPST_TEMPLATE_DISK), "utf8");
    })();
  }
  return typstTemplate;
}

export async function compileTypst(
  source: string,
  timeoutMs = 30_000,
): Promise<{ pdf: Buffer; log: string }> {
  const run = typstQueue.then(() => doCompileTypst(source, timeoutMs));
  // Keep the chain alive across failures; callers still see their error.
  typstQueue = run.catch(() => {});
  return run;
}

async function doCompileTypst(
  source: string,
  timeoutMs: number,
): Promise<{ pdf: Buffer; log: string }> {
  const { compiler, pdfFormat } = await getTypstCompiler();
  compiler.addSource(TYPST_MAIN, source);
  // The presentation template ships beside the fonts on disk so designers
  // edit .typ, not TS. Cached in-process; read once per deploy.
  compiler.addSource(TYPST_TEMPLATE, await loadTypstTemplate());
  // WASM has no kill switch, so the timeout only rejects the caller —
  // a late compile still resolves harmlessly into the void.
  const run = (async () => {
    const out = (await compiler.compile({
      mainFilePath: TYPST_MAIN,
      format: pdfFormat,
      diagnostics: "unix",
    })) as { result?: Uint8Array; diagnostics?: unknown };
    const log = String(out?.diagnostics ?? "");
    const bytes = out?.result;
    if (!bytes || bytes.length === 0) {
      throw new RenderError("typst produced no PDF", log.slice(-3000));
    }
    return { pdf: Buffer.from(bytes), log };
  })();
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new RenderError(`typst timed out after ${timeoutMs}ms`, "")),
      timeoutMs,
    );
  });
  return Promise.race([run, timeout]);
}
