import { desc, eq, sql } from "drizzle-orm";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { openDb, ROOT } from "./db";
import { events, galleries, jobs, productApprovals, registryChanges, todos } from "./db/schema";
import * as J from "./jobs";
import { loadDirectories, loadDirectory } from "./registry";
import { addManualSubmission } from "./manual";
import { platformHosted, ratingDomain, ratingHistory, refreshRatings } from "./ratings";
import { fetchRegistryFile, registrySource, registryUpdates } from "./registry-updates";
import { closeTodo, reviewGallery, reviewProductApproval, reviewRegistryChange } from "./review";
import { loadIdentity, loadPermissions, loadProduct, productIds, WORKSPACE } from "./workspace";
import index from "./web/index.html";

/** Local dashboard: observability + human decisions. Agents use the CLI, not this. */
export function serve(port: number, hostname = "127.0.0.1") {
  const db = openDb();
  const safe = (fn: () => unknown) => async () => {
    try {
      return Response.json(await fn());
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  };
  const body = async (req: Request) => ((await req.json().catch(() => ({}))) ?? {}) as Record<string, string | undefined>;
  /** Read-only files confined to `root` (screenshots for review and evidence). */
  const files = (root: string, prefix: string) => (req: Request) => {
    const path = resolve(root, decodeURIComponent(new URL(req.url).pathname.slice(prefix.length)));
    if (!path.startsWith(resolve(root) + sep)) return new Response("forbidden", { status: 403 });
    return new Response(Bun.file(path));
  };
  const EVIDENCE = join(ROOT, "data/evidence");
  const optional = async <T>(fn: () => Promise<T>) => fn().catch((e: Error) => ({ error: e.message }));

  const server = Bun.serve({
    port,
    hostname,
    development: process.env.NODE_ENV !== "production",
    routes: {
      "/": index,
      "/api/overview": safe(() => ({
        jobs: db.select({ kind: jobs.kind, status: jobs.status, n: sql<number>`count(*)` }).from(jobs).groupBy(jobs.kind, jobs.status).all(),
        outcomes: db
          .select({ outcome: jobs.outcome, n: sql<number>`count(*)` })
          .from(jobs)
          .where(eq(jobs.kind, "submission"))
          .groupBy(jobs.outcome)
          .all(),
        activity: db.select().from(events).orderBy(desc(events.at)).limit(60).all(),
      })),
      "/api/actions": safe(() => ({
        blocked: db.select().from(jobs).where(eq(jobs.status, "blocked")).all(),
        unknown: db.select().from(jobs).where(eq(jobs.status, "unknown")).all(),
        failed: db.select().from(jobs).where(eq(jobs.status, "failed")).all(),
        galleries: db.select().from(galleries).where(eq(galleries.status, "proposed")).all(),
        productApprovals: db.select().from(productApprovals).where(eq(productApprovals.status, "pending")).all(),
        registryChanges: db.select().from(registryChanges).where(eq(registryChanges.status, "proposed")).all(),
        todos: db.select().from(todos).where(eq(todos.status, "open")).all(),
      })),
      "/api/todos/:id/done": { POST: (req) => safe(() => closeTodo(db, Number(req.params.id)))() },
      "/api/jobs": (req) =>
        safe(() => {
          const kind = new URL(req.url).searchParams.get("kind");
          return db.select().from(jobs).where(eq(jobs.kind, kind === "research" ? "research" : "submission")).orderBy(desc(jobs.updatedAt)).all();
        })(),
      "/api/meta": safe(() => ({ registrySource: registrySource(), ahrefs: Boolean(process.env.AHREFS_API_KEY?.trim()) })),
      // Latest DR per directory domain plus full history per product (newest first).
      "/api/ratings": safe(async () => {
        const products = (await Promise.all(productIds().map((id) => loadProduct(id).then((p) => ({ id, url: p.url })).catch(() => null)))).filter((p) => p !== null);
        const directories = await loadDirectories();
        const all = ratingHistory(db, [...products.map((p) => p.url), ...directories.map((d) => d.website)]);
        return {
          products: Object.fromEntries(products.map((p) => [p.id, all.get(ratingDomain(p.url)) ?? []])),
          directories: Object.fromEntries(directories.map((d) => [d.id, platformHosted(d.website) ? null : all.get(ratingDomain(d.website))?.[0]?.rating ?? null])),
        };
      }),
      "/api/ratings/refresh": {
        POST: () =>
          safe(async () => {
            const apiKey = process.env.AHREFS_API_KEY?.trim();
            if (!apiKey) throw new Error("Set AHREFS_API_KEY in the environment you start the dashboard from.");
            const urls = (await Promise.all(productIds().map((id) => loadProduct(id).then((p) => p.url).catch(() => null)))).filter((u): u is string => !!u);
            return refreshRatings(db, urls, { apiKey });
          })(),
      },
      // Compares the published registry with the local one; { apply: true } writes the updates.
      "/api/registry/updates": {
        POST: async (req) => {
          const { apply } = (await req.json().catch(() => ({}))) as { apply?: boolean };
          return safe(async () => ({ source: registrySource(), checkedAt: Date.now(), ...(await registryUpdates(await fetchRegistryFile(registrySource()), apply === true)) }))();
        },
      },
      "/api/jobs/:id": (req) =>
        safe(async () => {
          const job = db.select().from(jobs).where(eq(jobs.id, req.params.id)).get();
          if (!job) throw new Error(`no such job: ${req.params.id}`);
          const dir = join(EVIDENCE, job.id);
          return {
            job,
            events: J.jobEvents(db, job.id),
            evidence: /^[\w-]+$/.test(job.id) && existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort() : [],
            directory: job.kind === "submission" ? (await optional(() => loadDirectory(job.subject).then((d) => d.directory))) : null,
          };
        })(),
      "/api/jobs/:id/unblock": {
        POST: async (req) => {
          const { note, approve } = await body(req);
          return safe(() => J.unblock(db, req.params.id, note?.trim() || (approve ? "approved" : "resolved via dashboard"), Date.now(), approve === "yes"))();
        },
      },
      "/api/jobs/:id/outcome": {
        POST: async (req) => {
          const { outcome, listingUrl } = await body(req);
          if (outcome !== "live" && outcome !== "rejected" && outcome !== "pending") return Response.json({ error: "outcome must be live, rejected or pending" }, { status: 400 });
          return safe(() => J.setOutcome(db, req.params.id, outcome, listingUrl?.trim() || undefined))();
        },
      },
      // Opens plain Chrome on Google's sign-in page (scripts/google-login). Same-origin only: another site
      // in the browser must not be able to pop this open.
      "/api/google-login": {
        POST: (req) => {
          if ((req.headers.get("sec-fetch-site") ?? "same-origin") !== "same-origin") return new Response("forbidden", { status: 403 });
          Bun.spawn([join(ROOT, "scripts/google-login")], { cwd: ROOT, stdout: "ignore", stderr: "ignore" }).unref();
          return Response.json({ ok: true });
        },
      },
      // Raises the agents' Chrome on the worker's tab (scripts/show-browser). Same-origin only, as above.
      "/api/show-browser": {
        POST: async (req) => {
          if ((req.headers.get("sec-fetch-site") ?? "same-origin") !== "same-origin") return new Response("forbidden", { status: 403 });
          const p = Bun.spawn([join(ROOT, "scripts/show-browser")], { cwd: ROOT, stdout: "ignore", stderr: "ignore" });
          return (await p.exited) === 0 ? Response.json({ ok: true }) : Response.json({ error: "agent browser is not open" }, { status: 409 });
        },
      },
      // Runs `submissions check` (plain fetch, no AI) for one job or all pending ones; marks live listings.
      "/api/submissions/check": {
        POST: async (req) => {
          const { job } = (await req.json().catch(() => ({}))) as { job?: string };
          const p = Bun.spawn(["bun", "src/cli.ts", "submissions", "check", ...(job ? [job] : [])], { cwd: ROOT, stdout: "pipe", stderr: "ignore" });
          const out = await new Response(p.stdout).text();
          return Response.json({ results: JSON.parse(out.slice(out.indexOf("["))) });
        },
      },
      // A listing the human made themselves, from the dashboard: { product, target, outcome, listingUrl }.
      "/api/submissions/add": {
        POST: async (req) => {
          const { product, target, outcome, listingUrl } = await body(req);
          return safe(async () => addManualSubmission(db, (await loadProduct(product)).id, target ?? "", (outcome ?? "pending") as J.Outcome, listingUrl))();
        },
      },
      // "I submitted it myself" on an existing job.
      "/api/jobs/:id/manual": {
        POST: async (req) => {
          const { outcome, listingUrl } = await body(req);
          return safe(() => J.recordManual(db, req.params.id, (outcome ?? "pending") as J.Outcome, listingUrl?.trim() || undefined))();
        },
      },
      "/api/jobs/:id/requeue": { POST: (req) => safe(() => J.requeue(db, req.params.id))() },
      "/api/galleries/:rev/:decision": {
        POST: (req) => safe(() => reviewGallery(db, Number(req.params.rev), req.params.decision === "approve" ? "approved" : "rejected"))(),
      },
      "/api/registry-changes/:id/:decision": {
        POST: (req) => safe(() => reviewRegistryChange(db, Number(req.params.id), req.params.decision === "accept" ? "accepted" : "rejected"))(),
      },
      "/api/product-approvals/:id/:decision": {
        POST: (req) => safe(() => reviewProductApproval(db, Number(req.params.id), req.params.decision === "approve" ? "approved" : "rejected"))(),
      },
      "/api/registry": safe(() => loadDirectories()),
      "/api/registry/:id": (req) => safe(() => loadDirectory(req.params.id))(),
      "/api/products": safe(() => Promise.all(productIds().map((id) => optional(() => loadProduct(id)).then((p) => ({ id, ...p }))))),
      // Workspace-wide: who agents sign up as and what they may do.
      "/api/settings": safe(async () => ({ identity: await optional(() => loadIdentity()), permissions: await optional(() => loadPermissions()) })),
      "/api/products/:id": (req) =>
        safe(async () => ({
          product: await optional(() => loadProduct(req.params.id)),
          galleries: db.select().from(galleries).where(eq(galleries.productId, req.params.id)).orderBy(desc(galleries.revision)).all(),
        }))(),
      // Screenshots for gallery review. Confined to the workspace directory.
      "/workspace/*": files(WORKSPACE, "/workspace/"),
      // Agent screenshots per job: data/evidence/<job-id>/*.png
      "/evidence/*": files(EVIDENCE, "/evidence/"),
    },
  });
  console.log(`launch dashboard: ${server.url}`);
  return server;
}
