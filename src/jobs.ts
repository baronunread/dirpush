import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import type { Db } from "./db";
import { events, jobs, type Job, type JobKind } from "./db/schema";
import { recordAccount } from "./accounts";

export const LEASE_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 5;
/** The one step with an external side effect we cannot see from here. */
export const SUBMITTING = "submitting";

export class JobError extends Error {}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function logEvent(tx: Tx | Db, jobId: string | null, type: string, worker: string | null, data: Record<string, unknown> = {}) {
  tx.insert(events).values({ jobId, type, worker, data }).run();
}

function get(tx: Tx, id: string): Job {
  const job = tx.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!job) throw new JobError(`no such job: ${id}`);
  return job;
}

function set(tx: Tx, id: string, patch: Partial<Job>, now: number) {
  return tx.update(jobs).set({ ...patch, updatedAt: now }).where(eq(jobs.id, id)).returning().get()!;
}

function owned(job: Job, worker: string, now: number, statuses: Job["status"][] = ["running"]) {
  if (!statuses.includes(job.status)) throw new JobError(`job ${job.id} is ${job.status}, expected ${statuses.join("|")}`);
  if (job.worker !== worker) throw new JobError(`job ${job.id} is leased to ${job.worker}, not ${worker}`);
  if ((job.leaseExpiresAt ?? 0) < now) throw new JobError(`lease on ${job.id} expired; claim it again`);
}

/** Leaving a job mid-submit means we no longer know whether the directory got it. */
const released = (job: Job) => (job.step === SUBMITTING ? ("unknown" as const) : null);

const tx = <T>(db: Db, fn: (tx: Tx) => T) => db.transaction(fn, { behavior: "immediate" });

export function enqueue(db: Db, kind: JobKind, subject: string, productId = "", now = Date.now()): Job {
  return tx(db, (t) => {
    const existing = t
      .select()
      .from(jobs)
      .where(and(eq(jobs.kind, kind), eq(jobs.subject, subject), eq(jobs.productId, productId)))
      .get();
    if (existing) return existing;
    const id = `${kind === "research" ? "r" : "s"}_${crypto.randomUUID().slice(0, 8)}`;
    const job = t.insert(jobs).values({ id, kind, subject, productId, createdAt: now, updatedAt: now }).returning().get();
    logEvent(t, id, "job_created", null, { kind, subject, productId });
    return job;
  });
}

function claimableWhere(now: number, kind?: JobKind) {
  const expired = or(isNull(jobs.leaseExpiresAt), lte(jobs.leaseExpiresAt, now));
  const ready = or(
    eq(jobs.status, "queued"),
    and(eq(jobs.status, "retry"), or(isNull(jobs.notBefore), lte(jobs.notBefore, now))),
    and(inArray(jobs.status, ["running", "unknown"]), expired),
  );
  return kind ? and(eq(jobs.kind, kind), ready) : ready;
}

/** Unknown first (they block retries), then oldest. */
export function next(db: Db, kind?: JobKind, now = Date.now()): Job | undefined {
  const rows = db.select().from(jobs).where(claimableWhere(now, kind)).orderBy(asc(jobs.createdAt)).all();
  return rows.find((j) => j.status === "unknown") ?? rows[0];
}

export function claim(db: Db, id: string, worker: string, now = Date.now()): Job {
  return tx(db, (t) => {
    const job = get(t, id);
    const ok = t.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, id), claimableWhere(now))).get();
    if (!ok) throw new JobError(`job ${id} is not claimable (${job.status}, worker ${job.worker ?? "-"})`);
    let status = job.status;
    if (status === "running") {
      logEvent(t, id, "lease_expired", job.worker, { step: job.step });
      if (job.step === SUBMITTING) {
        status = "unknown";
        logEvent(t, id, "submission_state_unknown", job.worker, { reason: "lease expired during submit" });
      }
    }
    const fresh = status === "queued" || status === "retry";
    const updated = set(
      t,
      id,
      {
        status: status === "unknown" ? "unknown" : "running",
        worker,
        leaseExpiresAt: now + LEASE_MS,
        attempts: fresh ? job.attempts + 1 : job.attempts,
        notBefore: null,
      },
      now,
    );
    logEvent(t, id, "claimed", worker, { status: updated.status, step: updated.step, attempt: updated.attempts });
    return updated;
  });
}

export function heartbeat(db: Db, id: string, worker: string, now = Date.now()) {
  return tx(db, (t) => {
    owned(get(t, id), worker, now, ["running", "unknown"]);
    return set(t, id, { leaseExpiresAt: now + LEASE_MS }, now);
  });
}

export function checkpoint(db: Db, id: string, worker: string, step: string, data: Record<string, unknown> = {}, now = Date.now()) {
  if (step === SUBMITTING) throw new JobError(`use 'work begin-submit' to enter ${SUBMITTING}`);
  return tx(db, (t) => {
    const job = get(t, id);
    owned(job, worker, now);
    if (job.step === SUBMITTING) throw new JobError(`job ${id} is mid-submit; record 'work submitted' or fail it`);
    logEvent(t, id, "checkpoint", worker, { step, ...data });
    recordAccount(t, job, data, now); // a checkpoint carrying {"account":…} keeps the accounts table current
    return set(t, id, { step, data: { ...job.data, ...data }, leaseExpiresAt: now + LEASE_MS }, now);
  });
}

/** Call immediately before clicking the directory's final submit button. */
export function beginSubmit(db: Db, id: string, worker: string, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    owned(job, worker, now);
    if (job.kind !== "submission") throw new JobError(`job ${id} is not a submission`);
    logEvent(t, id, "submit_attempted", worker);
    return set(t, id, { step: SUBMITTING, leaseExpiresAt: now + LEASE_MS }, now);
  });
}

export type Outcome = "submitted" | "pending" | "live" | "rejected" | "needs_badge"; // needs_badge: accepted but only goes/stays live with their badge on our site (we never add one)

/** Record that the directory has the listing. Valid mid-submit or while verifying an unknown job. */
export function recordSubmitted(db: Db, id: string, worker: string, outcome: Outcome = "submitted", listingUrl?: string, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    owned(job, worker, now, ["running", "unknown"]);
    if (job.status === "running" && job.step !== SUBMITTING) throw new JobError(`job ${id} never began submitting`);
    logEvent(t, id, "submission_recorded", worker, { outcome, listingUrl });
    return set(t, id, { status: "done", step: "submitted", outcome, listingUrl: listingUrl ?? job.listingUrl, worker: null, leaseExpiresAt: null }, now);
  });
}

/** Verification of an unknown job found no listing: safe to submit again. */
export function recordNotSubmitted(db: Db, id: string, worker: string, evidence: string, now = Date.now()) {
  return tx(db, (t) => {
    owned(get(t, id), worker, now, ["unknown"]);
    logEvent(t, id, "verified_not_submitted", worker, { evidence });
    return set(t, id, { status: "running", step: "verified_not_submitted", leaseExpiresAt: now + LEASE_MS }, now);
  });
}

export function complete(db: Db, id: string, worker: string, outcome: string, data: Record<string, unknown> = {}, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    owned(job, worker, now);
    if (job.step === SUBMITTING) throw new JobError(`job ${id} is mid-submit; use 'work submitted'`);
    logEvent(t, id, "completed", worker, { outcome });
    return set(t, id, { status: "done", step: "done", outcome, data: { ...job.data, ...data }, worker: null, leaseExpiresAt: null }, now);
  });
}

export function block(db: Db, id: string, worker: string, type: string, message: string, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    owned(job, worker, now, ["running", "unknown"]);
    logEvent(t, id, "blocked", worker, { type, message, step: job.step });
    return set(t, id, { status: "blocked", blockType: type, blockMessage: message, worker: null, leaseExpiresAt: null }, now);
  });
}

/** Human resolved the block. `approved` = explicit go-ahead on a permission block (dashboard Approve only). */
export function unblock(db: Db, id: string, note = "", now = Date.now(), approved = false) {
  return tx(db, (t) => {
    const job = get(t, id);
    if (job.status !== "blocked") throw new JobError(`job ${id} is ${job.status}, not blocked`);
    logEvent(t, id, "unblocked", "human", { type: job.blockType, note, ...(approved && job.blockType === "permission" && { approved }) });
    return set(t, id, { status: released(job) ?? "queued", blockType: null, blockMessage: null }, now);
  });
}

export function fail(db: Db, id: string, worker: string, reason: string, retryable: boolean, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    owned(job, worker, now, ["running", "unknown"]);
    const base = { lastError: reason, worker: null, leaseExpiresAt: null };
    if (released(job) || job.status === "unknown") {
      logEvent(t, id, "submission_state_unknown", worker, { reason });
      return set(t, id, { ...base, status: "unknown" }, now);
    }
    if (retryable && job.attempts < MAX_ATTEMPTS) {
      const notBefore = now + 2 ** job.attempts * 60_000;
      logEvent(t, id, "failed_retryable", worker, { reason, notBefore });
      return set(t, id, { ...base, status: "retry", notBefore }, now);
    }
    logEvent(t, id, "failed", worker, { reason, retryable });
    return set(t, id, { ...base, status: "failed" }, now);
  });
}

/** Graceful stop: hand the job back without penalty. */
export function release(db: Db, id: string, worker: string, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    owned(job, worker, now, ["running", "unknown"]);
    logEvent(t, id, "released", worker, { step: job.step });
    const status = job.status === "unknown" ? "unknown" : (released(job) ?? "queued");
    return set(t, id, { status, worker: null, leaseExpiresAt: null }, now);
  });
}

/** Did the human press Approve on a permission block of this job? */
export function approved(db: Db, id: string) {
  return db.select().from(events).where(and(eq(events.jobId, id), eq(events.type, "unblocked"))).all().some((e) => e.data.approved === true);
}

/** Human: give a failed job another go. */
export function requeue(db: Db, id: string, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    if (job.status !== "failed") throw new JobError(`job ${id} is ${job.status}, not failed`);
    logEvent(t, id, "requeued", "human");
    return set(t, id, { status: "queued", step: "queued", attempts: 0, lastError: null }, now);
  });
}

/** Human: redo a finished research job (verdict looked wrong). */
export function reopen(db: Db, id: string, note = "", now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    // A queued job can be reopened again to replace its note.
    if (job.kind !== "research" || (job.status !== "done" && job.status !== "queued")) throw new JobError(`job ${id} is not a finished or queued research job`);
    logEvent(t, id, "reopened", "human", { previous: job.outcome, note });
    return set(t, id, { status: "queued", step: "queued", attempts: 0, outcome: null, data: { ...job.data, reopenNote: note } }, now);
  });
}

/**
 * The human listed the product themselves (or found it already listed). Any job that isn't mid-run becomes a
 * finished submission, so no agent submits there again; `submissions check` then tracks it like any other.
 */
export function recordManual(db: Db, id: string, outcome: Outcome, listingUrl?: string, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    if (job.kind !== "submission") throw new JobError(`job ${id} is not a submission`);
    if ((job.status === "running" || job.status === "unknown") && (job.leaseExpiresAt ?? 0) > now)
      throw new JobError(`an agent (${job.worker}) is working on ${job.subject} right now; wait for it to stop`);
    logEvent(t, id, "added_manually", "human", { outcome, listingUrl, from: job.status });
    return set(t, id, {
      status: "done", step: "submitted", outcome, listingUrl: listingUrl ?? job.listingUrl,
      worker: null, leaseExpiresAt: null, blockType: null, blockMessage: null, lastError: null,
    }, now);
  });
}

/** Moderation tracking after submit: pending -> live/rejected. */
export function setOutcome(db: Db, id: string, outcome: Outcome, listingUrl?: string, now = Date.now()) {
  return tx(db, (t) => {
    const job = get(t, id);
    if (job.status !== "done" || job.kind !== "submission") throw new JobError(`job ${id} is not a finished submission`);
    logEvent(t, id, "outcome_changed", null, { from: job.outcome, to: outcome, listingUrl });
    return set(t, id, { outcome, listingUrl: listingUrl ?? job.listingUrl }, now);
  });
}

export const jobEvents = (db: Db, id: string) =>
  db.select().from(events).where(eq(events.jobId, id)).orderBy(asc(events.at), asc(events.id)).all();

export { logEvent };
