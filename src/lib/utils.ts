export function daysAgo(date: Date | string | null): number {
  if (!date) return 9999;
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDaysAgo(date: Date | string | null): string {
  const d = daysAgo(date);
  if (d === 0) return "Today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} years ago`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function cn(
  ...classes: (string | boolean | undefined | null)[]
): string {
  return classes.filter(Boolean).join(" ");
}

/** FULL_TIME → "Full time", ENTRY → "Entry". Null-safe enum display. */
export function enumLabel(value?: string | null): string | null {
  if (!value) return null;
  const lower = value.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ENTITY_MAP: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function stripHtml(html: string): string {
  let text = html;
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    text = text.replaceAll(entity, char);
  }
  text = text.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, c) =>
    String.fromCharCode(parseInt(c, 16)),
  );
  text = text.replace(
    /<\/(p|div|h[1-6]|li|tr|td|th|ul|ol|section|article)>/gi,
    "\n",
  );
  text = text.replace(/<(br|hr)\/?>/gi, "\n");
  text = text.replace(/<[^>]*>/g, "");
  text = text.replace(/\n\s*\n/g, "\n");
  text = text.replace(/\s+/g, " ");
  return text.trim();
}

export async function fetchWithTimeout(
  url: string,
  options?: RequestInit & { timeout?: number },
): Promise<Response> {
  const timeout = options?.timeout ?? 5000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function runBatched<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(fn));
  }
}

export function formatSalary(
  min?: number,
  max?: number,
  curr?: string,
): string {
  const currency = curr || "₹";
  if (!min && !max) return "Salary Not Disclosed";

  const fmt = (val: number): string => {
    if (currency === "₹") {
      if (val >= 100000)
        return `₹${(val / 100000).toFixed(1).replace(/\.0$/, "")}L`;
      if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
    }
    if (currency === "$" || currency === "€" || currency === "£") {
      if (val >= 1000) return `${currency}${(val / 1000).toFixed(0)}k`;
    }
    return `${currency}${val.toLocaleString()}`;
  };

  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return `${fmt(max!)} max`;
}
