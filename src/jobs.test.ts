import { expect, test } from "bun:test";
import { openDb } from "./db";
import * as J from "./jobs";

const T0 = 1_000_000;

test("happy path submission", () => {
  const db = openDb(":memory:");
  const job = J.enqueue(db, "submission", "saashub", "acme", T0);
  expect(J.enqueue(db, "submission", "saashub", "acme", T0).id).toBe(job.id); // idempotent
  expect(J.next(db, undefined, T0)?.id).toBe(job.id);
  J.claim(db, job.id, "claude", T0);
  expect(() => J.claim(db, job.id, "codex", T0 + 1)).toThrow(J.JobError);
  J.checkpoint(db, job.id, "claude", "authenticated", {}, T0 + 2);
  J.beginSubmit(db, job.id, "claude", T0 + 3);
  expect(() => J.complete(db, job.id, "claude", "x", {}, T0 + 4)).toThrow(/mid-submit/);
  const done = J.recordSubmitted(db, job.id, "claude", "pending", "https://saashub.com/acme", T0 + 5);
  expect(done.status).toBe("done");
  expect(J.setOutcome(db, job.id, "live", undefined, T0 + 6).outcome).toBe("live");
});

test("worker dies mid-submit -> unknown -> must verify before resubmitting", () => {
  const db = openDb(":memory:");
  const { id } = J.enqueue(db, "submission", "d", "p", T0);
  J.claim(db, id, "claude", T0);
  J.beginSubmit(db, id, "claude", T0 + 1);
  // lease still valid: nobody else can take it
  expect(J.next(db, undefined, T0 + 2)).toBeUndefined();
  const later = T0 + J.LEASE_MS + 10;
  const taken = J.claim(db, id, "codex", later);
  expect(taken.status).toBe("unknown");
  expect(() => J.checkpoint(db, id, "codex", "filling", {}, later)).toThrow(); // not running
  J.recordNotSubmitted(db, id, "codex", "no listing in account history", later + 1);
  J.beginSubmit(db, id, "codex", later + 2);
  expect(J.recordSubmitted(db, id, "codex", "submitted", undefined, later + 3).status).toBe("done");
});

test("failing or blocking mid-submit never becomes a blind retry", () => {
  const db = openDb(":memory:");
  const { id } = J.enqueue(db, "submission", "d", "p", T0);
  J.claim(db, id, "w", T0);
  J.beginSubmit(db, id, "w", T0);
  expect(J.fail(db, id, "w", "timeout", true, T0 + 1).status).toBe("unknown");

  const b = J.enqueue(db, "submission", "d2", "p", T0);
  J.claim(db, b.id, "w", T0);
  J.beginSubmit(db, b.id, "w", T0);
  J.block(db, b.id, "w", "captcha", "solve it", T0 + 1);
  expect(J.unblock(db, b.id, "", T0 + 2).status).toBe("unknown");
});

test("retryable failures back off then fail permanently", () => {
  const db = openDb(":memory:");
  const { id } = J.enqueue(db, "research", "x.com", "", T0);
  let t = T0;
  for (let i = 1; i <= J.MAX_ATTEMPTS; i++) {
    const j = J.claim(db, id, "w", t);
    expect(j.attempts).toBe(i);
    const f = J.fail(db, id, "w", "net", true, t);
    if (i < J.MAX_ATTEMPTS) {
      expect(f.status).toBe("retry");
      expect(() => J.claim(db, id, "w", t + 1)).toThrow(); // backoff
      t = f.notBefore!;
    } else expect(f.status).toBe("failed");
  }
  expect(J.requeue(db, id, t).status).toBe("queued");
});

test("unknown jobs are served first", () => {
  const db = openDb(":memory:");
  J.enqueue(db, "submission", "a", "p", T0);
  const b = J.enqueue(db, "submission", "b", "p", T0 + 1);
  J.claim(db, b.id, "w", T0 + 2);
  J.beginSubmit(db, b.id, "w", T0 + 2);
  J.release(db, b.id, "w", T0 + 3);
  expect(J.next(db, undefined, T0 + 4)?.id).toBe(b.id);
});
