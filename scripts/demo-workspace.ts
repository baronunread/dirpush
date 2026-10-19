/**
 * A fictional workspace for marketing screenshots: one made-up product with plausible submission states and a
 * DR history, in its own database. Never touches data/launch.db.
 *
 *   bun scripts/demo-workspace.ts /tmp/dirpush-demo
 *   LAUNCH_DB=/tmp/dirpush-demo/launch.db LAUNCH_WORKSPACE=/tmp/dirpush-demo/workspace bun src/cli.ts serve --port 4499
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "/tmp/dirpush-demo";
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "workspace/products/ledgerline"), { recursive: true });
process.env.LAUNCH_DB = join(dir, "launch.db");
process.env.LAUNCH_WORKSPACE = join(dir, "workspace");

const { openDb, ROOT } = await import("../src/db");
const J = await import("../src/jobs");
const { recordRating } = await import("../src/ratings");
const { loadDirectories } = await import("../src/registry");
const { jobs } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");

cpSync(join(ROOT, "examples/workspace/identity.yaml"), join(dir, "workspace/identity.yaml"));
cpSync(join(ROOT, "examples/workspace/permissions.yaml"), join(dir, "workspace/permissions.yaml"));
await Bun.write(join(dir, "workspace/products/ledgerline/product.yaml"), `name: Ledgerline
url: https://ledgerline.app
tagline: Invoices that follow up for you.
descriptions:
  short: Send invoices, get paid, and let polite reminders chase late payments automatically.
categories: [finance, saas, productivity]
features: [Recurring invoices, Automatic payment reminders, Stripe and bank payouts]
pricing:
  free_plan: true
  notes: Free for 5 invoices a month, Pro $12/mo.
`);

const db = openDb();
const DAY = 86_400_000, now = Date.now();
const dirs = (await loadDirectories()).filter((d) => d.cost.classification !== "PAID").sort((a, b) => a.id.localeCompare(b.id));
const pick = (n: number, from: typeof dirs) => from.splice(0, n);
const pool = [...dirs].sort((a, b) => ((a.id.charCodeAt(1) * 7 + a.id.length) % 13) - ((b.id.charCodeAt(1) * 7 + b.id.length) % 13));
const set = (id: string, patch: Partial<typeof jobs.$inferSelect>, ago: number) =>
  db.update(jobs).set({ ...patch, updatedAt: now - ago }).where(eq(jobs.id, id)).run();
const job = (d: (typeof dirs)[number], ago: number) => J.enqueue(db, "submission", d.id, "ledgerline", now - ago - DAY);

pick(14, pool).forEach((d, i) => set(job(d, i * DAY).id, { status: "done", step: "submitted", outcome: "live", listingUrl: `${d.website.replace(/\/$/, "")}/ledgerline` }, i * 1.7 * DAY));
pick(38, pool).forEach((d, i) => set(job(d, i * DAY).id, { status: "done", step: "submitted", outcome: "pending" }, i * 0.6 * DAY));
const asks: [string, string][] = [
  ["captcha", "The submit form is filled in. Its Cloudflare check fails in the automated browser: open the submit page and press Submit yourself."],
  ["email_verification", "Account created. Click the verification link in the email they just sent, then confirm here."],
  ["missing_info", "The form asks for your founding year and team size, which aren't in product.yaml."],
  ["permission", "Free listing, but signing in with GitHub asks for read access to your public repositories."],
  ["email_verification", "They sent a six-digit login code to your inbox."],
  ["manual", "The free path is a Google Form that blocks automated browsers. Everything you need is in the manual kit."],
];
pick(asks.length, pool).forEach((d, i) => set(job(d, i * DAY).id, { status: "blocked", step: "ready", blockType: asks[i]![0], blockMessage: asks[i]![1] }, (i + 1) * 3_600_000));
pick(4, pool).forEach((d, i) => set(job(d, 0).id, { status: "queued", step: "queued" }, i * 600_000));
pick(3, pool).forEach((d, i) => set(job(d, 0).id, { status: "blocked", step: "queued", blockType: "hold", blockMessage: "Launch board: waiting for the next release." }, (i + 2) * DAY));
const reasons = ["paid: free tier removed", "badge: free only with a badge on your site", "not_a_fit: AI tools only", "broken: submit page returns 500"];
pick(19, pool).forEach((d, i) => set(job(d, 0).id, { status: "failed", step: "queued", lastError: reasons[i % reasons.length]! }, (i + 3) * DAY));

// DR climbing as listings go live: weekly readings over two months.
[12, 12, 13, 13, 15, 16, 16, 18, 19].forEach((r, i) => recordRating(db, "ledgerline.app", r, now - (8 - i) * 7 * DAY));
console.log(`Demo workspace in ${dir}`);
