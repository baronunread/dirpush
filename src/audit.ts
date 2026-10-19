/**
 * Measures what a listing is actually worth, without AI: the rel attribute on outbound product links of real
 * listing pages, whether those pages are indexable, and which bot check guards the submit form.
 * Every verdict carries the page it was measured on.
 */
import { locs } from "./listings";
import { normalizeUrl, type Directory } from "./registry";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
export type Rel = "dofollow" | "nofollow" | "ugc" | "sponsored" | "mixed" | "unknown";
export type LinkAudit = {
  rel: Rel;
  method: "own_listing" | "sample_listing" | "platform_rule" | "none";
  evidence: string | null; // the listing page the rel was read on
  samples: number; // listing pages that had outbound product links
  noindex: boolean | null; // listing page tells search engines not to index it
  claimed: "dofollow" | "nofollow" | null; // what the directory's own text says
  bot_check: "recaptcha" | "turnstile" | "hcaptcha" | "math" | "none" | "unknown";
  checked_at: string;
};

async function get(url: string, timeout = 15000) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml" }, signal: AbortSignal.timeout(timeout) });
    const ct = r.headers.get("content-type") ?? "";
    const body = r.ok && /html|xml|text/.test(ct) ? (await r.text()).slice(0, 2_000_000) : (await r.body?.cancel(), "");
    return { status: r.status, url: r.url, body, robots: r.headers.get("x-robots-tag") ?? "" };
  } catch {
    return { status: 0, url, body: "", robots: "" };
  }
}

// Hosts that are never "the product's website" on a listing page.
const NOISE = /(^|\.)(twitter|x|facebook|linkedin|instagram|youtube|youtu|tiktok|pinterest|reddit|discord|t|telegram|medium|google|googletagmanager|googleapis|gstatic|doubleclick|apple|microsoft|cloudflare|gravatar|wp|wordpress|w3|schema|ahrefs|semrush|producthunt|github|gitlab|vercel|netlify|stripe|paypal|buymeacoffee|ko-fi|patreon|substack|beehiiv|mailchimp|typeform|tally|notion|calendly|cal|crisp|intercom|hotjar|plausible|umami|fonts|jsdelivr|unpkg|cdnjs)\.[a-z.]+$/;

/** rel of each outbound link on a page, keyed by host; nofollow wins over ugc/sponsored when combined. */
export function outboundRels(html: string, pageHost: string) {
  const out: { host: string; href: string; rel: Exclude<Rel, "mixed" | "unknown">; visit: boolean }[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]{0,600}?)<\/a>/gi)) {
    const attrs = m[1]!;
    const label = m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href || !/^https?:\/\//i.test(href)) continue;
    let host: string;
    try { host = new URL(href).hostname.toLowerCase().replace(/^www\./, ""); } catch { continue; }
    if (host === pageHost || host.endsWith(`.${pageHost}`) || pageHost.endsWith(`.${host}`) || NOISE.test(host)) continue;
    const rel = (/\brel\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "").toLowerCase();
    // The listing's "go to the product" link: visit/website wording, or a ref/utm parameter naming the directory.
    const visit = /\b(visit|website|try|get started|go to|open|homepage|view site|official)\b/i.test(label) || /visit|website|outbound|external-link/i.test(attrs) || /[?&](ref|utm_source|via|source)=/i.test(href);
    out.push({ host, href, visit, rel: /nofollow/.test(rel) ? "nofollow" : /sponsored/.test(rel) ? "sponsored" : /ugc/.test(rel) ? "ugc" : "dofollow" });
  }
  return out;
}

export const isNoindex = (html: string, header: string) =>
  /noindex/i.test(header) || /<meta[^>]+name=["'](robots|googlebot)["'][^>]+content=["'][^"']*noindex/i.test(html) || /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["'](robots|googlebot)["']/i.test(html);

export function botCheck(html: string): LinkAudit["bot_check"] {
  if (!html) return "unknown";
  if (/challenges\.cloudflare\.com\/turnstile|cf-turnstile/i.test(html)) return "turnstile";
  if (/hcaptcha\.com|h-captcha/i.test(html)) return "hcaptcha";
  if (/google\.com\/recaptcha|recaptcha\/api|g-recaptcha|grecaptcha/i.test(html)) return "recaptcha";
  if (/what is \d+\s*[+\-x×*]\s*\d+|anti-?spam (question|check)|solve.{0,20}(sum|math)/i.test(html)) return "math";
  return "none";
}

/** What the directory says about its links, from the registry's own notes and conditions. */
export function claimedRel(text: string): LinkAudit["claimed"] {
  const t = text.toLowerCase();
  const no = /no-?follow/.test(t), dof = /do-?follow/.test(t);
  if (dof && !no) return "dofollow";
  if (no && !dof) return "nofollow";
  if (dof && no) return /free[^.]{0,60}no-?follow|no-?follow[^.]{0,40}free/.test(t) ? "nofollow" : "dofollow";
  return null;
}

// Paths that look like a single product's page on a directory.
const PRODUCT_PATH = /\/(tools?|products?|p|startups?|listings?|apps?|software|items?|launch(es)?|projects?|ai|saas|companies|company|directory|site|sites|s)\/[^/?#]{2,}\/?$/i;

async function sampleListings(site: string, max = 4) {
  const origin = new URL(site).origin;
  const robots = (await get(`${origin}/robots.txt`, 8000)).body;
  const queue = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]!);
  if (!queue.length) queue.push(`${origin}/sitemap.xml`);
  const found: string[] = [];
  for (let i = 0; i < queue.length && i < 6 && found.length < 40; i++) {
    const xml = (await get(queue[i]!, 12000)).body;
    const urls = locs(xml);
    if (/<sitemapindex/i.test(xml)) {
      // Prefer child sitemaps that sound like products.
      queue.push(...urls.sort((a, b) => Number(/tool|product|startup|listing|app|item|launch|project/i.test(b)) - Number(/tool|product|startup|listing|app|item|launch|project/i.test(a))));
    } else found.push(...urls.filter((u) => PRODUCT_PATH.test(new URL(u, origin).pathname)));
  }
  // Spread the picks across the list: newest and oldest listings can differ.
  const step = Math.max(1, Math.floor(found.length / max));
  return [...new Set(found.filter((_, i) => i % step === 0))].slice(0, max);
}

const tally = (rels: Rel[]): Rel => {
  const kinds = new Set(rels);
  if (!kinds.size) return "unknown";
  if (kinds.size === 1) return rels[0]!;
  // A page with both is usually "dofollow for paid/featured, nofollow for the rest": call it mixed.
  return "mixed";
};

export async function auditDirectory(d: Directory, ownListings: { url: string; productHost: string }[], playbook = ""): Promise<LinkAudit> {
  const today = new Date().toISOString().slice(0, 10);
  const site = normalizeUrl(d.website).domain;
  const claimed = claimedRel([d.cost.notes ?? "", ...d.submission.conditions, playbook].join(" "));
  const submit = d.submission_url ? await get(d.submission_url) : null;
  const base = { claimed, bot_check: submit ? botCheck(submit.body) : ("unknown" as const), checked_at: today };

  // GitHub renders every user-content link with rel="nofollow".
  if (/^github\.com$|\.github\.io$/.test(site) && /github\.com/.test(d.website))
    return { ...base, rel: "nofollow", method: "platform_rule", evidence: d.website, samples: 0, noindex: false };

  // 1. Our own live listings: the exact link we got.
  for (const own of ownListings) {
    const page = await get(own.url);
    const links = outboundRels(page.body, site).filter((l) => l.host === own.productHost || l.host.endsWith(`.${own.productHost}`));
    // The URL stays on the submission: the shared registry never names a product.
    if (links.length) return { ...base, rel: tally(links.map((l) => l.rel)), method: "own_listing", evidence: null, samples: 1, noindex: isNoindex(page.body, page.robots) };
  }

  // 2. Other products' listing pages from the sitemap: the dominant rel on outbound product links.
  const rels: Rel[] = [];
  let evidence: string | null = null, noindex: boolean | null = null, samples = 0;
  for (const url of await sampleListings(d.website)) {
    const page = await get(url);
    // Only pages with a visit-style link to one external product count as listings.
    const links = outboundRels(page.body, site).filter((l) => l.visit);
    const hosts = new Set(links.map((l) => l.host));
    if (!links.length || hosts.size > 3) continue; // none, or a page of many products (a category page)
    const counts = new Map<string, number>();
    for (const l of links) counts.set(l.host, (counts.get(l.host) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
    rels.push(tally(links.filter((l) => l.host === top).map((l) => l.rel)));
    evidence ??= url;
    noindex ??= isNoindex(page.body, page.robots);
    samples++;
  }
  return { ...base, rel: tally(rels), method: samples ? "sample_listing" : "none", evidence, samples, noindex };
}

const NOT_LISTING = /^(c|cat|category|categories|tag|tags|topics?|collections?|directories|blog|posts?|news|articles?|guides?|alternatives?|compare|vs|best|top|page|search|login|log-in|signin|sign-in|signup|sign-up|register|account|dashboard|pricing|plans|about|contact|submit|add|faq|help|docs|terms|privacy|legal|cookies?|sitemap|rss|feed|advertise|sponsor|newsletter|api|users?|u|profile|makers?|authors?|en|de|fr|es|it)$/i;

// ---- browser pass: real Chrome via agent-browser, for pages a plain fetch can't read -------------------------

type Anchor = { href: string; rel: string; text: string; cls: string };
type Rendered = { finalUrl: string; anchors: Anchor[]; robots: string; challenge: boolean };

/** Renders a page in a throwaway, logged-out browser session and returns its links. Read-only. */
export function renderAnchors(url: string, session: string): Rendered | null {
  const ab = (...args: string[]) => Bun.spawnSync(["agent-browser", "--session", session, ...args], { stderr: "pipe", timeout: 60_000 });
  if (ab("open", url).exitCode) return null;
  ab("wait", "2500");
  const script = `JSON.stringify({ finalUrl: location.href,
    robots: (document.querySelector('meta[name=robots]') || {}).content || "",
    challenge: /just a moment|checking your browser|verify you are human|ci siamo quasi/i.test(document.title + " " + document.body.innerText.slice(0, 400)),
    anchors: [...document.querySelectorAll("a[href]")].slice(0, 600).map(a => ({ href: a.href, rel: a.rel || "", text: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 60), cls: String(a.className || "").slice(0, 120) })) })`;
  const out = ab("eval", script);
  try {
    let v = JSON.parse(out.stdout.toString());
    if (typeof v === "string") v = JSON.parse(v);
    return v as Rendered;
  } catch {
    return null;
  }
}

const relOfAttr = (rel: string): Exclude<Rel, "mixed" | "unknown"> =>
  /nofollow/i.test(rel) ? "nofollow" : /sponsored/i.test(rel) ? "sponsored" : /ugc/i.test(rel) ? "ugc" : "dofollow";
const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

/** Same rules as the fetch audit, applied to rendered pages: listing links from the homepage, visit links on each. */
export function auditDirectoryBrowser(d: Directory, session: string): { link: LinkAudit; note: string } {
  const today = new Date().toISOString().slice(0, 10);
  const site = normalizeUrl(d.website).domain;
  const base = { claimed: d.link?.claimed ?? null, bot_check: d.link?.bot_check ?? ("unknown" as const), checked_at: today };
  const home = renderAnchors(d.website, session);
  if (!home) return { link: { ...base, rel: "unknown", method: "none", evidence: null, samples: 0, noindex: null }, note: "homepage did not load" };
  if (home.challenge) return { link: { ...base, rel: "unknown", method: "none", evidence: null, samples: 0, noindex: null }, note: "bot challenge on the homepage" };
  // Listing pages are the biggest family of internal links sharing a path pattern. Which family is the listings
  // (vs categories or tags) is tested, not guessed: the right one has a single "visit" link per page.
  const groups = new Map<string, string[]>();
  for (const h of new Set(home.anchors.map((a) => a.href.split(/[?#]/)[0]!))) {
    const host = hostOf(h);
    if (!(host === site || host.endsWith(`.${site}`))) continue;
    const parts = new URL(h).pathname.split("/").filter(Boolean);
    if (!parts.length || parts.some((p) => NOT_LISTING.test(p))) continue;
    const key = `/${parts.slice(0, -1).join("/")}${parts.length > 1 ? "/" : ""}*`;
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  const families = [...groups].filter(([, urls]) => urls.length >= 5).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  const listings = families.flatMap(([, urls]) => urls);
  const rels: Rel[] = [];
  let evidence: string | null = null, noindex: boolean | null = null, samples = 0;
  const read = (url: string) => {
    const page = renderAnchors(url, session);
    if (!page || page.challenge) return false;
    const outbound = page.anchors.filter((a) => {
      const host = hostOf(a.href);
      return !!host && host !== site && !host.endsWith(`.${site}`) && !site.endsWith(`.${host}`) && !NOISE.test(host);
    });
    // A button that says Visit/Website is the listing's own link; ref-tagged links alone may be sidebar promos.
    const worded = outbound.filter((a) => /\b(visit|website|try|get started|go to|open|homepage|view site|official)\b/i.test(a.text) || /visit|website|outbound|external-link/i.test(a.cls));
    const links = worded.length ? worded : outbound.filter((a) => /[?&](ref|utm_source|via|source)=/i.test(a.href));
    const hosts = new Set(links.map((l) => hostOf(l.href)));
    if (!links.length || hosts.size > 3) return false;
    const counts = new Map<string, number>();
    for (const l of links) counts.set(hostOf(l.href), (counts.get(hostOf(l.href)) ?? 0) + 1);
    const top = [...counts].sort((x, y) => y[1] - x[1])[0]![0];
    rels.push(tally(links.filter((l) => hostOf(l.href) === top).map((l) => relOfAttr(l.rel))));
    evidence ??= page.finalUrl;
    noindex ??= /noindex/i.test(page.robots);
    samples++;
    return true;
  };
  for (const [, urls] of families) {
    const step = Math.max(1, Math.floor(urls.length / 4));
    const spread = urls.filter((_, i) => i % step === 0);
    if (!spread.slice(0, 2).map(read).some(Boolean)) continue; // not this family
    for (const url of spread.slice(2, 4)) read(url);
    break;
  }
  const note = !listings.length ? "no listing-like link families on the homepage" : samples ? `${samples} listing page${samples === 1 ? "" : "s"} read` : `tried ${families.length} link famil${families.length === 1 ? "y" : "ies"}, no page with a single visit link`;
  return { link: { ...base, rel: tally(rels), method: samples ? "sample_listing" : "none", evidence, samples, noindex }, note };
}
