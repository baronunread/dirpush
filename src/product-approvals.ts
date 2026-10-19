import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { productApprovals } from "./db/schema";

export function requestProductApproval(db: Db, input: { productId: string; action: string; message: string }) {
  const existing = db.select().from(productApprovals)
    .where(and(eq(productApprovals.productId, input.productId), eq(productApprovals.action, input.action), inArray(productApprovals.status, ["pending", "approved"])))
    .orderBy(desc(productApprovals.id)).get();
  if (existing) return existing;
  return db.insert(productApprovals).values({ ...input, status: "pending" }).returning().get();
}

export function resolveProductApproval(db: Db, id: number, status: "approved" | "rejected") {
  const row = db.update(productApprovals).set({ status, resolvedAt: Date.now() })
    .where(and(eq(productApprovals.id, id), eq(productApprovals.status, "pending"))).returning().get();
  if (!row) throw new Error(`product approval ${id} is not pending`);
  return row;
}

export function approvedProductAction(db: Db, productId: string, action: string) {
  return db.select().from(productApprovals)
    .where(and(eq(productApprovals.productId, productId), eq(productApprovals.action, action), eq(productApprovals.status, "approved")))
    .orderBy(desc(productApprovals.id)).get();
}

export function consumeProductApproval(db: Db, id: number) {
  const row = db.update(productApprovals).set({ status: "used", resolvedAt: Date.now() })
    .where(and(eq(productApprovals.id, id), eq(productApprovals.status, "approved"))).returning().get();
  if (!row) throw new Error(`product approval ${id} is not approved`);
  return row;
}
