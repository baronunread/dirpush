import { expect, test } from "bun:test";
import { isLive, locs, matchesSlug } from "./listings";

test("slug matching", () => {
  const slugs = ["ledgerline", "ledgerline-com"];
  expect(matchesSlug("https://publishyoursaas.com/listing/ledgerline-com", slugs)).toBe(true);
  expect(matchesSlug("https://x.io/startup/ledgerline", slugs)).toBe(true);
  expect(matchesSlug("https://x.io/tools/ledgerline-1234/", slugs)).toBe(true);
  expect(matchesSlug("https://x.io/startup/ledgerlinex", slugs)).toBe(false);
  expect(matchesSlug("https://x.io/", slugs)).toBe(false);
});

test("sitemap locs and liveness", () => {
  expect(locs("<urlset><url><loc> https://a.io/x?a=1&amp;b=2 </loc></url><url><loc>https://a.io/y</loc></url></urlset>")).toEqual(["https://a.io/x?a=1&b=2", "https://a.io/y"]);
  expect(isLive('<a href="https://ledgerline.com/?utm_source=x">', "ledgerline.com")).toBe(true);
  expect(isLive("ledgerline.com — the approval team will review it", "ledgerline.com")).toBe(false);
  expect(isLive("Tool Not Found", "ledgerline.com")).toBe(false);
});
