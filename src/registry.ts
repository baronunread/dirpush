import { mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT } from "./db";
import { CLASSIFICATIONS } from "./db/schema";
import { DIRECTORY_KINDS } from "./directory-kinds";

export const REGISTRY = process.env.LAUNCH_REGISTRY ?? join(ROOT, "registry/directories");

export const Directory = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  website: z.url(),
  submission_url: z.url().nullable(),
  cost: z.object({
    classification: z.enum(CLASSIFICATIONS).exclude(["UNVERIFIED", "DEAD", "NOT_RELEVANT"]),
    notes: z.string().optional(),
  }),
  audience: z.array(z.string()).default([]),
  authentication: z.object({ required: z.boolean(), signup_allowed: z.boolean(), methods: z.array(z.string()).default([]) }),
  submission: z.object({
    url_first: z.boolean(),
    fields: z.array(z.object({ name: z.string(), required: z.boolean(), limit: z.number().optional() })).default([]),
    conditions: z.array(z.string()).default([]), // e.g. "backlink required", "manual review"
  }),
  autofetch: z.object({ supported: z.boolean(), expected: z.array(z.string()).default([]) }),
  media: z.object({
    logo: z.boolean(),
    screenshots: z.object({ supported: z.boolean(), max: z.number().optional() }),
  }),
  // What kind of site this really is. Only "listing" is a plain directory submission; the rest need a human decision or timing.
  kind: z.enum(Object.keys(DIRECTORY_KINDS) as [keyof typeof DIRECTORY_KINDS, ...(keyof typeof DIRECTORY_KINDS)[]]).optional(),
  // Set when the site's bot check rejects the automated browser outright (why/where). Such directories are for the human.
  human_only: z.string().nullable().optional(),
  // Free-tier wait before a listing goes live, as the site states it ("instant", "3-4 months").
  review_time: z.string().optional(),
  // Where a listing appears once live, {slug} = product name lowercased; lets a plain script check pending listings.
  listing_url_pattern: z.string().optional(),
  // Measured by `registry audit` (no AI): what a listing's link is worth, read off real listing pages.
  link: z
    .object({
      rel: z.enum(["dofollow", "nofollow", "ugc", "sponsored", "mixed", "unknown"]),
      method: z.enum(["own_listing", "sample_listing", "platform_rule", "none"]),
      evidence: z.string().nullable(),
      samples: z.number(),
      noindex: z.boolean().nullable(),
      claimed: z.enum(["dofollow", "nofollow"]).nullable(),
      bot_check: z.enum(["recaptcha", "turnstile", "hcaptcha", "math", "none", "unknown"]),
      checked_at: z.string(),
      // Why rel is still "unknown" after a real attempt: shown on the site instead of a bare "not measured".
      unmeasured: z.enum(["no_listings", "no_outbound_link", "bot_wall", "login_required", "site_down"]).optional(),
    })
    .optional(),
  verification: z.object({
    status: z.literal("verified"),
    checked_at: z.string(),
    by: z.string().optional(),
    sources: z.array(z.string()).default([]),
  }),
});
export type Directory = z.infer<typeof Directory>;

export function normalizeUrl(raw: string) {
  const u = new URL(raw.trim().includes("://") ? raw.trim() : `https://${raw.trim()}`);
  u.hash = "";
  const domain = u.hostname.toLowerCase().replace(/^www\./, "");
  return { domain, url: u.toString() };
}

export async function loadDirectories(): Promise<Directory[]> {
  if (!existsSync(REGISTRY)) return [];
  const ids = readdirSync(REGISTRY).filter((d) => existsSync(join(REGISTRY, d, "directory.yaml")));
  return Promise.all(ids.map(async (id) => Directory.parse(Bun.YAML.parse(await Bun.file(join(REGISTRY, id, "directory.yaml")).text()))));
}

export async function loadDirectory(id: string) {
  const dir = join(REGISTRY, id);
  if (!existsSync(join(dir, "directory.yaml"))) throw new Error(`no such directory: ${id}`);
  const directory = Directory.parse(Bun.YAML.parse(await Bun.file(join(dir, "directory.yaml")).text()));
  const playbook = existsSync(join(dir, "playbook.md")) ? await Bun.file(join(dir, "playbook.md")).text() : null;
  return { directory, playbook };
}

export async function writeDirectory(d: Directory, playbook?: string) {
  const dir = join(REGISTRY, d.id);
  mkdirSync(dir, { recursive: true });
  await Bun.write(join(dir, "directory.yaml"), Bun.YAML.stringify(Directory.parse(d), null, 2));
  if (playbook) await Bun.write(join(dir, "playbook.md"), playbook);
}

export function removeDirectory(id: string) {
  const dir = join(REGISTRY, id);
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(dir)) return false;
  rmSync(dir, { recursive: true });
  return true;
}
