import { and, eq, gt, inArray, like } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db";
import { events, jobs, type Job } from "./db/schema";
import * as J from "./jobs";
import { recordRating } from "./ratings";

/**
 * One-off import of the retired dirpush.com app's D1 export (see `launch import hosted`).
 * The hosted app ran the same launch through MCP from Oct 11–14, so its rows are often newer than ours.
 */

/** A tracked_targets row as exported by `wrangler d1 execute --json`. */
export type HostedTarget = {
  product_id: string; directory_id: string; state: string; detail: string | null; listing_url: string | null; updated_at: number;
  job_id: string | null; block_type: string | null; fields: string | null; badge: number; decision: string | null;
  answer: string | null; reason: string | null; action: string | null; diagnostics: string | null; account_hint: string | null;
};
export type HostedEvent = { id: number; product_id: string; directory_id: string; at: number; kind: string; data: string | null };
export type HostedRating = { domain: string; measured_at: number; rating: number };

const parse = (s: string | null) => {
  if (s == null) return undefined;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
};

/** The local job fields a hosted state stands for; null = a hosted-only recommendation that was never queued. */
export function jobPatch(t: HostedTarget): Partial<Job> | null {
  const clear = { worker: null, leaseExpiresAt: null, notBefore: null, blockType: null, blockMessage: null, lastError: null };
  switch (t.state) {
    case "live":
    case "pending":
    case "needs_badge":
    case "rejected":
      return { ...clear, status: "done", step: "submitted", outcome: t.state, ...(t.listing_url && { listingUrl: t.listing_url }) };
    case "blocked":
      return { ...clear, status: "blocked", blockType: t.block_type ?? "manual", blockMessage: t.detail ?? "blocked on the hosted dashboard" };
    case "paused":
      return { ...clear, status: "blocked", blockType: "hold", blockMessage: t.detail ?? "paused on the hosted dashboard" };
    case "failed":
      return { ...clear, status: "failed", lastError: [t.reason, t.detail].filter(Boolean).join(": ") || "failed on the hosted dashboard" };
    case "todo":
      if (t.badge && t.decision === "declined") return { ...clear, status: "failed", lastError: "badge: free only with a badge, declined" };
      // The old sync pushed unqueued recommendations as "recommended, not queued"; anything else was worked on hosted.
      return t.job_id || (t.detail && t.detail !== "recommended, not queued") ? { ...clear, status: "queued", step: "queued" } : null;
    case "in_progress":
      return { ...clear, status: "queued", step: "queued" };
    default:
      return null;
  }
}

/** Hosted-only context the dashboard recorded (customer replies, required fields, agent diagnostics). */
function hostedData(t: HostedTarget) {
  const entries = Object.entries({
    action: parse(t.action), fields: parse(t.fields), answer: parse(t.answer), diagnostics: parse(t.diagnostics),
    reason: t.reason, decision: t.decision, accountHint: t.account_hint,
  }).filter(([, v]) => v != null);
  return entries.length ? { hosted: Object.fromEntries(entries) } : {};
}

export function importHosted(
  db: Db,
  input: { targets: HostedTarget[]; events: HostedEvent[]; ratings: HostedRating[] },
  products: string[],
) {
  const summary = { applied: 0, created: 0, keptLocal: 0, recommendationsSkipped: 0, events: 0, ratings: 0, skippedProducts: new Set<string>() };
  const known = new Set(products);
  const jobFor = new Map<string, string>(); // product/directory -> local job id, for events

  for (const t of input.targets) {
    if (!known.has(t.product_id)) {
      summary.skippedProducts.add(t.product_id);
      continue;
    }
    const local =
      (t.job_id && db.select().from(jobs).where(eq(jobs.id, t.job_id)).get()) ||
      db.select().from(jobs).where(and(eq(jobs.kind, "submission"), eq(jobs.productId, t.product_id), eq(jobs.subject, t.directory_id))).get();
    if (local) jobFor.set(`${t.product_id}/${t.directory_id}`, local.id);
    const patch = jobPatch(t);
    if (!patch) {
      summary.recommendationsSkipped++;
      continue;
    }
    if (local && local.updatedAt >= t.updated_at) {
      summary.keptLocal++;
      continue;
    }
    const job = local ?? J.enqueue(db, "submission", t.directory_id, t.product_id, t.updated_at);
    if (!local) summary.created++;
    jobFor.set(`${t.product_id}/${t.directory_id}`, job.id);
    db.transaction((tx) => {
      tx.update(jobs).set({ ...patch, data: { ...job.data, ...hostedData(t) }, updatedAt: t.updated_at }).where(eq(jobs.id, job.id)).run();
      tx.insert(events).values({ jobId: job.id, type: "hosted_import", worker: "hosted", data: { from: { status: job.status, outcome: job.outcome }, to: t.state }, at: Date.now() }).run();
    });
    summary.applied++;
  }

  // Events are append-only history; the hosted id makes re-running the import a no-op.
  const seen = new Set(
    db.select({ data: events.data }).from(events).where(like(events.type, "hosted.%")).all().map((e) => (e.data as { hostedEventId?: number }).hostedEventId),
  );
  for (const e of input.events) {
    if (!known.has(e.product_id) || seen.has(e.id)) continue;
    const data = parse(e.data);
    db.insert(events).values({
      jobId: jobFor.get(`${e.product_id}/${e.directory_id}`) ?? null,
      type: `hosted.${e.kind}`,
      worker: "hosted",
      data: { hostedEventId: e.id, directoryId: e.directory_id, ...(data && typeof data === "object" ? data : { value: data }) },
      at: e.at,
    }).run();
    summary.events++;
  }

  // The import's own events would otherwise sort as "today" in a job's timeline: date them to the hosted history.
  const firstHosted = new Map<string, number>();
  for (const e of input.events) {
    const k = `${e.product_id}/${e.directory_id}`;
    firstHosted.set(k, Math.min(firstHosted.get(k) ?? e.at, e.at));
  }
  for (const t of input.targets) {
    const jobId = jobFor.get(`${t.product_id}/${t.directory_id}`);
    if (!jobId) continue;
    const first = Math.min(firstHosted.get(`${t.product_id}/${t.directory_id}`) ?? t.updated_at, t.updated_at);
    db.update(events).set({ at: t.updated_at }).where(and(eq(events.jobId, jobId), eq(events.type, "hosted_import"))).run();
    db.update(events).set({ at: first - 1 }).where(and(eq(events.jobId, jobId), inArray(events.type, ["job_created"]), gt(events.at, t.updated_at))).run();
  }

  for (const r of input.ratings) {
    recordRating(db, r.domain, r.rating, r.measured_at);
    summary.ratings++;
  }
  return { ...summary, skippedProducts: [...summary.skippedProducts] };
}

/** Reads the `wrangler d1 execute --json` files written to `dir` (one per table). */
export async function readHostedExport(dir: string) {
  const table = async <T>(name: string): Promise<T[]> => {
    const file = join(dir, `${name}.json`);
    if (!existsSync(file)) throw new Error(`missing ${file}; export it first (see 'launch import hosted' in docs/operator.md)`);
    const parsed = JSON.parse(await Bun.file(file).text()) as { results?: T[]; error?: unknown }[] | { error: unknown };
    if (!Array.isArray(parsed) || !parsed[0]?.results) throw new Error(`${file} is not a successful wrangler --json export`);
    return parsed[0].results;
  };
  return {
    targets: await table<HostedTarget>("tracked_targets"),
    events: await table<HostedEvent>("target_events"),
    ratings: await table<HostedRating>("domain_rating_history"),
  };
}
