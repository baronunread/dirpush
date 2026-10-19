#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { HOME, openDb, PKG } from "./db";
import { events, galleries, jobs, productApprovals, registryChanges, todos, type GalleryItem } from "./db/schema";
import * as J from "./jobs";
import { checkListing, closeBrowser, findInSitemap } from "./listings";
import { Directory, loadDirectories, loadDirectory, writeDirectory, normalizeUrl } from "./registry";
import { addTodo, closeTodo, reviewGallery, reviewRegistryChange } from "./review";
import { consumeProductApproval, requestProductApproval } from "./product-approvals";
import { importHosted, readHostedExport } from "./import-hosted";
import { addManualSubmission } from "./manual";
import { present } from "./views";
import { auditDirectory, auditDirectoryBrowser } from "./audit";
import { browserStatus, newPassword, startBrowser, stopBrowser, vaultLogin } from "./browser";
import { accountsFor, backfillAccounts, listAccounts } from "./accounts";
import { detect, loadCapabilities, saveCapabilities } from "./capabilities";
import { ratingDomain, ratingHistory, refreshRatings } from "./ratings";
import { fetchRegistryFile, registrySource, registryUpdates } from "./registry-updates";
import { loadIdentity, loadPermissions, loadProduct, permission, productIds, resolveProductId, PRODUCTS, utm, WORKSPACE } from "./workspace";

// Browser helpers run as shell scripts with their arguments untouched (`dirpush ab snapshot -i`), against your launch home.
const SCRIPTS: Record<string, string> = { ab: "ab", "google-login": "google-login", "show-browser": "show-browser", "check-listings": "check-listings" };
const first = process.argv[2];
if (first && SCRIPTS[first]) {
  const p = Bun.spawn([join(PKG, "scripts", SCRIPTS[first]), ...process.argv.slice(3)], { stdio: ["inherit", "inherit", "inherit"], env: { ...process.env, LAUNCH_HOME: HOME } });
  process.exit(await p.exited);
}
if (first === "--version" || first === "-v") {
  console.log((await Bun.file(join(PKG, "package.json")).json()).version);
  process.exit(0);
}
if (first === "--help" || first === "-h") process.argv.splice(2, 1, "help");

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    worker: { type: "string" },
    kind: { type: "string" },
    status: { type: "string" },
    limit: { type: "string" },
    claim: { type: "boolean" },
    skill: { type: "boolean" },
    free: { type: "boolean" },
    unsubmitted: { type: "boolean" },
    badge: { type: "boolean" },
    retryable: { type: "boolean" },
    reason: { type: "string" },
    type: { type: "string" },
    message: { type: "string" },
    note: { type: "string" },
    input: { type: "string" },
    result: { type: "string" },
    data: { type: "string" },
    outcome: { type: "string" },
    "listing-url": { type: "string" },
    evidence: { type: "string" },
    provider: { type: "string" },
    port: { type: "string" },
    host: { type: "string" }, // serve: bind address (default 127.0.0.1)
    product: { type: "string" },
    all: { type: "boolean" },
    source: { type: "string" },
    job: { type: "string" },
    url: { type: "string" },
    username: { type: "string" },
    rel: { type: "string" }, // registry set-link
    samples: { type: "string" },
    noindex: { type: "string" },
    "bot-check": { type: "string" },
    why: { type: "string" }, // registry set-link --rel unknown --why <reason>
    timeout: { type: "string" },
    force: { type: "boolean" },
    browser: { type: "boolean" }, // registry audit: real Chrome for pages a fetch can't read
    apply: { type: "boolean" },
    full: { type: "boolean" }, // raw rows instead of compact views
    pretty: { type: "boolean" }, // indented JSON (default when stdout is a terminal)
    json: { type: "boolean" }, // accepted for readability; output is always JSON
  },
});

const [cmd, sub, ...args] = positionals;
const db = openDb();
const limit = Number(flags.limit ?? 20);

// Agents read stdout: compact rows and unindented JSON unless --full / --pretty (or a human at a terminal).
const out = (v: unknown) => {
  const shown = flags.full ? v : present(v);
  console.log(flags.pretty || process.stdout.isTTY ? JSON.stringify(shown, null, 2) : JSON.stringify(shown));
};
/** Side notes for the agent (why a list is empty or cut short) go to stderr, so stdout stays plain JSON. */
const note = (msg: string) => console.error(`note: ${msg}`);
function worker() {
  const w = flags.worker ?? process.env.LAUNCH_WORKER;
  if (!w) throw new Error("pass --worker <name> or set LAUNCH_WORKER (e.g. claude-code, codex)");
  return w;
}
function arg(i: number, name: string) {
  const v = args[i];
  if (!v) throw new Error(`missing <${name}>`);
  return v;
}
/** --input/--result/--data: inline JSON, a .json/.yaml file path, or '-' for stdin. */
async function readInput(v: string | undefined, name = "input"): Promise<any> {
  if (!v) throw new Error(`missing --${name}`);
  if (v.trim().startsWith("{") || v.trim().startsWith("[")) return JSON.parse(v);
  const text = v === "-" ? await Bun.stdin.text() : await Bun.file(v).text();
  return v.endsWith(".yaml") || v.endsWith(".yml") ? Bun.YAML.parse(text) : JSON.parse(text);
}


const BROAD_AUDIENCES = new Set(["startups", "saas", "products", "software", "indie-makers", "side-projects", "business-software", "tools"]);
const GOOGLE_IDENTITY_SCOPES = new Set([
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile",
]);
// Google's exact consent lines for openid/email/profile (Italian and English UI). Whole-line matches only,
// so "see your contacts' email addresses" or anything Drive/Gmail never passes.
const GOOGLE_IDENTITY_TEXT = [
  /^Visualizzare l'indirizzo email principale del tuo Account Google\.?$/,
  /^See your primary Google Account email address\.?$/,
  /^Associarti alle tue informazioni personali su Google\.?$/,
  /^Associate you with your personal info on Google\.?$/,
  /^Visualizzare le tue informazioni personali, incluse quelle che hai reso (pubblicamente disponibili|disponibili pubblicamente)\.?$/,
  /^See your personal info, including any personal info you've made publicly available\.?$/,
  // Newer "Accedi a <site>" layout: each item is a value line (the identity's name/email) plus one of these labels.
  /^Nome e immagine del profilo$/, /^Indirizzo email$/, /^Name and profile picture$/, /^Email address$/,
];
/** Block types where a worker is waiting on the human right now (dashboard shows them first, desktop ping). */
const URGENT = new Set(["google_login", "captcha"]);
/** Scopes of a Google sign-in URL; throws unless they are identity-only. */
function googleScopes(url: string) {
  const u = new URL(url);
  if (u.hostname !== "accounts.google.com") throw new Error(`not a Google sign-in page: ${u.hostname}`);
  // "Sign in with Google" button/One Tap (Google Identity Services) can only return an ID token.
  if (u.pathname.startsWith("/gsi/")) return { ok: true, scopes: ["openid", "email", "profile"], via: "google-identity-services" };
  // The scope can sit in the query or inside an encoded continue/redirect parameter.
  const raw = decodeURIComponent(decodeURIComponent(u.search));
  const scopes = [...new Set([...raw.matchAll(/[?&]scope=([^&]+)/g)].flatMap((m) => m[1]!.replaceAll("+", " ").split(/[ ,]+/)).filter(Boolean))];
  if (!scopes.length) throw new Error("no scope in the URL: can't verify what is requested; block for the human");
  const extra = scopes.filter((sc) => !GOOGLE_IDENTITY_SCOPES.has(sc));
  if (extra.length) throw new Error(`asks for more than identity: ${extra.join(", ")}. Do not continue; block for the human`);
  return { ok: true, scopes };
}

const SubmittableCost = ["VERIFIED_FREE", "FREEMIUM", "CONDITIONAL_FREE"];

/** Installs the skill for every agent on this computer. A git checkout already has it in .agents/skills (--skill installs it anyway). */
function installSkill() {
  if (HOME === PKG && !flags.skill) return { installed: [], note: "git checkout: the skill is in .agents/skills/dirpush; pass --skill to install it for every agent" };
  const src = join(PKG, ".agents/skills/dirpush");
  const to = [join(homedir(), ".claude/skills/dirpush"), join(homedir(), ".agents/skills/dirpush")];
  for (const d of to) {
    rmSync(d, { recursive: true, force: true });
    cpSync(src, d, { recursive: true });
  }
  return { installed: to };
}

const commands: Record<string, (() => Promise<unknown> | unknown) | undefined> = {
  /** Sets up your launch home and the agent skill; with a product id, also scaffolds that product. Safe to re-run. */
  async "init"() {
    const id = sub;
    if (id && !/^[a-z0-9-]+$/.test(id)) throw new Error("usage: dirpush init [product-id]  (a lowercase slug, e.g. acme)");
    const created: string[] = [];
    const copy = (from: string, to: string) => {
      if (existsSync(to)) return;
      cpSync(join(PKG, "examples/workspace", from), to);
      created.push(to.slice(HOME.length + 1));
    };
    mkdirSync(WORKSPACE, { recursive: true });
    copy("identity.yaml", join(WORKSPACE, "identity.yaml"));
    copy("permissions.yaml", join(WORKSPACE, "permissions.yaml"));
    if (id) {
      for (const d of ["assets/brand", "assets/screenshots"]) mkdirSync(join(PRODUCTS, id, d), { recursive: true });
      copy("product.yaml", join(PRODUCTS, id, "product.yaml"));
    }
    const skill = installSkill();
    const caps = await loadCapabilities();
    const detected = detect();
    return {
      home: HOME, product: id ?? null, created, skill, detected,
      next: [
        ...(id ? [`fill in ${join(PRODUCTS, id, "product.yaml")}, then check it with 'dirpush product show --product ${id}'`]
          : productIds().length ? [] : ["add your product: 'dirpush init <product-id>' (a lowercase slug, e.g. acme)"]),
        ...(detected.agentBrowser ? [] : ["install agent-browser, which agents use to drive Chrome: 'npm i -g agent-browser'"]),
        ...(caps ? [] : [`open your agent and say "set up dirpush": it checks which tools it has (email, browser) and records them`]),
        `then ask your agent to "continue my launch"; 'dirpush serve' opens the dashboard`,
      ],
    };
  },

  "products list": async () => Promise.all(productIds().map(async (id) => {
    const p = await loadProduct(id).catch((e: Error) => ({ id, error: e.message }));
    return "error" in p ? p : { id, name: p.name, url: p.url };
  })),
  "product show": () => loadProduct(flags.product),
  "permission": async () => {
    let pid: string | undefined;
    try {
      pid = resolveProductId(flags.product);
    } catch {} // no single product: shared permissions.yaml applies
    return { action: sub, product: pid ?? null, mode: await permission(sub ?? "", pid) };
  },
  "utm": async () => ({ url: utm((await loadProduct(flags.product)).url, sub ?? "") }),

  // ---- work protocol --------------------------------------------------------
  "work next"() {
    const job = J.next(db, "submission");
    if (!job) return { job: null, message: "no claimable work" };
    return { job: flags.claim ? J.claim(db, job.id, worker()) : job };
  },
  "work list": () =>
    db.select().from(jobs).where(and(eq(jobs.kind, "submission"), flags.status ? eq(jobs.status, flags.status as any) : undefined)).orderBy(desc(jobs.updatedAt)).limit(limit).all(),
  "work show": () => {
    const job = db.select().from(jobs).where(eq(jobs.id, arg(0, "job"))).get();
    if (!job) throw new Error(`no such job: ${arg(0, "job")}`);
    const evs = J.jobEvents(db, job.id);
    if (evs.length > 20 && !flags.all) note(`showing the last 20 of ${evs.length} events; --all for every one`);
    return { job, events: flags.all ? evs : evs.slice(-20) };
  },
  "work claim": () => J.claim(db, arg(0, "job"), worker()),
  "work heartbeat": () => J.heartbeat(db, arg(0, "job"), worker()),
  "work checkpoint": async () => J.checkpoint(db, arg(0, "job"), worker(), arg(1, "step"), flags.data ? await readInput(flags.data, "data") : {}),
  async "work begin-submit"() {
    // Enforced here, not just in the playbook: a "confirm" directory needs the human's Approve first.
    const id = arg(0, "job");
    const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!job) throw new Error(`no such job: ${id}`);
    const perms = await loadPermissions(job.productId);
    const mode = perms.directories?.[job.subject] ?? perms.submissions?.submit ?? "confirm";
    if (mode === "never") throw new Error(`permissions say never submit to ${job.subject}: work fail ${id} --reason "submission not permitted"`);
    if (mode === "confirm" && !J.approved(db, id))
      throw new Error(`${job.subject} needs the human's approval before submitting: work block ${id} --type permission --message "Ready to submit to ${job.subject} — approve in the dashboard"`);
    return J.beginSubmit(db, id, worker());
  },
  "work submitted": () => J.recordSubmitted(db, arg(0, "job"), worker(), (flags.outcome ?? "submitted") as J.Outcome, flags["listing-url"]),
  "work not-submitted": () => J.recordNotSubmitted(db, arg(0, "job"), worker(), flags.evidence ?? ""),
  "work block"() {
    const job = J.block(db, arg(0, "job"), worker(), flags.type ?? "user", flags.message ?? "");
    // Urgent blocks hold a worker that is waiting right now: ping the human's desktop (macOS; no-op elsewhere).
    if (URGENT.has(flags.type ?? "") && process.platform === "darwin" && !process.env.LAUNCH_QUIET)
      Bun.spawn(["osascript", "-e", `display notification ${JSON.stringify(`${job.subject}: open the dashboard (Needs you)`)} with title "dirpush: needs you" sound name "Glass"`]);
    return job;
  },
  "work unblock": () => J.unblock(db, arg(0, "job"), flags.note),
  "work fail": () => J.fail(db, arg(0, "job"), worker(), flags.reason ?? "unspecified", !!flags.retryable),
  "work release": () => J.release(db, arg(0, "job"), worker()),
  "work requeue": () => J.requeue(db, arg(0, "job")),
  /** For "already listed" discoveries; real submits go through begin-submit/submitted. */
  async "work complete"() {
    const id = arg(0, "job");
    const raw = await readInput(flags.result, "result");
    J.complete(db, id, worker(), raw.outcome ?? "live", raw);
    return raw.listing_url ? J.setOutcome(db, id, raw.outcome ?? "live", raw.listing_url) : db.select().from(jobs).where(eq(jobs.id, id)).get();
  },

  // ---- registry -------------------------------------------------------------
  /** Measure link rel, noindex and bot check for every directory (or the ids given). No AI; safe for cron. */
  async "registry audit"() {
    if (flags.browser) {
      // One directory at a time in a throwaway logged-out session; only directories still unmeasured unless ids are given.
      let todo = (await loadDirectories()).filter((d) => (args.length ? args.includes(d.id) : (d.link?.rel ?? "unknown") === "unknown"));
      if (flags.limit) todo = todo.slice(0, limit);
      const session = `audit-${process.pid}`, out: { id: string; rel: string; note: string }[] = [];
      try {
        for (const d of todo) {
          const { link, note: why } = auditDirectoryBrowser(d, session);
          if (link.rel !== "unknown" || !d.link) await writeDirectory({ ...d, link }, undefined);
          out.push({ id: d.id, rel: link.rel, note: why });
          if (!process.env.LAUNCH_QUIET) console.error(`${out.length}/${todo.length} ${d.id}: ${link.rel} (${why})`);
        }
      } finally {
        closeBrowser(session);
      }
      return { audited: out.length, measured: out.filter((r) => r.rel !== "unknown").length, results: out };
    }
    let dirs = await loadDirectories();
    if (args.length) dirs = dirs.filter((d) => args.includes(d.id));
    if (flags.limit) dirs = dirs.slice(0, limit);
    // Our own listings are the best evidence: the exact link a directory gave us.
    const hosts = new Map((await Promise.all(productIds().map((id) => loadProduct(id).then((p) => [id, new URL(p.url).hostname.replace(/^www\./, "")] as const).catch(() => null)))).filter((x) => x !== null));
    const own = new Map<string, { url: string; productHost: string }[]>();
    for (const j of db.select().from(jobs).where(and(eq(jobs.kind, "submission"), eq(jobs.status, "done"))).all())
      if (j.listingUrl && hosts.has(j.productId) && /^https?:/.test(j.listingUrl)) own.set(j.subject, [...(own.get(j.subject) ?? []), { url: j.listingUrl, productHost: hosts.get(j.productId)! }]);
    const results: { id: string; rel: string; method: string; claimed: string | null; bot_check: string; noindex: boolean | null }[] = [];
    let next = 0;
    await Promise.all(Array.from({ length: 12 }, async () => {
      while (next < dirs.length) {
        const d = dirs[next++]!;
        const { playbook } = await loadDirectory(d.id);
        const link = await auditDirectory(d, own.get(d.id) ?? [], playbook ?? "");
        await writeDirectory({ ...d, link }, undefined);
        results.push({ id: d.id, rel: link.rel, method: link.method, claimed: link.claimed, bot_check: link.bot_check, noindex: link.noindex });
        if (!process.env.LAUNCH_QUIET) console.error(`${results.length}/${dirs.length} ${d.id}: ${link.rel} (${link.method})`);
      }
    }));
    const count = (k: keyof (typeof results)[number]) => results.reduce((m, r) => ((m[String(r[k])] = (m[String(r[k])] ?? 0) + 1), m), {} as Record<string, number>);
    return { audited: results.length, rel: count("rel"), method: count("method"), bot_check: count("bot_check"), noindex: count("noindex"),
      claimMismatch: results.filter((r) => r.claimed && r.rel !== "unknown" && r.rel !== "mixed" && r.claimed !== r.rel).map((r) => `${r.id}: claims ${r.claimed}, measured ${r.rel}`) };
  },
  /** Record a link measurement an agent made by hand on real listing pages (when `registry audit` couldn't). */
  "registry set-link": async () => {
    const { directory: d } = await loadDirectory(arg(0, "directory-id"));
    const rel = flags.rel as NonNullable<Directory["link"]>["rel"] | undefined;
    if (!rel || !["dofollow", "nofollow", "ugc", "sponsored", "mixed", "unknown"].includes(rel)) throw new Error("--rel dofollow|nofollow|ugc|sponsored|mixed|unknown");
    const evidence = flags.evidence?.trim() || null;
    const base = (h: string) => h.replace(/^www\./, "").split(".").slice(-2).join(".");
    if (rel !== "unknown") {
      if (!evidence) throw new Error("--evidence <listing page URL> is required: the page whose outbound product link you read");
      if (base(new URL(evidence).hostname) !== base(new URL(d.website).hostname)) throw new Error(`evidence ${evidence} is not on ${new URL(d.website).hostname}`);
    }
    const bot = flags["bot-check"] as NonNullable<Directory["link"]>["bot_check"] | undefined;
    // Measured on one of our own listings: keep the result, never publish the URL (the public site must not name our products).
    const ours = evidence && (await Promise.all(productIds().map((id) => loadProduct(id).catch(() => null)))).some((p) =>
      p && [p.id, p.name, new URL(p.url).hostname.replace(/^www\./, "").split(".")[0]!].some((w) => w && evidence.toLowerCase().includes(w.toLowerCase())));
    if (ours) note("evidence is one of our own listings: recorded as own_listing, URL not stored");
    const link = {
      rel, method: (rel === "unknown" ? "none" : ours ? "own_listing" : "sample_listing") as NonNullable<Directory["link"]>["method"], evidence: ours ? null : evidence,
      samples: Number(flags.samples ?? (rel === "unknown" ? 0 : 1)),
      noindex: flags.noindex === "yes" ? true : flags.noindex === "no" ? false : (d.link?.noindex ?? null),
      claimed: d.link?.claimed ?? null,
      bot_check: bot ?? d.link?.bot_check ?? "unknown",
      checked_at: new Date().toISOString().slice(0, 10),
      ...(rel === "unknown" && flags.why ? { unmeasured: flags.why as NonNullable<NonNullable<Directory["link"]>["unmeasured"]> } : {}),
    };
    if (rel === "unknown" && !flags.why) throw new Error("--rel unknown needs --why no_listings|no_outbound_link|bot_wall|login_required|site_down");
    await writeDirectory({ ...d, link }, undefined);
    return { id: d.id, link };
  },
  "registry list": async () => {
    const dirs = (await loadDirectories()).filter((d) => (!flags.free || SubmittableCost.includes(d.cost.classification)) && (!flags.kind || d.kind === flags.kind));
    const cap = flags.limit ? limit : 50;
    if (dirs.length > cap) note(`showing ${cap} of ${dirs.length}; narrow with --kind/--free or raise --limit. For one directory: registry show <id>`);
    return dirs.slice(0, cap);
  },
  "registry show": () => loadDirectory(arg(0, "directory-id")),
  "registry report-change": async () => {
    const id = arg(0, "directory-id");
    await loadDirectory(id);
    const observation = await readInput(flags.input);
    // Agents fix the YAML themselves; this is the record, not a request for review.
    const row = db.insert(registryChanges).values({ directoryId: id, observation, status: "accepted" }).returning().get();
    J.logEvent(db, null, "registry_change_accepted", flags.worker ?? process.env.LAUNCH_WORKER ?? null, { directoryId: id, changeId: row.id });
    return row;
  },
  "registry accept": () => reviewRegistryChange(db, Number(arg(0, "change-id")), "accepted"),
  "registry reject": () => reviewRegistryChange(db, Number(arg(0, "change-id")), "rejected"),
  "registry changes": () => db.select().from(registryChanges).where(eq(registryChanges.status, (flags.status ?? "proposed") as any)).all(),

  // ---- submissions ----------------------------------------------------------
  "directories recommend": async () => {
    const product = await loadProduct(flags.product);
    const done = new Set(
      db.select({ s: jobs.subject }).from(jobs).where(and(eq(jobs.kind, "submission"), eq(jobs.productId, product.id))).all().map((r) => r.s),
    );
    let dirs = await loadDirectories();
    if (flags.kind) dirs = dirs.filter((d) => d.kind === flags.kind);
    if (flags.free || (await permission("money.spend", product.id)) === "never") dirs = dirs.filter((d) => SubmittableCost.includes(d.cost.classification));
    if (!flags.badge && (await permission("external.add_backlink", product.id)) === "never") dirs = dirs.filter((d) => d.cost.classification !== "CONDITIONAL_FREE");
    if (flags.unsubmitted) dirs = dirs.filter((d) => !done.has(d.id));
    // Launch boards, campaigns, lead-gen sites and human-only directories need a decision; show them only with --all.
    if (!flags.all) dirs = dirs.filter((d) => (!d.kind || d.kind === "listing") && !d.human_only);
    // Exact category match scores 2; general startup/software audiences fit any product (1).
    // Niche directories with no overlap (e.g. AI-only for a non-AI product) are hidden unless --all.
    const fit = (d: Directory) =>
      d.audience.reduce((n, a) => n + (product.categories.includes(a) ? 2 : BROAD_AUDIENCES.has(a) ? 1 : 0), 0);
    const picked = dirs
      .map((d) => ({ ...d, fit: fit(d) }))
      .filter((d) => flags.all || d.fit > 0)
      .sort((a, b) => b.fit - a.fit)
      .slice(0, limit);
    if (!picked.length && !flags.all) note("no plain listings left that fit; launch sites, MCP registries and other kinds need --all (and a human decision for launch boards)");
    return picked;
  },
  "submissions enqueue": async () => {
    const product = await loadProduct(flags.product);
    const ids = args;
    if (!ids.length) throw new Error("missing <directory-id...>");
    const noBadges = (await permission("external.add_backlink", product.id)) === "never";
    for (const id of ids) {
      const { directory } = await loadDirectory(id); // must exist in the verified registry
      if (noBadges && directory.cost.classification === "CONDITIONAL_FREE")
        throw new Error(`${id} is free only with a badge/backlink, and permissions say external.add_backlink: never`);
    }
    return ids.map((id) => J.enqueue(db, "submission", id, product.id));
  },
  "submissions list": () => {
    const rows = db.select().from(jobs).where(and(
      eq(jobs.kind, "submission"),
      flags.product ? eq(jobs.productId, flags.product) : undefined,
      flags.outcome ? eq(jobs.outcome, flags.outcome) : undefined,
      flags.status ? eq(jobs.status, flags.status as any) : undefined,
    )).orderBy(desc(jobs.updatedAt)).all();
    const cap = flags.limit ? limit : 50;
    if (rows.length > cap) note(`showing the ${cap} most recent of ${rows.length}; filter with --outcome live|pending|rejected or --status blocked|failed|queued, or raise --limit`);
    return rows.slice(0, cap);
  },
  /** No AI: fetch each pending listing's expected URL (registry listing_url_pattern); live if the page mentions the product's domain. Safe for cron. */
  async "submissions check"() {
    // `submissions check [job]`: one job (any outcome) or every pending one.
    const pending = args[0]
      ? db.select().from(jobs).where(eq(jobs.id, args[0])).all()
      : db.select().from(jobs).where(and(eq(jobs.kind, "submission"), eq(jobs.status, "done"), eq(jobs.outcome, "pending"))).all();
    const results = [];
    const session = `check-${process.pid}`;
    try {
      for (const job of pending) {
        const { directory } = await loadDirectory(job.subject).catch(() => ({ directory: undefined }));
        const product = await loadProduct(job.productId).catch(() => undefined);
        if (!product) {
          results.push({ job: job.id, directory: job.subject, result: "can't check: product not found" });
          continue;
        }
        const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const host = new URL(product.url).hostname.replace(/^www\./, "");
        const slugs = [...new Set([toSlug(product.name), toSlug(host)])]; // "ledgerline", "ledgerline-com"
        // The worker's recorded listing URL wins; else the directory's pattern; else its sitemap.
        const url = job.listingUrl ?? directory?.listing_url_pattern?.replace("{slug}", slugs[0]!)
          ?? (directory && await findInSitemap(directory.website, slugs).catch(() => undefined));
        if (!url) {
          results.push({ job: job.id, directory: job.subject, result: "can't check automatically (no listing URL, not in sitemap)" });
          continue;
        }
        const { live, how } = await checkListing(url, host, slugs, session);
        if (live) J.setOutcome(db, job.id, "live", url);
        results.push({ job: job.id, directory: job.subject, url, result: live ? `live (${how})` : how });
      }
    } finally {
      closeBrowser(session);
    }
    return results;
  },
  /** A listing you made yourself: `submissions add <directory-id|URL> [--listing-url u] [--outcome pending|live|rejected]`. */
  "submissions add": async () => {
    const product = await loadProduct(flags.product);
    const outcome = (flags.outcome ?? (flags["listing-url"] ? "live" : "pending")) as J.Outcome;
    return addManualSubmission(db, product.id, arg(0, "directory-id or URL"), outcome, flags["listing-url"]);
  },
  "submissions outcome": () => {
    const outcome = arg(1, "outcome");
    if (!["pending", "live", "rejected", "needs_badge"].includes(outcome)) throw new Error("outcome must be pending, live, rejected or needs_badge");
    return J.setOutcome(db, arg(0, "job"), outcome as J.Outcome, flags["listing-url"]);
  },

  // ---- galleries ------------------------------------------------------------
  "gallery show": async () => {
    const product = await loadProduct(flags.product);
    return db.select().from(galleries).where(eq(galleries.productId, product.id)).orderBy(desc(galleries.revision)).all();
  },
  "gallery propose": async () => {
    const product = await loadProduct(flags.product);
    const items = z.array(z.object({ id: z.string(), path: z.string(), description: z.string() })).parse(await readInput(flags.input));
    for (const i of items) if (!existsSync(join(product.dir, i.path))) throw new Error(`screenshot not found: workspace/products/${product.id}/${i.path}`);
    const row = db.insert(galleries).values({ productId: product.id, items: items as GalleryItem[] }).returning().get();
    J.logEvent(db, null, "gallery_proposed", flags.worker ?? null, { revision: row.revision });
    // Park the job so its lease can't expire while the human reviews; approve/reject re-queues it.
    if (flags.job) J.block(db, flags.job, worker(), "gallery_approval", `Review gallery revision ${row.revision} for ${product.id}`);
    return row;
  },
  "gallery approved": async () => {
    const product = await loadProduct(flags.product);
    return (
      db.select().from(galleries).where(and(eq(galleries.productId, product.id), eq(galleries.status, "approved"))).orderBy(desc(galleries.revision)).get() ?? null
    );
  },
  "gallery approve": () => reviewGallery(db, Number(arg(0, "revision")), "approved"),
  "gallery reject": () => reviewGallery(db, Number(arg(0, "revision")), "rejected"),

  // ---- Google sign-in guard ----------------------------------------------------
  /** Run on the Google consent/sign-in URL before clicking anything. Fails unless it only asks for identity. */
  async "oauth check"() {
    const url = arg(0, "url");
    // OAuth URLs contain short-lived state tokens. Accept stdin so callers can
    // inspect scopes without putting those tokens in process arguments/logs.
    return googleScopes(url === "-" ? (await Bun.stdin.text()).trim() : url);
  },

  /** Consent pages don't carry the scope in the URL: pipe the page text in; only identity items pass. */
  async "oauth consent"() {
    const text = await Bun.stdin.text();
    // Google renders each requested permission as a tab-indented line.
    let items = text.split("\n").map((l) => l.trim()).filter((l, i, all) => text.split("\n")[i]!.startsWith("\t") && l);
    if (!items.length) {
      // Newer layout: "Google consentirà a <site> di accedere a queste informazioni su di te", items, then the privacy line.
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const start = lines.findIndex((l) => /queste informazioni su di te\.?$|this info about you\.?$/i.test(l));
      const end = lines.findIndex((l, i) => i > start && /^(Leggi le norme|Review |Read |Before using)/.test(l));
      const me = await loadIdentity();
      if (start >= 0 && end > start + 1) items = lines.slice(start + 1, end).filter((l) => l !== me.email && l !== me.display_name);
    }
    if (!items.length) {
      // "Signing in again" to a site this account already approved: Google shows no list. The scopes of the
      // flow's first Google URL (--url, the one `oauth check` passed) are then the only thing to verify.
      if (flags.url) return { ...googleScopes(flags.url), reSignIn: true };
      throw new Error("no permission list found on the page; pass --url <the Google URL that passed oauth check>, or block for the human");
    }
    const extra = items.filter((i) => !GOOGLE_IDENTITY_TEXT.some((re) => re.test(i)));
    if (extra.length) throw new Error(`consent asks for more than identity: ${extra.join(" | ")}. Do not click Allow; block for the human`);
    return { ok: true, items };
  },

  // ---- human surface -------------------------------------------------------
  "assets request-capture": async () => {
    const product = await loadProduct(flags.product);
    const mode = await permission("assets.capture_new", product.id);
    if (mode === "never") throw new Error(`assets.capture_new is never for ${product.id}`);
    if (mode === "automatic") return { productId: product.id, action: "assets.capture_new", status: "approved", permission: mode };
    return requestProductApproval(db, {
      productId: product.id,
      action: "assets.capture_new",
      message: `Approve new marketing screenshot captures for ${product.name ?? product.id}. This is product-wide and does not authorize any directory submission.`,
    });
  },
  "assets capture-approval": async () => {
    const product = await loadProduct(flags.product);
    return db.select().from(productApprovals)
      .where(and(eq(productApprovals.productId, product.id), eq(productApprovals.action, "assets.capture_new")))
      .orderBy(desc(productApprovals.id)).get() ?? null;
  },
  "assets capture-complete": () => consumeProductApproval(db, Number(arg(0, "approval-id"))),
  /** Everything waiting on the human, grouped. --product narrows it. */
  "actions": () => {
    const mine = <T extends { productId: string }>(xs: T[]) => xs.filter((x) => !flags.product || !x.productId || x.productId === flags.product);
    const blocked = mine(db.select().from(jobs).where(and(eq(jobs.kind, "submission"), eq(jobs.status, "blocked"))).all());
    const hold = blocked.filter((j) => j.blockType === "hold");
    return {
      needsYou: blocked.filter((j) => j.blockType !== "hold" && j.blockType !== "gallery_approval"),
      onHold: hold.map((j) => ({ id: j.id, directory: j.subject })),
      verifying: mine(db.select().from(jobs).where(and(eq(jobs.kind, "submission"), eq(jobs.status, "unknown"))).all()),
      galleries: mine(db.select().from(galleries).where(eq(galleries.status, "proposed")).all()).map((g) => ({ revision: g.revision, product: g.productId, screenshots: g.items.length })),
      productApprovals: mine(db.select().from(productApprovals).where(eq(productApprovals.status, "pending")).all()).map((a) => ({ id: a.id, product: a.productId, action: a.action, message: a.message })),
      registryChanges: db.select().from(registryChanges).where(eq(registryChanges.status, "proposed")).all().map((c) => ({ id: c.id, directory: c.directoryId })),
      todos: mine(db.select().from(todos).where(eq(todos.status, "open")).all()).map((t) => ({ id: t.id, job: t.jobId ?? undefined, message: t.message, url: t.url ?? undefined })),
    };
  },
  /** Block until a human acts on a blocked job. Run it in the background; it exits with the job. */
  async "wait"() {
    const id = sub;
    if (!id) throw new Error("missing <job>");
    const deadline = flags.timeout ? Date.now() + Number(flags.timeout) * 60_000 : Infinity;
    for (;;) {
      const job = db.select().from(jobs).where(eq(jobs.id, id)).get();
      if (!job) throw new Error(`no job ${id}`);
      if (job.status !== "blocked") return { resolved: true, job, events: J.jobEvents(db, id).slice(-3) };
      if (Date.now() > deadline) return { resolved: false, job };
      await Bun.sleep(2000);
    }
  },
  "todo add": () => {
    if (!flags.message) throw new Error("missing --message");
    const job = flags.job ? db.select().from(jobs).where(eq(jobs.id, flags.job)).get() : undefined;
    if (flags.job && !job) throw new Error(`no job ${flags.job}`);
    return addTodo(db, { productId: job?.productId ?? flags.product ?? "", jobId: flags.job, message: flags.message, url: flags.url });
  },
  "todo list": () => db.select().from(todos).where(eq(todos.status, flags.status === "done" ? "done" : "open")).all(),
  "todo done": () => closeTodo(db, Number(arg(0, "todo"))),
  "events": () => db.select().from(events).orderBy(desc(events.id)).limit(limit).all(),
  "overview": () => ({
    jobs: db.select({ kind: jobs.kind, status: jobs.status, n: sql<number>`count(*)` }).from(jobs).groupBy(jobs.kind, jobs.status).all(),
    outcomes: db
      .select({ outcome: jobs.outcome, n: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eq(jobs.kind, "submission"), inArray(jobs.status, ["done"])))
      .groupBy(jobs.outcome)
      .all(),
  }),
  // ---- registry updates -----------------------------------------------------
  /** Diffs the published registry (dirpush repo, LAUNCH_REGISTRY_URL or --url; https or a local path) against yours. --apply writes it. */
  async "registry updates"() {
    return registryUpdates(await fetchRegistryFile(flags.url ?? registrySource()), Boolean(flags.apply));
  },

  // ---- domain rating (optional Ahrefs) ---------------------------------------
  /** Weekly DR for your products (and with --all, every registry directory). Needs AHREFS_API_KEY in the environment. */
  async "dr refresh"() {
    const apiKey = process.env.AHREFS_API_KEY?.trim();
    if (!apiKey) throw new Error("set AHREFS_API_KEY in the environment (free key from ahrefs.com/api); DR tracking is optional");
    const sites = (await Promise.all(productIds().map((id) => loadProduct(id).then((p) => p.url).catch(() => null)))).filter((u): u is string => !!u);
    if (flags.all) sites.push(...(await loadDirectories()).map((d) => d.website));
    return refreshRatings(db, sites, { apiKey, force: Boolean(flags.force) });
  },
  /** DR history per product: first and latest reading, change, and the live-listing count beside it. */
  async "dr show"() {
    const ids = flags.product ? [resolveProductId(flags.product)] : productIds();
    return Promise.all(ids.map(async (id) => {
      const product = await loadProduct(id);
      const history = ratingHistory(db, [product.url]).get(ratingDomain(product.url)) ?? [];
      const live = db.select({ n: sql<number>`count(*)` }).from(jobs)
        .where(and(eq(jobs.kind, "submission"), eq(jobs.productId, id), eq(jobs.outcome, "live"))).get()!.n;
      const first = history.at(-1), latest = history[0];
      return { product: id, domain: ratingDomain(product.url), latest: latest ?? null, first: first ?? null,
        change: latest && first ? latest.rating - first.rating : null, liveListings: live, history };
    }));
  },

  // ---- one-off import ---------------------------------------------------------
  /** Imports the retired dirpush.com D1 export (--input dir, default data/hosted-export). Safe to re-run. */
  async "import hosted"() {
    const dir = flags.input ?? join(HOME, "data/hosted-export");
    return importHosted(db, await readHostedExport(dir), productIds());
  },

  // ---- capabilities: what the working agent can use (browser, email…), recorded during setup ----
  async "capabilities"() {
    const caps = await loadCapabilities();
    if (!caps) note("not checked yet: run the capability check in SKILL.md (Setup), then 'dirpush capabilities set --input json'");
    return { recorded: caps, detected: detect() };
  },
  async "capabilities set"() {
    if (!flags.input) throw new Error(`capabilities set --input '{"email":{"available":true,"tool":"…","address":"…","read_only":true}}'`);
    return saveCapabilities(await readInput(flags.input, "input"), process.env.LAUNCH_WORKER);
  },

  // ---- accounts: which directories we already have a login on (filled from checkpoints) ----
  "accounts list": () => {
    const rows = listAccounts(db, flags.product ? resolveProductId(flags.product) : undefined);
    if (!rows.length) note("no accounts recorded yet; they appear when a job checkpoints --data '{\"account\":{…}}' (run `accounts backfill` once on an old database)");
    return rows.map((r) => ({ directory: r.directoryId, product: r.productId || "shared", method: r.method, username: r.username ?? undefined, vault: r.vault ?? undefined, lastLogin: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString().slice(0, 10) : undefined }));
  },
  "accounts show": () => {
    const id = arg(0, "directory-id");
    const rows = accountsFor(db, id, flags.product ? resolveProductId(flags.product) : undefined);
    return { directory: id, hasAccount: rows.length > 0, accounts: rows, signIn: rows[0] ? (rows[0].vault ? `dirpush ab auth login ${rows[0].vault}` : rows[0].method === "google" || rows[0].method === "github" ? `use the site's "Sign in with ${rows[0].method === "google" ? "Google" : "GitHub"}" button` : "magic link / email code to the identity email") : "no account: follow authentication.md (new account only if permitted)" };
  },
  async "accounts backfill"() {
    const p = Bun.spawnSync(["agent-browser", "auth", "list", "--json"], { stdout: "pipe", stderr: "ignore" });
    let vault: { name: string; username: string }[] = [];
    try { vault = (JSON.parse(p.stdout.toString()).data?.profiles ?? []).map((v: { name: string; username: string }) => ({ name: v.name, username: v.username })); } catch { note("agent-browser vault not readable; filling from jobs only"); }
    return backfillAccounts(db, vault, new Set((await loadDirectories()).map((d) => d.id)), productIds());
  },

  // ---- browser: the dedicated Chrome agents drive with agent-browser (scripts/ab) ----
  "browser start": () => startBrowser(),
  "browser status": () => browserStatus(),
  "browser stop": () => stopBrowser(),
  "browser login": () => vaultLogin(arg(0, "vault-name")),
  "browser password": () => {
    if (!flags.url || !flags.username) throw new Error("browser password <vault-name> --url <login-url> --username <email> <field-selector…>");
    return newPassword(arg(0, "vault-name"), flags.url, flags.username, args.slice(1));
  },
  async "serve"() {
    const { serve } = await import("./server");
    // --host 0.0.0.0 shares it on the local network. The dashboard has no login: only do that on a network you trust.
    const host = flags.host ?? process.env.HOST ?? "127.0.0.1";
    if (host !== "127.0.0.1" && host !== "localhost") note(`dashboard reachable from the network on ${host}; it has no login, so anyone on this network can use it`);
    serve(Number(flags.port ?? 4321), host);
    return new Promise(() => {}); // keep running
  },
};


const HELP: [string, [string, string][]][] = [
  ["Start", [
    ["init [product-id] [--skill]", "set up your launch home (~/.dirpush, or the repo for a git checkout) and install the agent skill; with an id, scaffold that product. Safe to re-run"],
    ["product show [--product id]", "the product's canonical facts (never invent beyond these)"],
    ["products list", "all products in this workspace"],
    ["permission <group.action>", "automatic | confirm | never for an action, e.g. accounts.oauth_google"],
    ["actions [--product id]", "everything waiting on the human, grouped"],
  ]],
  ["Work loop", [
    ["work next [--claim]", "next submission job (unknown ones first); --claim leases it to you"],
    ["work show <job> [--all]", "a job, its saved data and its last 20 events"],
    ["work checkpoint <job> <step> [--data json]", "record progress; extends the lease"],
    ["work heartbeat <job>", "extend the lease on a long page"],
    ["work begin-submit <job>", "right before the final submit click"],
    ["work submitted <job> [--outcome pending|live] [--listing-url u]", "right after the submit result"],
    ["work not-submitted <job> --evidence text", "an unknown job was verified as not received"],
    ["work complete <job> --result json", "the product was already listed there"],
    ["work block <job> --type t --message text", "hand a step to the human (captcha, email_verification, permission, missing_info, manual, hold)"],
    ["work fail <job> --reason text [--retryable]", "give up on a directory, with the reason"],
    ["work release <job>", "stop cleanly and give the job back"],
    ["wait <job> [--timeout min]", "block until the human resolves a blocked job (run in background)"],
    ["work list [--status s] [--limit n]", "recent submission jobs"],
  ]],
  ["Directories", [
    ["directories recommend --product id [--free] [--unsubmitted] [--all] [--kind k] [--limit n]", "directories that fit and are allowed"],
    ["submissions enqueue <directory-id…> --product id", "queue submissions"],
    ["registry show <id>", "full definition and playbook for one directory"],
    ["registry list [--free] [--kind k] [--limit n]", "registry rows (50 by default)"],
    ["registry report-change <id> --input json", "record a fix you made to a directory's YAML"],
    ["registry updates [--apply]", "compare with the published registry (dirpush.com)"],
    ["registry audit [ids…]", "measure link rel, noindex and bot check (no AI)"],
    ["registry set-link <id> --rel r --evidence <listing url> [--samples n] [--noindex yes|no] [--bot-check t] | --rel unknown --why reason", "record a link type you measured by hand, or why it can't be measured"],
    ["utm <directory-id>", "the product URL with UTM parameters for that directory"],
  ]],
  ["Submissions", [
    ["submissions list [--product id] [--outcome o] [--status s] [--limit n]", "submissions, most recent first (50 by default)"],
    ["submissions add <id|url> --product id [--listing-url u] [--outcome live|pending]", "a listing made outside the agents"],
    ["submissions outcome <job> live|rejected|pending|needs_badge [--listing-url u]", "moderation result"],
    ["submissions check [job]", "re-check listings in review, mark live ones (no AI)"],
  ]],
  ["Human hand-offs", [
    ["todo add --job id --message text [--url u]", "something for the human that doesn't block the job"],
    ["todo list | todo done <id>", "open to-dos"],
    ["gallery approved --product id | gallery propose --job id --input json", "screenshots"],
    ["oauth check <url> | oauth consent --url u", "verify Google asks only for identity scopes before clicking Allow"],
  ]],
  ["Setup", [
    ["capabilities", "what the agent recorded it can use (email tool, browser) plus what the CLI detects"],
    ["capabilities set --input json", "record your tools after the setup check, e.g. an email tool for verification links"],
  ]],
  ["Accounts", [
    ["accounts show <directory-id> [--product id]", "do we have a login there, and how to sign in (check before any sign-up)"],
    ["accounts list [--product id]", "every directory account (no secrets; passwords stay in the vault)"],
    ["accounts backfill", "one-time: fill accounts from old job data and the agent-browser vault"],
  ]],
  ["Browser", [
    ["ab <agent-browser command…>", "drive the agents' Chrome: dirpush ab open <url>, ab snapshot -i, ab fill @e3 \"text\", ab click @e5…"],
    ["google-login", "the human signs into Google once in the agents' Chrome profile"],
    ["browser start | status | stop", "the dedicated Chrome (real profile, Google services blocked) agents drive"],
    ["browser login <vault-name>", "fill a saved login into the open tab on that site (password never shown)"],
    ["browser password <vault-name> --url u --username e <selector…>", "new account: generate, fill, verify and save a password (never shown)"],
  ]],
  ["Other", [
    ["dr show | dr refresh [--all]", "Domain Rating history (refresh needs AHREFS_API_KEY)"],
    ["serve [--port n] [--host 0.0.0.0]", "the local dashboard (localhost only unless --host)"],
  ]],
];
if (!cmd || cmd === "help") {
  console.log(`dirpush: durable directory submissions. Output is JSON on stdout (compact; --pretty to indent, --full for raw rows).\n\n${HELP.map(([group, rows]) => `${group}\n${rows.map(([c, d]) => `  ${c}\n      ${d}`).join("\n")}`).join("\n\n")}\n`);
  process.exit(0);
}
const run = commands[`${cmd} ${sub}`] ?? commands[cmd ?? ""];
if (!run) {
  const tried = sub ? `${cmd} ${sub}` : cmd;
  const close = Object.keys(commands).filter((c) => c.startsWith(cmd) || c.includes(tried) || (sub && c.endsWith(sub)));
  console.error(JSON.stringify({ error: `unknown command: ${tried}`, ...(close.length && { didYouMean: close.slice(0, 5) }), help: "dirpush help" }));
  process.exit(1);
}
try {
  const result = await run();
  if (result !== undefined) out(result);
} catch (e) {
  console.error(JSON.stringify({ error: e instanceof z.ZodError ? z.prettifyError(e) : (e as Error).message }));
  process.exit(1);
}
