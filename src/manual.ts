import type { Db } from "./db";
import * as J from "./jobs";
import { loadDirectories, normalizeUrl } from "./registry";

/**
 * Records a listing the human made outside the agents. `target` is a registry id or any URL: a URL that
 * matches a registry directory's site maps to it, anything else is tracked under its domain.
 */
export async function addManualSubmission(db: Db, productId: string, target: string, outcome: J.Outcome, listingUrl?: string) {
  if (!["pending", "live", "rejected"].includes(outcome)) throw new Error("outcome must be pending, live or rejected");
  const dirs = await loadDirectories();
  let subject = dirs.find((d) => d.id === target)?.id;
  if (!subject) {
    let domain: string;
    try {
      domain = normalizeUrl(target).domain;
    } catch {
      throw new Error(`${target} is neither a registry directory id nor a URL`);
    }
    const matches = dirs.filter((d) => normalizeUrl(d.website).domain === domain).map((d) => d.id);
    if (matches.length > 1) throw new Error(`${domain} matches several directories (${matches.join(", ")}); pass the id`);
    subject = matches[0] ?? domain;
  }
  const job = J.enqueue(db, "submission", subject, productId);
  return { ...J.recordManual(db, job.id, outcome, listingUrl?.trim() || undefined), inRegistry: dirs.some((d) => d.id === subject) };
}
