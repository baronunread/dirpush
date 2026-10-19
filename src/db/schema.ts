import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const CLASSIFICATIONS = [
  "UNVERIFIED",
  "VERIFIED_FREE",
  "FREEMIUM",
  "CONDITIONAL_FREE",
  "PAID",
  "DEAD",
  "NOT_RELEVANT",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export type Provenance = { source: string; name?: string; url: string; claims?: Record<string, unknown> };

/** Unverified research queue. Only verified entries become registry/directories/*.yaml. */
export const candidates = sqliteTable("candidates", {
  domain: text("domain").primaryKey(),
  name: text("name"),
  url: text("url").notNull(),
  classification: text("classification").$type<Classification>().notNull().default("UNVERIFIED"),
  provenance: json<Provenance[]>("provenance").notNull().default([]),
  notes: text("notes"),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const JOB_STATUSES = ["queued", "running", "blocked", "retry", "unknown", "failed", "done"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobKind = "research" | "submission";

/**
 * One row per canonical unit of work: a research job per candidate domain, a
 * submission job per (product, directory). `status` is coarse and enforced;
 * `step` is the agent's free-form checkpoint inside a running job.
 */
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<JobKind>().notNull(),
    subject: text("subject").notNull(), // candidate domain or directory id
    productId: text("product_id").notNull().default(""),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    step: text("step").notNull().default("queued"),
    worker: text("worker"),
    leaseExpiresAt: integer("lease_expires_at"),
    notBefore: integer("not_before"),
    attempts: integer("attempts").notNull().default(0),
    blockType: text("block_type"),
    blockMessage: text("block_message"),
    lastError: text("last_error"),
    outcome: text("outcome"), // research: classification; submission: submitted|pending|live|rejected
    listingUrl: text("listing_url"),
    data: json<Record<string, unknown>>("data").notNull().default({}),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("jobs_unique_subject").on(t.kind, t.productId, t.subject), index("jobs_status").on(t.status)],
);

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: text("job_id"),
    type: text("type").notNull(),
    worker: text("worker"),
    data: json<Record<string, unknown>>("data").notNull().default({}),
    at: integer("at").notNull().default(now),
  },
  (t) => [index("events_job").on(t.jobId)],
);

export type GalleryItem = { id: string; path: string; description: string };

export const galleries = sqliteTable("galleries", {
  revision: integer("revision").primaryKey({ autoIncrement: true }),
  productId: text("product_id").notNull(),
  items: json<GalleryItem[]>("items").notNull(),
  status: text("status").$type<"proposed" | "approved" | "rejected">().notNull().default("proposed"),
  createdAt: integer("created_at").notNull().default(now),
});

/** Product-wide approvals (such as permission-gated asset capture), independent of directory jobs. */
export const productApprovals = sqliteTable("product_approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: text("product_id").notNull(),
  action: text("action").notNull(),
  message: text("message").notNull(),
  status: text("status").$type<"pending" | "approved" | "rejected" | "used">().notNull().default("pending"),
  createdAt: integer("created_at").notNull().default(now),
  resolvedAt: integer("resolved_at"),
});

export const registryChanges = sqliteTable("registry_changes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  directoryId: text("directory_id").notNull(),
  observation: json<Record<string, unknown>>("observation").notNull(),
  status: text("status").$type<"proposed" | "accepted" | "rejected">().notNull().default("proposed"),
  createdAt: integer("created_at").notNull().default(now),
});

/** Things only the human can do that don't hold up a job (verify an email, check a listing). */
export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: text("product_id").notNull().default(""),
  jobId: text("job_id"),
  message: text("message").notNull(),
  url: text("url"),
  status: text("status").$type<"open" | "done">().notNull().default("open"),
  createdAt: integer("created_at").notNull().default(now),
});

/**
 * One row per directory account (per product unless shared). Written whenever a job checkpoints an `account`, so
 * "do we already have a login here, and how do we sign in?" has one answer. Never holds a secret: passwords stay in
 * the agent-browser vault, referenced by `vault`.
 */
export const ACCOUNT_METHODS = ["password", "google", "github", "magic_link", "other"] as const;
export const accounts = sqliteTable(
  "accounts",
  {
    directoryId: text("directory_id").notNull(),
    productId: text("product_id").notNull().default(""), // "" = one account shared by every product
    method: text("method", { enum: ACCOUNT_METHODS }).notNull(),
    username: text("username"),
    vault: text("vault"),
    jobId: text("job_id"),
    createdAt: integer("created_at").notNull().default(now),
    lastLoginAt: integer("last_login_at"),
  },
  (t) => [primaryKey({ columns: [t.directoryId, t.productId] })],
);
export type Account = typeof accounts.$inferSelect;

/** Append-only Ahrefs Domain Rating readings (optional, needs AHREFS_API_KEY). Latest = highest measuredAt. */
export const domainRatings = sqliteTable(
  "domain_ratings",
  {
    domain: text("domain").notNull(),
    measuredAt: integer("measured_at").notNull(),
    rating: real("rating").notNull(),
  },
  (t) => [primaryKey({ columns: [t.domain, t.measuredAt] })],
);

export type Job = typeof jobs.$inferSelect;
