import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { openDb } from "./db";
import { events, jobs } from "./db/schema";
import { importHosted, jobPatch, type HostedTarget } from "./import-hosted";
import * as J from "./jobs";
import { ratingHistory, refreshRatings } from "./ratings";

const target = (over: Partial<HostedTarget>): HostedTarget => ({
  product_id: "acme", directory_id: "dir-a", state: "pending", detail: null, listing_url: null, updated_at: 2000,
  job_id: null, block_type: null, fields: null, badge: 0, decision: null, answer: null, reason: null, action: null, diagnostics: null, account_hint: null,
  ...over,
});

test("hosted states map to local job states", () => {
  expect(jobPatch(target({ state: "live", listing_url: "https://d/x" }))).toMatchObject({ status: "done", outcome: "live", listingUrl: "https://d/x" });
  expect(jobPatch(target({ state: "blocked", block_type: "permission", detail: "ok?" }))).toMatchObject({ status: "blocked", blockType: "permission", blockMessage: "ok?" });
  expect(jobPatch(target({ state: "paused" }))).toMatchObject({ status: "blocked", blockType: "hold" });
  expect(jobPatch(target({ state: "failed", reason: "paid", detail: "$9" }))).toMatchObject({ status: "failed", lastError: "paid: $9" });
  expect(jobPatch(target({ state: "todo", badge: 1, decision: "declined", job_id: "s_1" }))).toMatchObject({ status: "failed" });
  expect(jobPatch(target({ state: "todo", job_id: "s_1" }))).toMatchObject({ status: "queued" });
  expect(jobPatch(target({ state: "todo", detail: "recommended, not queued" }))).toBeNull(); // never-queued recommendation
  expect(jobPatch(target({ state: "todo", detail: "signup needs a password" }))).toMatchObject({ status: "queued" }); // worked on hosted only
});

test("import applies newer hosted rows, keeps newer local ones, and is idempotent", () => {
  const db = openDb(":memory:");
  const older = J.enqueue(db, "submission", "dir-a", "acme", 1000);
  const newer = J.enqueue(db, "submission", "dir-b", "acme", 5000);
  const input = {
    targets: [
      target({ directory_id: "dir-a", job_id: older.id, state: "live", listing_url: "https://a/acme", answer: '{"values":{"x":"1"}}' }),
      target({ directory_id: "dir-b", job_id: newer.id, state: "failed" }),
      target({ directory_id: "dir-c", state: "blocked", block_type: "captcha", detail: "tick it" }),
      target({ directory_id: "dir-d", state: "todo", detail: "recommended, not queued" }),
      target({ product_id: "other", directory_id: "dir-a" }),
    ],
    events: [{ id: 7, product_id: "acme", directory_id: "dir-a", at: 1500, kind: "report", data: '{"state":"live"}' }],
    ratings: [{ domain: "acme.com", measured_at: 100, rating: 15 }],
  };
  const first = importHosted(db, input, ["acme"]);
  expect(first).toMatchObject({ applied: 2, created: 1, keptLocal: 1, recommendationsSkipped: 1, events: 1, ratings: 1, skippedProducts: ["other"] });

  const a = db.select().from(jobs).where(eq(jobs.id, older.id)).get()!;
  expect(a).toMatchObject({ status: "done", outcome: "live", listingUrl: "https://a/acme" });
  expect(a.data).toMatchObject({ hosted: { answer: { values: { x: "1" } } } });
  expect(db.select().from(jobs).where(eq(jobs.id, newer.id)).get()!.status).toBe("queued");
  expect(db.select().from(jobs).where(eq(jobs.subject, "dir-c")).get()).toMatchObject({ status: "blocked", blockType: "captcha" });
  expect(db.select().from(events).where(eq(events.type, "hosted.report")).get()).toMatchObject({ jobId: older.id, at: 1500 });

  const again = importHosted(db, input, ["acme"]);
  expect(again).toMatchObject({ applied: 0, created: 0, events: 0 });
  expect(ratingHistory(db, ["https://www.acme.com"]).get("acme.com")).toEqual([{ measuredAt: 100, rating: 15 }]);
});

test("ratings refresh only stale domains and keep history", async () => {
  const db = openDb(":memory:");
  const calls: string[][] = [];
  const fetcher = async (_url: string, init: RequestInit) => {
    const { targets } = JSON.parse(String(init.body)) as { targets: string[] };
    calls.push(targets);
    return Response.json({ domain_rating: { targets: targets.map((t) => ({ target: t, domain_rating: 20 })) } });
  };
  const week = 7 * 24 * 3600 * 1000;
  expect((await refreshRatings(db, ["https://acme.com", "beta.io"], { apiKey: "k", now: week, fetcher })).measured).toEqual({ "acme.com": 20, "beta.io": 20 });
  expect((await refreshRatings(db, ["https://acme.com"], { apiKey: "k", now: week + 1000, fetcher })).checked).toBe(0);
  await refreshRatings(db, ["https://acme.com"], { apiKey: "k", now: 2 * week, fetcher });
  expect(calls).toEqual([["acme.com", "beta.io"], ["acme.com"]]);
  expect(ratingHistory(db, ["acme.com"]).get("acme.com")!.map((r) => r.measuredAt)).toEqual([2 * week, week]);
  const denied = async () => new Response("no", { status: 401 });
  expect(refreshRatings(db, ["new.dev"], { apiKey: "bad", fetcher: denied })).rejects.toThrow(/rejected/);
});
