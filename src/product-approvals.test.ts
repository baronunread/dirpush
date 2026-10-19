import { expect, test } from "bun:test";
import { openDb } from "./db";
import { approvedProductAction, consumeProductApproval, requestProductApproval } from "./product-approvals";
import { reviewProductApproval } from "./review";

test("product asset approval is independent of directory submissions and single-use", () => {
  const db = openDb(":memory:");
  const input = {
    productId: "ledgerline",
    action: "assets.capture_new",
    message: "Approve new marketing screenshot captures for ledgerline.",
  };
  const request = requestProductApproval(db, input);
  expect(request.status).toBe("pending");
  expect(requestProductApproval(db, input).id).toBe(request.id); // don't duplicate an open request
  expect(approvedProductAction(db, "ledgerline", "assets.capture_new")).toBeUndefined();

  expect(reviewProductApproval(db, request.id, "approved").status).toBe("approved");
  expect(approvedProductAction(db, "ledgerline", "assets.capture_new")?.id).toBe(request.id);
  expect(consumeProductApproval(db, request.id).status).toBe("used");
  expect(approvedProductAction(db, "ledgerline", "assets.capture_new")).toBeUndefined();

  const next = requestProductApproval(db, input);
  expect(next.id).not.toBe(request.id);
  expect(next.status).toBe("pending");
});
