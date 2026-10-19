/**
 * Builds the static dirpush.com site into dist/site: landing page, one page per directory, a filterable
 * index, and registry.json (what `launch registry updates` downloads). No server, no tracking, no web fonts.
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openDb, ROOT } from "../src/db";
import { DIRECTORY_KINDS } from "../src/directory-kinds";
import { scrubber } from "../src/public";
import { platformHosted, ratingDomain, ratingHistory } from "../src/ratings";
import { loadDirectories, type Directory } from "../src/registry";
import { buildRegistryFile } from "../src/registry-updates";
import { loadProduct, productIds } from "../src/workspace";

const OUT = process.argv[2] ?? join(ROOT, "dist/site");
const SITE = "https://dirpush.com";
const REPO = "https://github.com/baronunread/dirpush";

// Anything naming a workspace product or its owner stays out of public pages.
const words = (await Promise.all(productIds().map((id) => loadProduct(id).catch(() => null)))).flatMap((p) =>
  p ? [p.name, new URL(p.url).hostname.replace(/^www\./, "").split(".")[0]!, ...Object.values(p.social).flatMap((u) => (u ? new URL(u).pathname.split("/").filter(Boolean).slice(0, 1) : []))] : [],
);
const { text: scrub } = scrubber([...new Set(words)]);

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const plain = (s: string) => s.replace(/[—–]/g, "-"); // registry text sometimes carries dashes; the site uses hyphens

type RelKey = "dofollow" | "mixed" | "nofollow" | "ugc" | "sponsored" | "unknown";
const REL: Record<RelKey, { label: string; short: string; text: string }> = {
  dofollow: { label: "Dofollow", short: "Dofollow", text: "Search engines follow the link to your site. This is the one that can move your rankings." },
  mixed: { label: "Mixed", short: "Mixed", text: "Some listings get a followed link and some don't, usually paid or featured versus free." },
  nofollow: { label: "Nofollow", short: "Nofollow", text: "The link carries rel=\"nofollow\". You get visitors and a listing, but no ranking signal." },
  ugc: { label: "UGC", short: "UGC", text: "The link carries rel=\"ugc\", which search engines treat like nofollow." },
  sponsored: { label: "Sponsored", short: "Sponsored", text: "The link carries rel=\"sponsored\", which search engines treat like nofollow." },
  unknown: { label: "Not measured yet", short: "Unmeasured", text: "No public listing page could be read reliably yet. It gets measured as soon as one can." },
};
const relOf = (d: Directory): RelKey => (d.link?.rel ?? "unknown") as RelKey;
// Shown instead of the generic "not measured" text when an attempt recorded why.
const WHY: Record<string, string> = {
  no_listings: "No public listing pages to read: products aren't shown on pages of their own.",
  no_outbound_link: "Listing pages exist, but they don't link to the product's site with a plain link we could read.",
  bot_wall: "Its pages sit behind a bot check, so they couldn't be read automatically.",
  login_required: "Listings are only visible after signing in.",
  site_down: "The site didn't load when we last checked. It may be down for good.",
};
const relText = (d: Directory) => (relOf(d) === "unknown" && d.link?.unmeasured ? WHY[d.link.unmeasured]! : REL[relOf(d)].text);
const COST: Record<string, { label: string; tone: string }> = {
  VERIFIED_FREE: { label: "Free", tone: "good" }, FREEMIUM: { label: "Free + paid", tone: "info" },
  CONDITIONAL_FREE: { label: "Free with conditions", tone: "warn" }, PAID: { label: "Paid", tone: "bad" },
};
const cost = (d: Directory) => COST[d.cost.classification] ?? { label: d.cost.classification, tone: "" };
const BOT: Record<string, string> = { recaptcha: "reCAPTCHA", turnstile: "Cloudflare Turnstile", hcaptcha: "hCaptcha", math: "Arithmetic question", none: "None", unknown: "Not checked" };
const kindLabel = (d: Directory) => (d.kind ? DIRECTORY_KINDS[d.kind] : "Directory");
const SIGNIN = /^(email|google|github|twitter|x|linkedin|facebook|apple|social|password|magic link|email magic link|github-oidc|dns|discord|microsoft|product hunt)$/i;
const signIn = (d: Directory) => {
  if (!d.authentication.required) return "No account";
  const methods = d.authentication.methods.filter((m) => SIGNIN.test(m.trim()));
  const NAMES: Record<string, string> = { github: "GitHub", "github-oidc": "GitHub OIDC", linkedin: "LinkedIn", x: "X", dns: "DNS record" };
  return methods.length ? methods.map((m) => NAMES[m.toLowerCase()] ?? m.replace(/^\w/, (c) => c.toUpperCase())).join(", ") : "Account required";
};
// Ahrefs Domain Rating per directory, latest reading (local DR history; see `launch dr`).
let drs = new Map<string, { measuredAt: number; rating: number }[]>();
const dr = (d: Directory) => (platformHosted(d.website) ? null : drs.get(ratingDomain(d.website))?.[0] ?? null);
const drMonth = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });
/** The sentence where a directory talks about its own links, for the claims-vs-measured cards. */
const claimSentence = (d: Directory) =>
  plain(scrub(d.cost.notes ?? ""))
    .split(/(?<=[.!?])\s+/)
    .find((s) => /do-?follow|no-?follow|backlink/i.test(s));

// Header/footer data, filled in once the registry is loaded (page() runs after that).
let dirCount = 0, dofollowCount = 0, registryDate = "", stripTiles = "";

type PageOpts = { script?: string; jsonld?: object[]; noindex?: boolean; ogType?: "website" | "article" };
/** JSON-LD inside <script>: escape "<" so no string in the data can close the tag. */
const ld = (o: object) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...o }).replace(/</g, "\\u003c")}</script>`;
const crumbs = (items: [string, string][]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${path}` })),
});

function page(title: string, description: string, path: string, body: string, opts: PageOpts = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${opts.noindex ? `<meta name="robots" content="noindex">` : `<meta name="robots" content="index, follow, max-image-preview:large">\n<link rel="canonical" href="${SITE}${path}">`}
<meta property="og:site_name" content="dirpush">
<meta property="og:type" content="${opts.ogType ?? "website"}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="dirpush: ${dirCount} startup directories, with the link type measured">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/json" href="/registry.json" title="dirpush registry">
${(opts.jsonld ?? []).map(ld).join("\n")}
<meta name="theme-color" content="#0c0d0b" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f6f6f3" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="nav">
  <div class="nav-bar">
    <a class="logo" href="/" aria-label="dirpush home"><span class="logo-mark" aria-hidden="true"></span>dirpush</a>
    <a class="nav-live" href="/directories/?rel=dofollow" title="Directories with a measured dofollow link"><span class="pulse" aria-hidden="true"></span>${dofollowCount} dofollow of ${dirCount}</a>
    <nav aria-label="Primary"><a href="/directories/">Directories</a><a href="/#how">How it works</a><a href="${REPO}">GitHub</a></nav>
    <button class="nav-cta" type="button" data-copy="npx dirpush init" aria-label="Copy install command: npx dirpush init"><code>npx dirpush init</code><span class="copy-label" aria-hidden="true"><span class="c1">Copy</span><span class="c2">Copied</span></span></button>
    <span class="nav-progress" aria-hidden="true"></span>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="shell foot-cta">
    <h2>Stop filling forms.<br><span>Start getting listed.</span></h2>
    ${install("big")}
  </div>
  <div class="foot-strip" aria-hidden="true">${stripTiles}</div>
  <div class="shell foot-grid">
    <div class="foot-about">
      <a class="logo" href="/"><span class="logo-mark" aria-hidden="true"></span>dirpush</a>
      <p>Free and open source. Your coding agent submits, your browser does the clicking, your computer keeps the records.</p>
    </div>
    <div><h3>Directories</h3><a href="/directories/">All ${dirCount}</a><a href="/directories/free-dofollow/">Free and dofollow</a><a href="/directories/launch-sites/">Launch sites</a><a href="/directories/ai-tools/">AI tools</a><a href="/directories/no-account/">No account needed</a></div>
    <div><h3>Data</h3><a href="/registry.json">registry.json</a><a href="/sitemap.xml">Sitemap</a><a href="${REPO}/issues/new?labels=new-directory&amp;title=New%20directory%3A%20">Submit a directory</a></div>
    <div><h3>Project</h3><a href="${REPO}">Source on GitHub</a><a href="/#how">How it works</a><a href="${REPO}/blob/main/LICENSE">License</a></div>
  </div>
  <div class="shell foot-meta"><span>Registry updated ${registryDate}</span><span>Link types measured on real listing pages. DR by Ahrefs.</span></div>
  <div class="foot-word" aria-hidden="true">dirpush</div>
</footer>
<script>
// Reveal on scroll: motion marks what just came into view. Off under reduced motion (CSS).
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
// Copy-to-clipboard. The async API needs https or localhost; plain-http previews fall back to execCommand,
// and if both fail the command is selected so Cmd/Ctrl+C works. Every outcome says what happened.
const toast = document.createElement("div");
toast.className = "toast"; toast.setAttribute("role", "status"); document.body.append(toast);
let toastTimer;
function say(html) { toast.innerHTML = html; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2200); }
async function copyText(text) {
  try { if (navigator.clipboard && isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch {}
  const ta = Object.assign(document.createElement("textarea"), { value: text });
  ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
  document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch {}
  ta.remove(); return ok;
}
document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
  const text = b.dataset.copy;
  if (await copyText(text)) {
    b.classList.remove("copied"); void b.offsetWidth; b.classList.add("copied");
    say('<span class="toast-check" aria-hidden="true"></span>Copied <code>' + text + '</code>');
    setTimeout(() => b.classList.remove("copied"), 1800);
  } else {
    const code = b.querySelector("code"), r = document.createRange();
    r.selectNodeContents(code); getSelection().removeAllRanges(); getSelection().addRange(r);
    say("Selected. Press <kbd>" + (navigator.platform.includes("Mac") ? "⌘" : "Ctrl") + "</kbd> <kbd>C</kbd> to copy");
  }
}));
${opts.script ?? ""}
</script>
</body>
</html>
`;
}

const install = (cls = "") => `<button class="install ${cls}" type="button" data-copy="npx dirpush init" aria-label="Copy install command: npx dirpush init">
  <span class="prompt" aria-hidden="true">$</span><code>npx dirpush init</code><span class="copy-label" aria-hidden="true"><span class="c1">Copy</span><span class="c2">Copied</span></span>
</button>`;

const dirs = (await loadDirectories()).sort((a, b) => a.name.localeCompare(b.name));
drs = ratingHistory(openDb(), dirs.map((d) => d.website));
const drDates = dirs.map((d) => dr(d)?.measuredAt).filter((x): x is number => !!x);
const drAsOf = drDates.length ? drMonth(Math.max(...drDates)) : null;
const ORDER: RelKey[] = ["dofollow", "mixed", "nofollow", "ugc", "sponsored", "unknown"];
const byRel = Object.fromEntries(ORDER.map((r) => [r, dirs.filter((d) => relOf(d) === r)])) as Record<RelKey, Directory[]>;
const free = dirs.filter((d) => ["VERIFIED_FREE", "FREEMIUM"].includes(d.cost.classification));
const freeDofollow = dirs.filter((d) => d.cost.classification === "VERIFIED_FREE" && relOf(d) === "dofollow");
const mismatches = dirs.filter((d) => d.link?.claimed && ["dofollow", "nofollow"].includes(relOf(d)) && d.link.claimed !== relOf(d));
const noBot = dirs.filter((d) => d.link?.bot_check === "none" && !d.authentication.required);
// Topic pages: prerendered, crawlable versions of the most useful filters (the index filters with JS).
const isFree = (d: Directory) => ["VERIFIED_FREE", "FREEMIUM"].includes(d.cost.classification);
const aud = (d: Directory, a: string) => d.audience.some((x) => x.toLowerCase() === a);
const HUBS: { slug: string; h1: string; name: string; title: string; intro: string; pick: (d: Directory) => boolean }[] = [
  { slug: "free-dofollow", h1: "free dofollow directories", name: "Free and dofollow", title: "Free dofollow directories for startups and SaaS", intro: "Free to list on, and the link to your site is a followed link: measured on real listing pages, not taken from the directory's own claims.", pick: (d) => isFree(d) && relOf(d) === "dofollow" },
  { slug: "dofollow", h1: "dofollow directories", name: "Dofollow", title: "Dofollow directories: where the backlink actually counts", intro: "Every directory whose listing pages link to your product without nofollow, ugc or sponsored. Some of them charge for it; the cost column says which.", pick: (d) => relOf(d) === "dofollow" },
  { slug: "free", h1: "free directories", name: "Free", title: "Free startup and SaaS directories", intro: "Directories with a free way to get listed, including ones that also sell paid upgrades.", pick: isFree },
  { slug: "no-account", h1: "directories with no sign-up", name: "No account needed", title: "Directories you can submit to without an account", intro: "No sign-up, no email login: fill the form and submit.", pick: (d) => !d.authentication.required },
  { slug: "launch-sites", h1: "product launch sites", name: "Launch sites", title: "Product launch sites: Product Hunt alternatives", intro: "Launch boards with a daily or weekly ranking, where a new product gets a day in front of early adopters.", pick: (d) => d.kind === "launch_board" },
  { slug: "ai-tools", h1: "AI tool directories", name: "AI tools", title: "AI tool directories: where to list an AI product", intro: "Directories that list AI tools and AI-powered SaaS.", pick: (d) => aud(d, "ai-tools") },
  { slug: "saas", h1: "SaaS directories", name: "SaaS", title: "SaaS directories: where to list your SaaS", intro: "Directories that accept SaaS products, from big review sites to small curated lists.", pick: (d) => aud(d, "saas") },
  { slug: "developer-tools", h1: "developer tool directories", name: "Developer tools", title: "Developer tool directories: where to list a dev tool", intro: "Directories for developer tools, APIs and open-source projects.", pick: (d) => aud(d, "developer-tools") },
  { slug: "mcp-registries", h1: "MCP registries", name: "MCP registries", title: "MCP server registries and directories", intro: "Registries and directories where you can publish a Model Context Protocol server.", pick: (d) => d.kind === "mcp_registry" || aud(d, "mcp-servers") },
  { slug: "open-source", h1: "open-source directories", name: "Open source", title: "Directories for open-source projects", intro: "Directories that list open-source software and alternatives.", pick: (d) => aud(d, "open-source") },
];
for (const h of HUBS) if (dirs.some((d) => d.id === h.slug)) throw new Error(`topic page ${h.slug} collides with a directory id`);
const hubOf = (d: Directory) => HUBS.find((h) => ["launch-sites", "mcp-registries"].includes(h.slug) && h.pick(d)) ?? HUBS.find((h) => ["ai-tools", "developer-tools", "saas"].includes(h.slug) && h.pick(d));
const lastmod = (d: Directory) => [d.link?.checked_at, d.verification.checked_at].filter(Boolean).sort().at(-1)!;
dirCount = dirs.length;
dofollowCount = byRel.dofollow.length;
registryDate = new Date(Math.max(...dirs.map((d) => Date.parse(d.link?.checked_at ?? d.verification.checked_at) || 0))).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
// The footer strip: every directory once, in link-type order, as a thin band of color.
stripTiles = ORDER.flatMap((r) => byRel[r]).map((d) => `<i class="t-${relOf(d)}"></i>`).join("");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "directories"), { recursive: true });
cpSync(join(ROOT, "site"), OUT, { recursive: true });

// ---- landing ----------------------------------------------------------------
// The map: every directory is one tile, grouped by what its link is worth.
const tiles = ORDER.flatMap((r) => byRel[r]).map((d, i) => `<a class="tile t-${relOf(d)}" href="/directories/${d.id}/" style="--i:${i}" aria-label="${esc(`${d.name}: ${REL[relOf(d)].label}, ${cost(d).label}`)}" data-name="${esc(d.name)}" data-meta="${esc(`${REL[relOf(d)].short}, ${cost(d).label.toLowerCase()}`)}"></a>`).join("");
const legend = ORDER.filter((r) => r !== "ugc" && r !== "sponsored" && !(r === "unknown" && !byRel.unknown.length)).map((r) => {
  const n = r === "nofollow" ? byRel.nofollow.length + byRel.ugc.length + byRel.sponsored.length : byRel[r].length;
  return `<li><span class="sw t-${r}" aria-hidden="true"></span>${esc(r === "nofollow" ? "Nofollow" : REL[r].short)}<b>${n}</b></li>`;
}).join("");

// One tall card plus four fills the 3-column grid exactly.
const receipts = mismatches.slice(0, 5).map((d) => {
  const said = claimSentence(d);
  return `<a class="receipt" href="/directories/${d.id}/" data-reveal>
  <span class="receipt-name">${esc(d.name)}</span>
  <span class="receipt-host">${esc(host(d.website))}</span>
  <span class="receipt-row"><span>Advertises</span><b class="said">${esc(d.link!.claimed)}</b></span>
  <span class="receipt-row"><span>We measured</span><b class="got t-${relOf(d)}">${esc(relOf(d))}</b></span>
  ${said ? `<span class="receipt-quote">“${esc(said.length > 150 ? said.slice(0, 147).replace(/\s+\S*$/, "") + "…" : said)}”</span>` : ""}
</a>`;
}).join("");

const steps = [
  ["Describe", "Run <code>dirpush init</code>. It drafts every fact forms ask for: taglines at the right lengths, categories, pricing, what you replace. You confirm it once."],
  ["Submit", "Your agent picks the directories that fit, signs up and fills each form in a real browser on your machine. Every step is recorded, so a crashed session never submits twice."],
  ["Answer", "CAPTCHAs, email links and real decisions land in one list. Standing answers mean the same question is never asked twice."],
  ["Track", "Listings are re-checked until they go live, and your Domain Rating is charted so you can see what the launch did."],
];

// "Hand it to your agent": a tilted wall of agent and bot logos in three counter-scrolling rows. Each logo links
// to the agent. Monochrome logos are masks in the ink color and glow in their brand color on hover; logos that only
// read in their own colors ("img") render as images.
type Agent = { name: string; url: string; icon: string; brand?: string; img?: true };
const AG: Record<string, Agent> = {
  claude: { name: "Claude Code", url: "https://claude.com/product/claude-code", icon: "claudecode.svg", brand: "#D97757" },
  codex: { name: "Codex", url: "https://developers.openai.com/codex", icon: "openai.svg", brand: "#10A37F" },
  opencode: { name: "OpenCode", url: "https://opencode.ai", icon: "opencode.svg" },
  cursor: { name: "Cursor", url: "https://cursor.com", icon: "cursor.svg" },
  gemini: { name: "Gemini CLI", url: "https://geminicli.com", icon: "googlegemini.svg", brand: "#8E75B2" },
  copilot: { name: "GitHub Copilot CLI", url: "https://github.com/features/copilot/cli", icon: "githubcopilot.svg", brand: "#8957E5" },
  cline: { name: "Cline", url: "https://cline.bot", icon: "cline.svg" },
  windsurf: { name: "Windsurf", url: "https://windsurf.com", icon: "windsurf.svg", brand: "#58E5BB" },
  zed: { name: "Zed", url: "https://zed.dev", icon: "zedindustries.svg", brand: "#2E8AF6" },
  openclaw: { name: "OpenClaw", url: "https://openclaw.ai", icon: "openclaw.svg", brand: "#FF4D4D" },
  mausbot: { name: "MausBot", url: "https://www.openmausbot.com", icon: "mausbot.svg", brand: "#1084FE", img: true },
  goose: { name: "Goose", url: "https://block.github.io/goose/", icon: "goose.svg" },
  hermes: { name: "Hermes Agent", url: "https://hermes-agent.nousresearch.com", icon: "hermes.png", brand: "#B9A6FF", img: true },
  grok: { name: "Grok Bot", url: "https://x.ai/bot", icon: "grok.svg", brand: "#FFFFFF", img: true },
  dots: { name: "OpenAI dots", url: "https://chatgpt.com/features/dots/", icon: "openai.svg", brand: "#10A37F" },
  muse: { name: "Meta Muse", url: "https://ai.meta.com/muse/", icon: "muse.svg", brand: "#0866FF", img: true },
  cue: { name: "Manus Cue", url: "https://manus.im/blog/introducing-manus-2-0", icon: "manus.svg", brand: "#FFFFFF", img: true },
};
const ROWS = [
  ["claude", "openclaw", "codex", "grok", "opencode", "hermes"],
  ["muse", "cursor", "mausbot", "gemini", "dots", "goose"],
  ["copilot", "cue", "cline", "windsurf", "zed", "claude"],
];
const tile = (a: Agent, hidden: boolean) =>
  `<a class="mq-tile" href="${a.url}" rel="noopener" title="${esc(a.name)}"${hidden ? ` tabindex="-1" aria-hidden="true"` : ` aria-label="${esc(a.name)}"`}${a.brand ? ` style="--brand:${a.brand}"` : ""}>${
    a.img ? `<img src="/assets/agents/${a.icon}" alt="" width="56" height="56">` : `<span class="mq-mask" style="--icon:url(/assets/agents/${a.icon})"></span>`
  }</a>`;
// Each half repeats its row twice so it is wider than any screen; two identical halves loop at translateX(-50%).
const marqueeRow = (ids: string[], i: number) => {
  const half = (hidden: boolean) => `<div class="mq-group">${[...ids, ...ids].map((id, k) => tile(AG[id]!, hidden || k >= ids.length)).join("")}</div>`;
  return `<div class="mq-row r${i}"><div class="mq-track">${half(false)}${half(true)}</div></div>`;
};

await Bun.write(join(OUT, "index.html"), page(
  "dirpush: get listed on every directory that's worth it",
  `A free CLI and local dashboard. Your coding agent submits your product to ${dirs.length} verified directories from your own browser, and you see which links are actually dofollow.`,
  "/",
  `<section class="hero shell">
  <div class="hero-copy">
    <h1>Get listed everywhere <em>that counts.</em></h1>
    <p class="hero-sub">Your agent submits your product to ${dirs.length} verified directories, from a browser on your own computer. We measured which links are worth it.</p>
    <div class="hero-cta">${install("big")}<a class="link-arrow" href="/directories/">Browse the directories</a></div>
  </div>
  <figure class="map" aria-label="Map of ${dirs.length} directories by link type">
    <div class="map-grid">${tiles}</div>
    <figcaption>
      <ul class="legend">${legend}</ul>
      <p class="map-hover" aria-live="polite"><span class="mh-name">Hover a tile</span><span class="mh-meta">Each tile is a directory</span></p>
    </figcaption>
  </figure>
</section>

<section class="facts shell" aria-label="The registry in numbers">
  <div class="fact" data-reveal><b data-count="${dirs.length}">${dirs.length}</b><span>verified directories, each walked to its submit button</span></div>
  <div class="fact" data-reveal><b data-count="${free.length}">${free.length}</b><span>free to list on</span></div>
  <div class="fact accent" data-reveal><b data-count="${freeDofollow.length}">${freeDofollow.length}</b><span>free and measured dofollow</span></div>
  <div class="fact" data-reveal><b data-count="${mismatches.length}">${mismatches.length}</b><span>advertise one link and serve another</span></div>
</section>

<section class="truth shell" aria-labelledby="truth-h">
  <div class="truth-head" data-reveal>
    <h2 id="truth-h">Lists repeat what directories claim. <span class="dim">We read the page.</span></h2>
    <p>For every directory we open real listing pages and read the <code>rel</code> attribute on the link to the product. Here is where the claim and the page disagree.</p>
  </div>
  <div class="receipts">${receipts}</div>
</section>

<section class="how shell" id="how" aria-labelledby="how-h">
  <div class="how-side"><h2 id="how-h">You launch.<br>Your agent does the forms.</h2>${install()}</div>
  <ol class="how-steps">${steps.map(([t, b]) => `<li data-reveal><h3>${t}</h3><p>${b}</p></li>`).join("")}</ol>
</section>

<section class="agents shell" id="agents" aria-labelledby="agents-h">
  <div class="agents-head" data-reveal>
    <h2 id="agents-h">Hand it to your agent.</h2>
    <p>dirpush is a command-line tool and a skill file. Anything that can run a shell command can work the queue: the coding agent in your terminal, or a computer-use bot running on its own.</p>
  </div>
  <div class="wall" aria-label="Agents and bots that can run dirpush">
    <div class="wall-plane">${ROWS.map(marqueeRow).join("")}</div>
  </div>
  <p class="mq-note">Tested with Claude Code and Codex. Anything else that runs shell commands works the same way; stronger models fill forms more completely.</p>
  <div class="agents-foot" data-reveal>
    <p>The clicking happens in a separate Chrome profile on your computer, driven by <a href="https://github.com/vercel-labs/agent-browser">agent-browser</a>. Your everyday browser is never touched. CAPTCHAs, email links and sign-ins land in one list for you.</p>
    <button class="install prompt-copy" type="button" data-copy="Use dirpush to list my product on 20 free dofollow directories." aria-label="Copy an example request"><span class="prompt" aria-hidden="true">›</span><code>Use dirpush to list my product on 20 free dofollow directories.</code><span class="copy-label" aria-hidden="true"><span class="c1">Copy</span><span class="c2">Copied</span></span></button>
  </div>
</section>

<section class="shot-wrap" aria-label="The local dashboard">
  <div class="shell">
    <h2 class="shot-h" data-reveal>Everything stays on your computer.</h2>
    <p class="shot-sub" data-reveal>No account, no server, no telemetry. Product facts, passwords and history live in a local folder. The dashboard runs on localhost.</p>
  </div>
  <div class="shot shell" data-reveal><picture><source srcset="/assets/dashboard-dark.png" media="(prefers-color-scheme: dark)"><img src="/assets/dashboard.png" alt="The dirpush dashboard showing live listings, listings in review, what needs you, and Domain Rating over time" width="1440" height="1000" loading="lazy"></picture></div>
</section>

<section class="finder shell" aria-labelledby="finder-h">
  <h2 id="finder-h" data-reveal>Find a directory</h2>
  <form class="finder-form" action="/directories/" method="get" data-reveal>
    <label class="sr" for="finder-q">Search directories</label>
    <input id="finder-q" name="q" type="search" placeholder="Try “AI”, “MCP”, “Product Hunt”…" autocomplete="off">
    <button type="submit">Search</button>
  </form>
  <div class="quick" data-reveal>
    <a href="/directories/?cost=VERIFIED_FREE&amp;rel=dofollow">Free + dofollow <b>${freeDofollow.length}</b></a>
    <a href="/directories/?noacct=1">No account needed <b>${dirs.filter((d) => !d.authentication.required).length}</b></a>
    <a href="/directories/?kind=mcp_registry">MCP registries <b>${dirs.filter((d) => d.kind === "mcp_registry").length}</b></a>
    <a href="/directories/?kind=launch_board">Launch sites <b>${dirs.filter((d) => d.kind === "launch_board").length}</b></a>
    <a href="/directories/?noacct=1&amp;bot=none">No account, no bot check <b>${noBot.length}</b></a>
  </div>
</section>`,
  {
    jsonld: [
      { "@type": "WebSite", name: "dirpush", url: `${SITE}/` },
      {
        "@type": "SoftwareApplication",
        name: "dirpush",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "macOS, Linux, Windows",
        description: `A free, open-source CLI and local dashboard. Your coding agent submits your product to ${dirs.length} verified directories from your own browser.`,
        url: `${SITE}/`,
        downloadUrl: REPO,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
    script: `
// Map: name the tile under the cursor or focus.
const hn = document.querySelector(".mh-name"), hm = document.querySelector(".mh-meta");
const show = (t) => { hn.textContent = t.dataset.name; hm.textContent = t.dataset.meta; };
document.querySelectorAll(".tile").forEach((t) => { t.addEventListener("pointerenter", () => show(t)); t.addEventListener("focus", () => show(t)); });
// Count-up on the numbers when they scroll in.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const co = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; co.unobserve(e.target);
    const el = e.target, end = +el.dataset.count, t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach((el) => co.observe(el));
}`,
  },
));

// ---- directory index --------------------------------------------------------
const row = (d: Directory) => {
  const r = relOf(d);
  return `<tr data-q="${esc(`${d.name} ${host(d.website)} ${d.audience.join(" ")} ${kindLabel(d)}`.toLowerCase())}" data-cost="${d.cost.classification}" data-rel="${r}" data-kind="${d.kind ?? "listing"}" data-account="${d.authentication.required ? 1 : 0}" data-bot="${d.link?.bot_check ?? "unknown"}" data-name="${esc(d.name.toLowerCase())}" data-dr="${dr(d)?.rating ?? -1}" data-relorder="${ORDER.indexOf(r)}">
  <td class="c-name"><a href="/directories/${d.id}/"><span class="row-name">${esc(d.name)}</span><span class="row-sub">${esc(kindLabel(d))} · ${esc(host(d.website))}</span></a></td>
  <td><span class="rel t-${r}"><span class="rel-bar" aria-hidden="true"></span>${esc(REL[r].short)}</span></td>
  <td><span class="pill ${cost(d).tone}">${esc(cost(d).label)}</span></td>
  <td class="c-dim">${esc(signIn(d))}</td>
  <td class="c-dim">${esc(BOT[d.link?.bot_check ?? "unknown"])}</td>
  <td class="c-num">${dr(d) ? `<span class="dr-val">${Math.round(dr(d)!.rating)}</span>` : `<span class="dr-none">-</span>`}</td>
</tr>`;
};
const rows = dirs.map(row).join("\n");
const thead = (sortable: boolean) => {
  const th = (key: string, label: string, cls = "", title = "") => `<th${cls ? ` class="${cls}"` : ""}>${sortable ? `<button type="button" data-sort="${key}"${title ? ` title="${title}"` : ""}>${label}</button>` : label}</th>`;
  return `<thead><tr>${th("name", "Directory")}${th("relorder", "Link")}<th>Cost</th><th>Sign-in</th><th>Bot check</th>${th("dr", "DR", "c-num", "Ahrefs Domain Rating, 0 to 100")}</tr></thead>`;
};
const topicLinks = `<nav class="quick topics" aria-label="Directory lists">${HUBS.map((h) => `<a href="/directories/${h.slug}/">${esc(h.name)} <b>${dirs.filter(h.pick).length}</b></a>`).join("")}</nav>`;
// Filter menus: one compact button each, options as checkboxes with counts. Keeps the toolbar on one row.
const opt = (group: string, value: string, label: string, n: number) =>
  `<label class="opt"><input type="checkbox" data-group="${group}" value="${value}"><span>${esc(label)}</span><b>${n}</b></label>`;
const menu = (label: string, opts: string[]) =>
  `<details class="menu"><summary><span>${esc(label)}</span><b class="menu-n" hidden></b></summary><div class="menu-panel" role="group" aria-label="${esc(label)}">${opts.join("")}</div></details>`;
await Bun.write(join(OUT, "directories/index.html"), page(
  `${dirs.length} startup and SaaS directories, measured | dirpush`,
  `Every directory where you can list a startup, SaaS or developer tool, with cost, sign-in, bot checks and whether the link is dofollow, measured on real listing pages.`,
  "/directories/",
  `<section class="list-head shell">
  <h1><span class="count-big">${dirs.length}</span> directories, measured.</h1>
  <p class="hero-sub">Cost and form details come from walking each submit flow. Link type comes from reading real listing pages. Filter down to the ones worth your time.</p>
  ${topicLinks}
</section>
<section class="list shell">
  <span class="dock-sentinel" aria-hidden="true"></span>
  <div class="toolbar">
    <div class="search"><label class="sr" for="q">Search directories</label><input id="q" type="search" placeholder="Search ${dirs.length} directories" autocomplete="off"><kbd aria-hidden="true">/</kbd></div>
    <div class="menus">
      ${menu("Link", [opt("rel", "dofollow", "Dofollow", byRel.dofollow.length), opt("rel", "mixed", "Mixed", byRel.mixed.length), opt("rel", "nofollow", "Nofollow", byRel.nofollow.length + byRel.ugc.length + byRel.sponsored.length), opt("rel", "unknown", "Not measured", byRel.unknown.length)].filter((o) => !o.endsWith("<b>0</b></label>")))}
      ${menu("Cost", Object.entries(COST).map(([k, c]) => opt("cost", k, c.label, dirs.filter((d) => d.cost.classification === k).length)))}
      ${menu("Access", [opt("noacct", "1", "No account needed", dirs.filter((d) => !d.authentication.required).length), opt("bot", "none", "No bot check", dirs.filter((d) => d.link?.bot_check === "none").length)])}
      ${menu("Type", Object.entries(DIRECTORY_KINDS).map(([k, l]) => opt("kind", k, l, dirs.filter((d) => (d.kind ?? "listing") === k).length)).filter((o) => !o.endsWith("<b>0</b></label>")))}
    </div>
    <span id="count" class="count" aria-live="polite"></span>
    <button type="button" id="reset" class="reset" hidden>Clear</button>
  </div>
  <div class="table-wrap"><table>
    ${thead(true)}
    <tbody id="rows">${rows}</tbody>
  </table>
  <p id="empty" class="empty" hidden>Nothing matches. <button type="button" class="link-arrow" id="reset2">Clear the filters</button></p>
  </div>
  <p class="note">DR is <a href="https://ahrefs.com/">Ahrefs</a> Domain Rating (0 to 100, higher is stronger)${drAsOf ? `, measured ${drAsOf}` : ""}. Link types are re-measured monthly.</p>
</section>`,
  {
    jsonld: [
      crumbs([["dirpush", "/"], ["Directories", "/directories/"]]),
      {
        "@type": "Dataset",
        name: "dirpush directory registry",
        description: `${dirs.length} startup, SaaS and developer-tool directories with cost, sign-in, bot checks, submit-form fields and whether listing links are dofollow, measured on real listing pages.`,
        url: `${SITE}/directories/`,
        isAccessibleForFree: true,
        license: "https://creativecommons.org/licenses/by/4.0/",
        dateModified: dirs.map(lastmod).sort().at(-1),
        keywords: ["startup directories", "SaaS directories", "dofollow backlinks", "product launch sites"],
        creator: { "@type": "Organization", name: "dirpush", url: SITE },
        distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE}/registry.json` }],
      },
    ],
    script: `
const $ = (id) => document.getElementById(id);
const tbody = $("rows"), rows = [...tbody.rows];
const boxes = [...document.querySelectorAll(".opt input")];
const menus = [...document.querySelectorAll(".menu")];
const state = new URLSearchParams(location.search);
const sel = (g) => boxes.filter((b) => b.dataset.group === g && b.checked).map((b) => b.value);
for (const b of boxes) b.checked = (state.get(b.dataset.group) || "").split(",").includes(b.value);
$("q").value = state.get("q") || "";
let sortKey = state.get("sort") || "relorder", sortDir = state.get("sort") === "dr" ? -1 : 1;
function apply() {
  const q = $("q").value.trim().toLowerCase();
  const f = { rel: sel("rel"), cost: sel("cost"), noacct: sel("noacct"), bot: sel("bot"), kind: sel("kind") };
  let n = 0;
  for (const r of rows) {
    const d = r.dataset;
    const show = (!q || d.q.includes(q)) && (!f.kind.length || f.kind.includes(d.kind))
      && (!f.rel.length || f.rel.includes(d.rel) || (f.rel.includes("nofollow") && (d.rel === "ugc" || d.rel === "sponsored")))
      && (!f.cost.length || f.cost.includes(d.cost)) && (!f.noacct.length || d.account === "0") && (!f.bot.length || d.bot === "none");
    r.hidden = !show; if (show) n++;
  }
  for (const m of menus) {
    const k = m.querySelectorAll("input:checked").length, badge = m.querySelector(".menu-n");
    badge.hidden = !k; badge.textContent = k; m.classList.toggle("active", k > 0);
  }
  const filtered = q || Object.values(f).some((v) => v.length);
  $("count").textContent = n === rows.length ? rows.length + " directories" : n + " of " + rows.length;
  $("reset").hidden = !filtered;
  $("empty").hidden = n > 0;
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  for (const g in f) if (f[g].length) p.set(g, f[g].join(","));
  if (sortKey !== "relorder") p.set("sort", sortKey);
  history.replaceState(null, "", p.size ? "?" + p : location.pathname);
}
function sort() {
  const num = sortKey !== "name";
  rows.sort((a, b) => {
    const x = a.dataset[sortKey], y = b.dataset[sortKey];
    const c = num ? (+x - +y) : x.localeCompare(y);
    return (c || a.dataset.name.localeCompare(b.dataset.name)) * sortDir;
  });
  tbody.append(...rows);
  document.querySelectorAll("th button").forEach((b) => b.closest("th").setAttribute("aria-sort", b.dataset.sort === sortKey ? (sortDir > 0 ? "ascending" : "descending") : "none"));
}
boxes.forEach((b) => b.addEventListener("change", apply));
// Glass background only while docked under the header.
const bar = document.querySelector(".toolbar");
new IntersectionObserver(([e]) => bar.classList.toggle("stuck", !e.isIntersecting), { rootMargin: "-85px 0px 0px 0px" }).observe(document.querySelector(".dock-sentinel"));
// One menu open at a time; click outside or Escape closes it.
menus.forEach((m) => m.addEventListener("toggle", () => { if (m.open) menus.forEach((o) => o !== m && (o.open = false)); }));
document.addEventListener("click", (e) => { if (!e.target.closest(".menu")) menus.forEach((m) => (m.open = false)); });
addEventListener("keydown", (e) => { if (e.key === "Escape") menus.forEach((m) => { if (m.open) { m.open = false; m.querySelector("summary").focus(); } }); });
$("q").addEventListener("input", apply);
document.querySelectorAll("th button").forEach((b) => b.addEventListener("click", () => { sortDir = sortKey === b.dataset.sort ? -sortDir : (b.dataset.sort === "dr" ? -1 : 1); sortKey = b.dataset.sort; sort(); apply(); }));
const reset = () => { boxes.forEach((b) => (b.checked = false)); $("q").value = ""; apply(); $("q").focus(); };
$("reset").addEventListener("click", reset); $("reset2").addEventListener("click", reset);
addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement !== $("q")) { e.preventDefault(); $("q").focus(); } });
sort(); apply();`,
  },
));

// ---- one page per directory -------------------------------------------------
for (const d of dirs) {
  const r = relOf(d);
  const notes = plain(scrub(d.cost.notes ?? ""));
  const conditions = d.submission.conditions.map((c) => plain(scrub(c))).filter(Boolean);
  const fields = d.submission.fields;
  const evidence = d.link?.evidence && d.link.method !== "own_listing" ? d.link.evidence : null; // never point at our own listings
  const how = d.link ? { own_listing: "on a real listing", sample_listing: `on ${d.link.samples} listing page${d.link.samples === 1 ? "" : "s"}`, platform_rule: "by platform rule: GitHub adds nofollow to every user link", none: "" }[d.link.method] : "";
  const mismatch = d.link?.claimed && d.link.claimed !== r && !["unknown", "mixed"].includes(r);
  const similar = dirs
    .filter((x) => x.id !== d.id && (x.kind ?? "listing") === (d.kind ?? "listing") && relOf(x) === "dofollow" && ["VERIFIED_FREE", "FREEMIUM"].includes(x.cost.classification))
    .sort((a, b) => (dr(b)?.rating ?? -1) - (dr(a)?.rating ?? -1))
    .slice(0, 4);
  const hub = hubOf(d);
  const path = `/directories/${d.id}/`;
  const answers: [string, string][] = [
    [`Is the ${d.name} link dofollow?`, r === "unknown" ? `Not measured yet. ${relText(d)}` : `${REL[r].label}. ${REL[r].text}${how ? ` Measured ${how}.` : ""}`],
    [`Is ${d.name} free?`, `${cost(d).label}.${notes ? ` ${notes.split(/(?<=[.!?])\s+/)[0]}` : ""}`],
    [`Do you need an account to submit?`, d.authentication.required ? `Yes: ${signIn(d)}.` : "No, the form works without signing up."],
    ...(d.review_time ? [[`How long does ${d.name} take to review?`, plain(d.review_time)] as [string, string]] : []),
  ];
  await Bun.write(join(OUT, "directories", d.id, "index.html"), page(
    `Submit to ${d.name}: ${r === "unknown" ? "link not measured" : `${REL[r].short.toLowerCase()} link`}, ${cost(d).label.toLowerCase()} | dirpush`,
    `${d.name} (${host(d.website)}): ${cost(d).label}, ${REL[r].label.toLowerCase()} link, ${signIn(d).toLowerCase()}. What the submit form asks for and what to watch out for.`,
    `/directories/${d.id}/`,
    `<article class="dir shell">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/directories/">Directories</a>${hub ? `<a href="/directories/${hub.slug}/">${esc(hub.name)}</a>` : ""}<span aria-current="page">${esc(d.name)}</span></nav>
  <header class="dir-head">
    <div>
      <h1>${esc(d.name)}</h1>
      <p class="dir-host"><a href="${esc(d.website)}" rel="nofollow noopener">${esc(host(d.website))}</a><span>${esc(kindLabel(d))}</span></p>
    </div>
    ${d.submission_url ? `<a class="btn" href="${esc(d.submission_url)}" rel="nofollow noopener">Open submit page</a>` : ""}
  </header>

  <div class="dir-grid">
    <section class="verdict t-${r}" aria-labelledby="v-h">
      <p class="verdict-k" id="v-h">Link</p>
      <p class="verdict-v">${esc(REL[r].label)}</p>
      <p class="verdict-t">${esc(relText(d))}</p>
      ${how ? `<p class="verdict-m">Measured ${esc(how)}, ${esc(d.link!.checked_at)}.${evidence ? ` <a href="${esc(evidence)}" rel="nofollow noopener">See the page</a>` : ""}</p>` : ""}
    </section>
    <dl class="glance">
      <div><dt>Cost</dt><dd><span class="pill ${cost(d).tone}">${esc(cost(d).label)}</span></dd></div>
      <div><dt>Sign-in</dt><dd>${esc(signIn(d))}</dd></div>
      <div><dt>Bot check</dt><dd>${esc(BOT[d.link?.bot_check ?? "unknown"])}</dd></div>
      <div><dt>Indexed</dt><dd>${d.link?.noindex === true ? "No, listing pages are noindex" : d.link?.noindex === false ? "Yes" : "Not checked"}</dd></div>
      ${d.review_time ? `<div><dt>Review time</dt><dd>${esc(plain(d.review_time))}</dd></div>` : ""}
      <div><dt>Domain Rating</dt><dd>${dr(d) ? `<b class="dr-big">${Math.round(dr(d)!.rating)}</b> <span class="dim">Ahrefs, ${esc(drMonth(dr(d)!.measuredAt))}</span>` : "Not measured"}</dd></div>
      <div><dt>Verified</dt><dd>${esc(d.verification.checked_at)}</dd></div>
    </dl>
  </div>

  ${mismatch ? `<aside class="callout"><b>Claim and page disagree.</b> ${
    d.link!.claimed === "dofollow" && d.cost.classification !== "VERIFIED_FREE"
      ? `${esc(d.name)} advertises dofollow links, but the free listings we read are ${esc(REL[r].label.toLowerCase())}. Followed links most likely need their badge on your site or a paid plan.`
      : `${esc(d.name)} says its links are ${esc(d.link!.claimed)}; the listing pages we read are ${esc(REL[r].label.toLowerCase())}.`
  }</aside>` : ""}
  ${d.link?.noindex ? `<aside class="callout"><b>Listing pages are hidden from search.</b> They carry a <code>noindex</code> tag, so the link passes no ranking value even if it's followed.</aside>` : ""}

  ${notes ? `<section class="dir-sec"><h2>What it costs</h2><p class="prose">${esc(notes)}</p></section>` : ""}
  ${fields.length ? `<section class="dir-sec"><h2>What the form asks for</h2><ul class="fields">${fields.map((f) => `<li class="${f.required ? "req" : ""}"><span>${esc(f.name.replaceAll("_", " "))}</span>${f.limit ? `<em>max ${f.limit}</em>` : ""}${f.required ? `<i>required</i>` : ""}</li>`).join("")}</ul></section>` : ""}
  ${conditions.length ? `<section class="dir-sec"><h2>Watch out for</h2><ul class="conds">${conditions.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></section>` : ""}

  <section class="dir-sec"><h2>Quick answers</h2><div class="qa">${answers.map(([q, a]) => `<div><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join("")}</div></section>

  <section class="agent">
    <div><h2>Let your agent do this one</h2><p>dirpush knows this form, its gates and its quirks. Install it and ask your coding agent to list your product here.</p></div>
    ${install()}
  </section>

  ${similar.length ? `<section class="dir-sec"><h2>Free and dofollow, same kind of site</h2><div class="similar">${similar.map((s) => `<a href="/directories/${s.id}/"><b>${esc(s.name)}</b><span>${esc(host(s.website))}${dr(s) ? ` · DR ${Math.round(dr(s)!.rating)}` : ""}</span></a>`).join("")}</div></section>` : ""}
</article>`,
    {
      ogType: "article",
      jsonld: [
        crumbs([["Directories", "/directories/"], ...(hub ? [[hub.name, `/directories/${hub.slug}/`] as [string, string]] : []), [d.name, path]]),
        { "@type": "WebPage", name: d.name, url: `${SITE}${path}`, dateModified: lastmod(d), about: { "@type": "WebSite", name: d.name, url: d.website } },
      ],
    },
  ));
}

// ---- topic pages ------------------------------------------------------------
for (const h of HUBS) {
  const list = dirs.filter(h.pick).sort((a, b) => ORDER.indexOf(relOf(a)) - ORDER.indexOf(relOf(b)) || (dr(b)?.rating ?? -1) - (dr(a)?.rating ?? -1) || a.name.localeCompare(b.name));
  const path = `/directories/${h.slug}/`;
  const dof = list.filter((d) => relOf(d) === "dofollow").length, fr = list.filter(isFree).length;
  await Bun.write(join(OUT, "directories", h.slug, "index.html"), page(
    `${h.title} (${list.length}) | dirpush`,
    `${list.length} ${h.name.toLowerCase()} directories: ${dof} measured dofollow, ${fr} free to list on. Cost, sign-in, bot checks and Domain Rating for each.`,
    path,
    `<section class="list-head shell">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/directories/">Directories</a><span aria-current="page">${esc(h.name)}</span></nav>
  <h1><span class="count-big">${list.length}</span> ${esc(h.h1)}.</h1>
  <p class="hero-sub">${esc(h.intro)}${dof < list.length || fr < list.length ? ` ${dof} measured dofollow, ${fr} free.` : ""}</p>
  ${topicLinks.replace(`href="${path}"`, `href="${path}" aria-current="page"`)}
</section>
<section class="list shell">
  <div class="table-wrap"><table>${thead(false)}<tbody>${list.map(row).join("\n")}</tbody></table></div>
  <p class="note">Sorted by link type, then <a href="https://ahrefs.com/">Ahrefs</a> Domain Rating. <a href="/directories/">Filter all ${dirs.length} directories</a> by cost, sign-in and bot check.</p>
</section>`,
    {
      jsonld: [
        crumbs([["Directories", "/directories/"], [h.name, path]]),
        { "@type": "ItemList", name: h.title, numberOfItems: list.length, itemListElement: list.map((d, i) => ({ "@type": "ListItem", position: i + 1, name: d.name, url: `${SITE}/directories/${d.id}/` })) },
      ],
    },
  ));
}

// ---- registry.json, scrubbed of anything product- or operator-specific -------
const registry = await buildRegistryFile();
for (const entry of registry.directories) {
  entry.playbook = entry.playbook ? scrub(entry.playbook) || null : null;
  entry.directory.cost.notes = entry.directory.cost.notes ? scrub(entry.directory.cost.notes) : undefined;
  entry.directory.submission.conditions = entry.directory.submission.conditions.map(scrub).filter(Boolean);
  entry.directory.verification.sources = entry.directory.verification.sources.filter((s) => !words.some((w) => s.toLowerCase().includes(w.toLowerCase())));
  if (entry.directory.link?.method === "own_listing") entry.directory.link.evidence = null;
}
// Served by the static-assets Worker for unknown paths (wrangler.jsonc: not_found_handling "404-page").
await Bun.write(join(OUT, "404.html"), page(
  "Not found | dirpush",
  "This page does not exist.",
  "/404",
  `<section class="list-head shell">
  <h1>Not here.</h1>
  <p class="hero-sub">That page doesn't exist. The directory may have been renamed or removed from the registry.</p>
  <p><a class="link-arrow" href="/directories/">Browse all ${dirs.length} directories</a></p>
</section>`,
  { noindex: true },
));
await Bun.write(join(OUT, "registry.json"), JSON.stringify(registry) + "\n");
const newest = dirs.map(lastmod).sort().at(-1)!;
const urls: [string, string][] = [["/", newest], ["/directories/", newest], ...HUBS.map((h) => [`/directories/${h.slug}/`, newest] as [string, string]), ...dirs.map((d) => [`/directories/${d.id}/`, lastmod(d)] as [string, string])];
await Bun.write(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, m]) => `<url><loc>${SITE}${p}</loc><lastmod>${m}</lastmod></url>`).join("\n")}\n</urlset>\n`);
// For AI search and agents: what the site is and where the machine-readable data lives.
await Bun.write(join(OUT, "llms.txt"), `# dirpush

> ${dirs.length} startup, SaaS and developer-tool directories, with cost, sign-in, bot checks and whether the listing link is dofollow, measured on real listing pages. Plus a free CLI that lets a coding agent submit a product to them from the user's own browser.

- [All directories](${SITE}/directories/): filterable table
- [registry.json](${SITE}/registry.json): the full registry, machine-readable, updated monthly
- Install: \`npx dirpush init\`

## Lists
${HUBS.map((h) => `- [${h.title}](${SITE}/directories/${h.slug}/): ${dirs.filter(h.pick).length} directories`).join("\n")}
`);
await Bun.write(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${dirs.length + HUBS.length + 2} pages and registry.json (${dirs.length} directories) into ${OUT}`);
