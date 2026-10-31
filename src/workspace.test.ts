import { expect, test } from "bun:test";
import { pricingMismatch, pricingModel } from "./workspace";

test("pricing model: explicit, read from the notes, or unknown", () => {
  expect(pricingModel({ pricing: { free_plan: true, model: "one_time" } })).toBe("one_time");
  expect(pricingModel({ pricing: { free_plan: true, notes: "Free plan. Pro $9/mo, yearly saves 10%." } })).toBe("subscription");
  expect(pricingModel({ pricing: { free_plan: false, notes: "Pay once, lifetime updates." } })).toBe("one_time");
  expect(pricingModel({ pricing: { free_plan: true } })).toBeUndefined();
});

test("a one-time-purchase directory excludes subscriptions; unknown pricing never excludes", () => {
  const sub = { pricing: { free_plan: true, notes: "Hobby $4/mo" } };
  expect(pricingMismatch(sub, ["one-time-purchase"])).toMatch(/only lists one-time products/);
  expect(pricingMismatch(sub, ["saas", "tools"])).toBeNull();
  expect(pricingMismatch({ pricing: { free_plan: true, model: "one_time" } }, ["one-time-purchase"])).toBeNull();
  expect(pricingMismatch({ pricing: { free_plan: true } }, ["one-time-purchase"])).toBeNull();
});
