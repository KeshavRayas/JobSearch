import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { classifyJob } from "@/lib/ingestion/classifier";
import { isEntryLevel } from "@/lib/ingestion/experience";
import { getWorkMode } from "@/lib/ingestion/location";
import { extractSkills } from "@/lib/ingestion/skills";
import { fetchWithTimeout, stripHtml } from "@/lib/utils";
import { rawJobSchema } from "@/lib/validation";

const MAX_HTML_BYTES = 2_000_000;

// ─── Paste-a-URL import (Phase 2B) ───────────────────────────────────────────
// Turns any job posting URL into a pipeline-quality row using the same gates
// as the cron (classify → entry → workMode → skills). Rejections persist
// nothing and return the reason, mirroring the tailor 502 contract.

export function assertImportableUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("only http(s) URLs can be imported");
  }
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error("local network URLs cannot be imported");
  return parsed;
}

function metaContent(html: string, attr: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  return html.match(re)?.[1]?.trim() || null;
}

function titleOf(html: string): string {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
}

/** Pure HTML → RawJob fields. Exported for unit tests (no fetch, no DB). */
export function parseImportedPage(
  url: string,
  html: string,
): {
  title: string;
  description: string;
  companyName: string;
  location?: string;
  remote?: boolean;
  applyUrl: string;
} {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const host = new URL(url).hostname.replace(/^www\./, "");
  const companyName =
    metaContent(body, "property", "og:site_name") ??
    metaContent(body, "name", "author") ??
    host.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const title =
    metaContent(body, "property", "og:title") ?? titleOf(body) ?? "Untitled role";
  const description = stripHtml(body);
  // Location inference mirrors the ingestion/location.ts signals so the
  // workMode gate sees the same evidence the adapters provide.
  const haystack = `${title} ${description}`;
  const isRemote = /\b(remote|work from home|work-from-home|distributed|fully remote|remote-first|remote india|remote apac)\b/i.test(haystack);
  const inBangalore = /\b(bangalore|bengaluru|karnataka)\b/i.test(haystack);
  return {
    title,
    description,
    companyName,
    location: isRemote ? "Remote" : inBangalore ? "Bangalore" : undefined,
    remote: isRemote || undefined,
    applyUrl: url,
  };
}

export async function importJobFromUrl(url: string): Promise<
  | { ok: true; jobId: string }
  | { ok: false; reason: string }
> {
  let parsed: URL;
  try {
    parsed = assertImportableUrl(url);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "bad URL" };
  }

  let html: string;
  try {
    const res = await fetchWithTimeout(parsed.toString(), { timeout: 10_000 });
    if (!res.ok) return { ok: false, reason: `fetch failed: ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_HTML_BYTES)
      return { ok: false, reason: "page too large to import" };
    html = new TextDecoder().decode(buf);
  } catch {
    return { ok: false, reason: "could not fetch that URL" };
  }

  const fields = parseImportedPage(parsed.toString(), html);
  if (!fields.description || fields.description.length < 200) {
    return { ok: false, reason: "no readable job content found on that page" };
  }

  const parsedJob = rawJobSchema.safeParse({
    externalId: parsed.toString(),
    title: fields.title,
    description: fields.description,
    companyName: fields.companyName,
    location: fields.location,
    remote: fields.remote,
    applyUrl: fields.applyUrl,
  });
  if (!parsedJob.success) return { ok: false, reason: "page is missing job details" };
  const job = parsedJob.data;

  const classification = classifyJob(job);
  if (!classification.accepted)
    return { ok: false, reason: classification.reason ?? "not a CS role" };

  const entryCheck = isEntryLevel(job);
  if (!entryCheck.accepted)
    return { ok: false, reason: entryCheck.reason ?? "not entry-level" };

  const workMode = getWorkMode(job);
  if (!workMode) return { ok: false, reason: "location is not eligible" };

  const slug = job.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");
  const company = await prisma.company.upsert({
    where: { slug },
    update: {},
    create: { name: job.companyName, slug, companyType: "STARTUP" },
  });

  const saved = await prisma.job.upsert({
    where: {
      externalId_source: { externalId: job.externalId, source: "MANUAL" },
    },
    update: {},
    create: {
      id: nanoid(),
      externalId: job.externalId,
      source: "MANUAL",
      title: job.title,
      description: stripHtml(job.description),
      applyUrl: job.applyUrl,
      companyId: company.id,
      location: job.location ?? null,
      workMode,
      jobType: job.jobType ?? null,
      experience: entryCheck.experienceLevel ?? null,
      skills: extractSkills(job.title, job.description),
      postedAt: new Date(),
      classificationScore: classification.confidence,
      sourceScore: 2,
    },
  });
  return { ok: true, jobId: saved.id };
}
