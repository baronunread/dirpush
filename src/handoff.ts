/**
 * Hand-offs: the bits of a submission only the human can do (sign into Google, tick a bot check, or fill a form on a
 * site that breaks under automation). Agent-first: the agent calls `handoff next`, which opens the page and returns
 * one sentence to relay in chat; when the human answers, `handoff done` hands the job back and the agent finishes it
 * right away, in the same window. `dirpush handoff` in a terminal walks a human through the same queue (src/walk.ts).
 */
import { join } from "node:path";
import { and, eq, gt, inArray } from "drizzle-orm";
import { HOME, PKG, type Db } from "./db";
import { events, jobs, type Job } from "./db/schema";
import * as J from "./jobs";
import { loadDirectory } from "./registry";
import { loadProduct, utm } from "./workspace";

export type Kind = "google_login" | "tick" | "own_browser";
/** `ask`: what the agent says in chat. `todo`: the same, short, for the terminal walk. */
export type Handoff = { kind: Kind; jobs: string[]; directory: string; name: string; url?: string; ask: string; todo: string };

const TICK = ["captcha", "bot_protection"];
const SKIP_HOURS = 12;
const env = { ...process.env, LAUNCH_HOME: HOME };
export const script = (name: string, ...args: string[]) =>
  Bun.spawnSync([join(PKG, "scripts", name), ...args], { env, stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exitCode;

/** Sites that break under automation: the agent's block message says the human must use their own browser. */
export const ownBrowser = (job: Job) => /your own browser/i.test(job.blockMessage ?? "");
const firstUrl = (s?: string | null) => s?.match(/https?:\/\/[^\s)'"”]+/)?.[0]?.replace(/[.,;:]$/, "");
/** The human's instruction from a block message written for them ("… in your own browser: <this>, then press s …"). */
const instruction = (job: Job) =>
  (job.blockMessage ?? "").split(/your own browser:?/i)[1]?.trim().replace(/,?\s*then press s in dirpush (checks|handoff)\.?$/i, "").replace(/\.$/, "") || "submit it";

function skippedRecently(db: Db) {
  const since = Date.now() - SKIP_HOURS * 3600_000;
  return new Set(db.select().from(events).where(and(eq(events.type, "handoff_skipped"), gt(events.at, since))).all().map((e) => e.jobId));
}

/** What's waiting on the human, in order: one Google sign-in for all directories that need it, then each check. */
export async function handoffQueue(db: Db, product?: string, opts: { includeSkipped?: boolean } = {}): Promise<Handoff[]> {
  const skipped = opts.includeSkipped ? new Set<string | null>() : skippedRecently(db);
  const blocked = db.select().from(jobs)
    .where(and(eq(jobs.kind, "submission"), eq(jobs.status, "blocked"), inArray(jobs.blockType, ["google_login", ...TICK]))).all()
    .filter((j) => (!product || j.productId === product) && !skipped.has(j.id));
  const out: Handoff[] = [];
  const google = blocked.filter((j) => j.blockType === "google_login");
  if (google.length) out.push({
    kind: "google_login", jobs: google.map((j) => j.id), directory: "google", name: "Google sign-in",
    todo: "A Chrome window opens: sign in, then quit it with ⌘Q.",
    ask: `A Chrome window is open on Google's sign-in page. Sign in, then quit that window with ⌘Q and tell me. (${google.length} ${google.length === 1 ? "directory needs" : "directories need"} it.)`,
  });
  for (const job of blocked.filter((j) => TICK.includes(j.blockType ?? ""))) {
    const dir = await loadDirectory(job.subject).then((d) => d.directory).catch(() => null);
    const name = dir?.name ?? job.subject;
    const url = firstUrl(job.blockMessage) ?? dir?.submission_url ?? dir?.website;
    out.push(ownBrowser(job)
      ? { kind: "own_browser", jobs: [job.id], directory: job.subject, name, url, todo: `Do this one in your own browser: ${instruction(job)}.`,
          ask: `${name} breaks when an agent drives the browser, so this one's by hand. I opened it in your browser: ${instruction(job)}. Tell me when it's submitted, with the listing link if there is one.` }
      : { kind: "tick", jobs: [job.id], directory: job.subject, name, url, todo: "Tick the box in the window that opened. No box? Just press enter.",
          ask: `A Chrome window is open on ${name}. Tick the box if you see one (no box is fine too), then tell me "done".` });
  }
  return out;
}

/** Opens the page for a hand-off: plain Chrome for Google, the agents' Chrome for a check, the human's browser otherwise. */
export function openHandoff(h: Handoff) {
  if (h.kind === "google_login") {
    // Blocks until the human quits that window, so detach: the agent waits for the human's reply in chat instead.
    Bun.spawn([join(PKG, "scripts/google-login")], { env, stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
    return true;
  }
  if (!h.url) return false;
  if (h.kind === "own_browser") return Bun.spawnSync(["open", h.url]).exitCode === 0;
  if (script("ab", "open", h.url) !== 0) return false;
  script("show-browser");
  return true;
}

/** For the agent: the next hand-off, opened, with the sentence to relay and (by hand) the facts to paste. */
export async function handoffNext(db: Db, product?: string) {
  const [h, ...rest] = await handoffQueue(db, product);
  if (!h) return { next: null, note: "nothing waiting on the human" };
  const opened = openHandoff(h);
  const paste = h.kind === "own_browser" ? await pasteFacts(db, h.jobs[0]!) : undefined;
  return {
    ...h, opened, ...(paste && { paste }), remaining: rest.length,
    then: h.kind === "own_browser"
      ? `when they say it's submitted: dirpush handoff mine ${h.jobs[0]} [--listing-url <url>]`
      : `when they say done: dirpush handoff done ${h.kind === "google_login" ? "google" : h.jobs[0]}, then claim and finish ${h.kind === "google_login" ? "those jobs" : "it now, in the same tab"}`,
    ...(!opened && h.url && { note: `couldn't open the page; give the human this link: ${h.url}` }),
  };
}

async function pasteFacts(db: Db, jobId: string) {
  const job = db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return undefined;
  const p = await loadProduct(job.productId).catch(() => null);
  if (!p) return undefined;
  return {
    name: p.name, website: utm(p.url, job.subject), tagline: p.tagline,
    short: p.descriptions?.short, description: p.descriptions?.medium, categories: p.categories,
    logo: p.assets?.icon ? join(p.dir, p.assets.icon) : undefined,
  };
}

/** The human did their part: hand the job(s) back to the agents. `google` hands back every Google sign-in job. */
export function handoffDone(db: Db, id: string) {
  const ids = id === "google"
    ? db.select().from(jobs).where(and(eq(jobs.status, "blocked"), eq(jobs.blockType, "google_login"))).all().map((j) => j.id)
    : [id];
  const note = id === "google" ? "human signed into Google in the agents' Chrome profile" : "human cleared the check in the agents' Chrome; continue in the same tab";
  return { handedBack: ids.map((j) => J.unblock(db, j, note)).map((j) => ({ id: j.id, directory: j.subject })), then: "claim each and finish it now" };
}

/** The human submitted it themselves. */
export const handoffMine = (db: Db, id: string, listingUrl?: string) => J.recordManual(db, id, "pending", listingUrl);

/** Not now: leave it blocked, out of `handoff next` for a while. */
export function handoffSkip(db: Db, id: string) {
  J.noteEvent(db, id, "handoff_skipped");
  return { skipped: id, until: new Date(Date.now() + SKIP_HOURS * 3600_000).toISOString() };
}
