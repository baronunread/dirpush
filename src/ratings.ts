import { desc, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { domainRatings } from "./db/schema";

/** Ahrefs' free Domain Rating endpoint. Bring your own key via AHREFS_API_KEY; never a flag or file. */
const ENDPOINT = "https://api.ahrefs.com/v3/public/domain-rating-free";
const BATCH_SIZE = 80;
export const RATING_TTL = 7 * 24 * 60 * 60 * 1000;

export function ratingDomain(website: string): string {
  try {
    return new URL(website.includes("://") ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// A list hosted on a platform (a GitHub repo, a Notion page) would inherit the platform's DR, which says nothing about the list.
const PLATFORM = /^(github\.com|gitlab\.com|[\w-]+\.notion\.site|notion\.so|medium\.com|[\w-]+\.substack\.com|reddit\.com|docs\.google\.com)$/;
export const platformHosted = (website: string) => PLATFORM.test(ratingDomain(website));

/** Every reading per domain, newest first. */
export function ratingHistory(db: Db, websites: string[]) {
  const domains = [...new Set(websites.map(ratingDomain).filter(Boolean))];
  const rows = domains.length
    ? db.select().from(domainRatings).where(inArray(domainRatings.domain, domains)).orderBy(desc(domainRatings.measuredAt)).all()
    : [];
  const byDomain = new Map(domains.map((d) => [d, [] as { measuredAt: number; rating: number }[]]));
  for (const r of rows) byDomain.get(r.domain)!.push({ measuredAt: r.measuredAt, rating: r.rating });
  return byDomain;
}

export function recordRating(db: Db, domain: string, rating: number, measuredAt: number) {
  db.insert(domainRatings).values({ domain, rating, measuredAt }).onConflictDoNothing().run();
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Measures every domain not read in the last week (or all with `force`). One POST per batch of 80. */
export async function refreshRatings(
  db: Db,
  websites: string[],
  { apiKey, force = false, now = Date.now(), fetcher = fetch as Fetch }: { apiKey: string; force?: boolean; now?: number; fetcher?: Fetch },
) {
  const history = ratingHistory(db, websites);
  const due = [...history].filter(([, h]) => force || !h[0] || now - h[0].measuredAt >= RATING_TTL).map(([d]) => d);
  const measured: Record<string, number> = {};
  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const chunk = due.slice(i, i + BATCH_SIZE);
    const res = await fetcher(`${ENDPOINT}?output=json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ targets: chunk, version: "dr3" }),
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(res.status === 401 || res.status === 403 ? "Ahrefs rejected AHREFS_API_KEY" : `Ahrefs returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as { domain_rating?: { targets?: { target?: unknown; domain_rating?: unknown }[] } };
    for (const entry of data.domain_rating?.targets ?? []) {
      const domain = typeof entry.target === "string" ? ratingDomain(entry.target) : "";
      const value = entry.domain_rating;
      if (!chunk.includes(domain) || typeof value !== "number" || !(value >= 0 && value <= 100)) continue;
      recordRating(db, domain, value, now);
      measured[domain] = value;
    }
  }
  return { checked: due.length, skipped: history.size - due.length, measured };
}
