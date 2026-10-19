import { expect, test } from "bun:test";
import { botCheck, claimedRel, isNoindex, outboundRels } from "./audit";
import { scrubber } from "./public";

test("outbound rels: own host and social links ignored; nofollow beats ugc/sponsored; visit links flagged", () => {
  const html = `
    <a href="https://dir.com/other">internal</a>
    <a href="https://twitter.com/maker">x</a>
    <a href="https://acme.io/?ref=dir" rel="noopener">Visit website</a>
    <a href="https://acme.io/pricing" rel="nofollow ugc">pricing</a>
    <a href="https://beta.dev" rel="sponsored">Beta</a>`;
  const links = outboundRels(html, "dir.com");
  expect(links.map((l) => [l.host, l.rel, l.visit])).toEqual([
    ["acme.io", "dofollow", true],
    ["acme.io", "nofollow", false],
    ["beta.dev", "sponsored", false],
  ]);
});

test("noindex from meta or header; bot checks by script signature; claims from text", () => {
  expect(isNoindex(`<meta name="robots" content="noindex, follow">`, "")).toBe(true);
  expect(isNoindex(`<meta content="noindex" name="googlebot">`, "")).toBe(true);
  expect(isNoindex("<p>hi</p>", "noindex")).toBe(true);
  expect(isNoindex(`<meta name="robots" content="index">`, "")).toBe(false);
  expect(botCheck(`<div class="cf-turnstile"></div>`)).toBe("turnstile");
  expect(botCheck(`<script src="https://www.google.com/recaptcha/api.js">`)).toBe("recaptcha");
  expect(botCheck("<label>What is 3 + 4?</label>")).toBe("math");
  expect(botCheck("<form></form>")).toBe("none");
  expect(botCheck("")).toBe("unknown");
  expect(claimedRel("Free listing with a dofollow backlink")).toBe("dofollow");
  expect(claimedRel("Free listings are nofollow; paid listings get dofollow")).toBe("nofollow");
  expect(claimedRel("Free listing")).toBeNull();
});

test("scrubber drops only sentences about a product or internal tooling", () => {
  const { text } = scrubber(["ledgerline"]);
  const original = "- Free tier queues for weeks. Acme is based in Italy, ledgerline too.\n- Pick the free plan.";
  expect(text(original)).toBe("- Free tier queues for weeks.\n- Pick the free plan.");
  expect(text("Saved the password in the vault. Uses Claude for search.")).toBe("Uses Claude for search.");
  const untouched = "Line one.\n\n- Line two.  \n";
  expect(text(untouched)).toBe(untouched); // nothing to remove: byte-identical
});
