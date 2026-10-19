import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import { galleries, jobs, productApprovals, registryChanges, todos } from "./db/schema";
import { logEvent, unblock } from "./jobs";

/** Human decisions, shared by the CLI and the dashboard. */
export function reviewGallery(db: Db, revision: number, status: "approved" | "rejected") {
  const row = db
    .update(galleries)
    .set({ status })
    .where(and(eq(galleries.revision, revision), eq(galleries.status, "proposed")))
    .returning()
    .get();
  if (!row) throw new Error(`gallery revision ${revision} is not awaiting review`);
  logEvent(db, null, `gallery_${status}`, "human", { revision });
  // Jobs parked on this product's gallery go back to the queue; the agent reads the decision.
  const waiting = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.productId, row.productId), eq(jobs.status, "blocked"), eq(jobs.blockType, "gallery_approval")))
    .all();
  for (const j of waiting) unblock(db, j.id, `gallery revision ${revision} ${status}`);
  return row;
}

/** Accepting only marks the proposal; an agent applies it to registry/directories/<id>/directory.yaml. */
export function reviewRegistryChange(db: Db, id: number, status: "accepted" | "rejected") {
  const row = db
    .update(registryChanges)
    .set({ status })
    .where(and(eq(registryChanges.id, id), eq(registryChanges.status, "proposed")))
    .returning()
    .get();
  if (!row) throw new Error(`registry change ${id} is not awaiting review`);
  logEvent(db, null, `registry_change_${status}`, "human", { changeId: id, directoryId: row.directoryId });
  return row;
}

export function reviewProductApproval(db: Db, id: number, status: "approved" | "rejected") {
  const row = db.update(productApprovals).set({ status, resolvedAt: Date.now() })
    .where(and(eq(productApprovals.id, id), eq(productApprovals.status, "pending"))).returning().get();
  if (!row) throw new Error(`product approval ${id} is not pending`);
  logEvent(db, null, `product_approval_${status}`, "human", { approvalId: row.id, productId: row.productId, action: row.action });
  return row;
}

export function addTodo(db: Db, todo: { productId?: string; jobId?: string; message: string; url?: string }) {
  const row = db.insert(todos).values(todo).returning().get();
  logEvent(db, todo.jobId ?? null, "todo_added", null, { todo: row.id, message: todo.message });
  return row;
}

export function closeTodo(db: Db, id: number) {
  const row = db.update(todos).set({ status: "done" }).where(and(eq(todos.id, id), eq(todos.status, "open"))).returning().get();
  if (!row) throw new Error(`todo ${id} is not open`);
  logEvent(db, row.jobId, "todo_done", "human", { todo: id });
  return row;
}
