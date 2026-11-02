import { expect, test } from "bun:test";
import { fitMismatch, pricingMismatch, pricingModel } from "./workspace";

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

test("region and beta-only directories exclude products that don't fit; unstated facts never exclude", () => {
  const it = { pricing: { free_plan: true }, country: "Italy", status: "launched" as const };
  expect(fitMismatch(it, ["australia", "startups"])).toMatch(/only lists Australian products and this one is from Italy/);
  expect(fitMismatch(it, ["eu"])).toBeNull();
  expect(fitMismatch({ ...it, country: "Kenya" }, ["africa"])).toBeNull();
  expect(fitMismatch(it, ["africa"])).toMatch(/African/);
  expect(fitMismatch(it, ["beta", "saas"])).toMatch(/in beta and this one is launched/);
  expect(fitMismatch({ ...it, status: "beta" }, ["beta"])).toBeNull();
  expect(fitMismatch({ pricing: { free_plan: true } }, ["australia", "beta"])).toBeNull();
});
