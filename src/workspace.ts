import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { HOME } from "./db";

export const WORKSPACE = process.env.LAUNCH_WORKSPACE ?? join(HOME, "workspace");
export const PRODUCTS = join(WORKSPACE, "products");

// The product id is its directory name: workspace/products/<id>/product.yaml
export const Product = z.object({
  name: z.string(),
  version: z.string().optional(),
  release_url: z.url().optional(),
  url: z.url(),
  tagline: z.string(),
  descriptions: z.object({ short: z.string(), medium: z.string().optional(), long: z.string().optional() }),
  categories: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  pricing: z.object({ free_plan: z.boolean(), notes: z.string().optional() }),
  social: z.record(z.string(), z.string().nullable()).default({}),
  // Facts forms often ask for (country, launch date/status, tech stack).
  country: z.string().nullish(),
  city: z.string().nullish(),
  launched: z.string().nullish(), // YYYY-MM or YYYY-MM-DD
  status: z.enum(["idea", "beta", "launched"]).optional(),
  tech_stack: z.array(z.string()).default([]),
  // Standing answers to questions directories keep asking.
  replaces: z.array(z.string()).default([]), // well-known products this replaces ("alternative to …")
  company_stage: z.string().nullish(), // free text; map to the form's closest option
  funding: z.string().nullish(),
  username: z.string().nullish(), // default handle when a site needs a permanent username
  listing_rules: z.array(z.string()).default([]), // e.g. "title is always the product name"
  assets: z.object({ logo: z.string().optional(), icon: z.string().optional() }).default({}),
  screenshots: z
    .array(z.object({ id: z.string(), path: z.string(), description: z.string(), priority: z.number().default(0) }))
    .default([]),
});
export type Product = z.infer<typeof Product> & { id: string; dir: string };

export const Identity = z.object({
  display_name: z.string(),
  username: z.string(),
  email: z.email(),
  company: z.string().optional(),
  role: z.string().optional(),
});

const Mode = z.enum(["automatic", "confirm", "never"]);
export const Permissions = z.record(z.string(), z.record(z.string(), Mode));
export type Mode = z.infer<typeof Mode>;

async function load<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  if (!existsSync(path)) throw new Error(`missing ${path} — run 'dirpush init <product-id>' and fill it in`);
  return schema.parse(Bun.YAML.parse(await Bun.file(path).text()));
}

export const productIds = () =>
  existsSync(PRODUCTS) ? readdirSync(PRODUCTS).filter((d) => existsSync(join(PRODUCTS, d, "product.yaml"))).sort() : [];

/** Explicit id, else LAUNCH_PRODUCT, else the only product. */
export function resolveProductId(id = process.env.LAUNCH_PRODUCT) {
  if (id) {
    if (!productIds().includes(id)) throw new Error(`no product '${id}' (have: ${productIds().join(", ") || "none"})`);
    return id;
  }
  const ids = productIds();
  if (ids.length === 1) return ids[0]!;
  throw new Error(ids.length ? `several products (${ids.join(", ")}): pass --product <id> or set LAUNCH_PRODUCT` : "no products yet: run 'dirpush init <product-id>'");
}

export async function loadProduct(id?: string): Promise<Product> {
  const pid = resolveProductId(id);
  const dir = join(PRODUCTS, pid);
  return { ...(await load(join(dir, "product.yaml"), Product)), id: pid, dir };
}

/** Per-product file if present, else the shared workspace one. */
const shared = (file: string, id?: string) => {
  const own = id && join(PRODUCTS, id, file);
  return own && existsSync(own) ? own : join(WORKSPACE, file);
};
export const loadIdentity = (id?: string) => load(shared("identity.yaml", id), Identity);
export const loadPermissions = (id?: string) => load(shared("permissions.yaml", id), Permissions);

/** `accounts.create` -> automatic|confirm|never. Unlisted actions require confirmation. */
export async function permission(action: string, productId?: string): Promise<Mode> {
  const [group, key] = action.split(".");
  const perms = await loadPermissions(productId);
  return perms[group!]?.[key!] ?? "confirm";
}

export function utm(productUrl: string, directoryId: string) {
  const u = new URL(productUrl);
  u.searchParams.set("utm_source", directoryId);
  u.searchParams.set("utm_medium", "directory");
  return u.toString();
}
