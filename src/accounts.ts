/**
 * Directory accounts: which directories we already have a login on, and how to sign in. Rows come from job
 * checkpoints (`--data '{"account":{…}}'`), so agents never write them by hand. No secrets here: password accounts
 * point at an agent-browser vault entry by name.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import { accounts, jobs, type Account } from "./db/schema";

type Method = Account["method"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Reads the account a checkpoint describes: {vault, username} or {oauth: "google"|"github"} or {method, username}. */
export function accountFrom(data: Record<string, unknown>): { method: Method; username: string | null; vault: string | null } | null {
  const a = data.account;
  if (!a) return null;
  if (typeof a === "string") return { method: "password", username: null, vault: a }; // older checkpoints: just the vault name
  if (typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const oauth = str(o.oauth)?.toLowerCase();
  const method: Method =
    oauth === "google" ? "google" : oauth === "github" ? "github" : oauth ? "other"
    : str(o.method) && (["password", "google", "github", "magic_link", "other"] as string[]).includes(str(o.method)!) ? (str(o.method) as Method)
    : str(o.vault) ? "password" : "other";
  return { method, username: str(o.username) ?? str(o.email), vault: str(o.vault) };
}

/** Upsert from a job checkpoint; keeps the original createdAt, refreshes lastLoginAt. */
export function recordAccount(t: Db | Tx, job: { id: string; subject: string; productId: string }, data: Record<string, unknown>, now = Date.now()) {
  const acc = accountFrom(data);
  if (!acc) return null;
  const shared = (data.account as Record<string, unknown> | undefined)?.shared === true;
  const key = { directoryId: job.subject, productId: shared ? "" : job.productId };
  const prev = t.select().from(accounts).where(and(eq(accounts.directoryId, key.directoryId), eq(accounts.productId, key.productId))).get();
  const row = {
    ...key,
    method: acc.method,
    username: acc.username ?? prev?.username ?? null,
    vault: acc.vault ?? prev?.vault ?? null,
    jobId: prev?.jobId ?? job.id,
    lastLoginAt: now,
  };
  if (prev) t.update(accounts).set(row).where(and(eq(accounts.directoryId, key.directoryId), eq(accounts.productId, key.productId))).run();
  else t.insert(accounts).values({ ...row, createdAt: now }).run();
  return row;
}

/** Accounts for a directory: the product's own first, then a shared one. */
export function accountsFor(db: Db, directoryId: string, productId?: string) {
  const rows = db.select().from(accounts).where(eq(accounts.directoryId, directoryId)).all();
  return rows.filter((r) => !productId || r.productId === productId || r.productId === "").sort((a, b) => (b.productId === productId ? 1 : 0) - (a.productId === productId ? 1 : 0));
}

export function listAccounts(db: Db, productId?: string) {
  return db.select().from(accounts).all().filter((r) => !productId || r.productId === productId || r.productId === "").sort((a, b) => a.directoryId.localeCompare(b.directoryId));
}

/**
 * One-time fill from what already exists: `account` data saved on jobs, then vault entries named
 * `<directory-id>-<product-id>` (or `<directory-id>`) that no job mentions.
 */
export function backfillAccounts(db: Db, vault: { name: string; username: string }[], directoryIds: Set<string>, productIds: string[]) {
  let fromJobs = 0, fromVault = 0;
  for (const j of db.select().from(jobs).where(eq(jobs.kind, "submission")).all()) {
    const data = (j.data ?? {}) as Record<string, unknown>;
    if (accountFrom(data) && recordAccount(db, j, data, j.updatedAt)) fromJobs++;
  }
  for (const v of vault) {
    const product = productIds.find((p) => v.name.endsWith(`-${p}`));
    const directoryId = product ? v.name.slice(0, -(product.length + 1)) : v.name;
    if (!directoryIds.has(directoryId)) continue;
    const productId = product ?? "";
    const prev = db.select().from(accounts).where(and(eq(accounts.directoryId, directoryId), eq(accounts.productId, productId))).get();
    if (prev?.vault) continue;
    if (prev) db.update(accounts).set({ vault: v.name, username: prev.username ?? v.username }).where(and(eq(accounts.directoryId, directoryId), eq(accounts.productId, productId))).run();
    else db.insert(accounts).values({ directoryId, productId, method: "password", username: v.username, vault: v.name }).run();
    fromVault++;
  }
  return { fromJobs, fromVault, total: db.select().from(accounts).all().length };
}
