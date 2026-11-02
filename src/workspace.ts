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
  // model: how paying works (directories like once.tools only take one-time purchases). Unset: read from the notes.
  pricing: z.object({ free_plan: z.boolean(), model: z.enum(["free", "subscription", "one_time", "usage_based"]).optional(), notes: z.string().optional() }),
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

/** The product's pricing model: `pricing.model`, else what the notes say ("$9/mo" is a subscription), else unknown. */
export function pricingModel(p: Pick<Product, "pricing">): NonNullable<Product["pricing"]["model"]> | undefined {
  if (p.pricing.model) return p.pricing.model;
  const notes = p.pricing.notes ?? "";
  if (/\/\s*(mo|month|yr|year)\b|per (month|year|seat)|monthly|yearly|annual|subscription/i.test(notes)) return "subscription";
  if (/one[- ]time|lifetime|pay once/i.test(notes)) return "one_time";
  return undefined;
}

/** Audience tags that are a pricing rule, not a topic: the directory only lists products sold this way. */
const PRICING_AUDIENCES: Record<string, NonNullable<Product["pricing"]["model"]>> = { "one-time-purchase": "one_time" };

/** Why this product can't be listed on a directory with these audience tags, or null. Unknown pricing never excludes. */
export function pricingMismatch(p: Pick<Product, "pricing">, audience: string[]) {
  const model = pricingModel(p);
  const need = audience.map((a) => PRICING_AUDIENCES[a]).find(Boolean);
  return model && need && model !== need ? `it only lists ${need.replace("_", "-")} products and this one is ${model.replace("_", "-")}` : null;
}

const EU = "Austria Belgium Bulgaria Croatia Cyprus Czechia Denmark Estonia Finland France Germany Greece Hungary Ireland Italy Latvia Lithuania Luxembourg Malta Netherlands Poland Portugal Romania Slovakia Slovenia Spain Sweden".split(" ");
const AFRICA = "Algeria|Angola|Benin|Botswana|Burkina Faso|Burundi|Cabo Verde|Cameroon|Central African Republic|Chad|Comoros|Congo|Djibouti|Egypt|Equatorial Guinea|Eritrea|Eswatini|Ethiopia|Gabon|Gambia|Ghana|Guinea|Guinea-Bissau|Ivory Coast|Kenya|Lesotho|Liberia|Libya|Madagascar|Malawi|Mali|Mauritania|Mauritius|Morocco|Mozambique|Namibia|Niger|Nigeria|Rwanda|Senegal|Seychelles|Sierra Leone|Somalia|South Africa|South Sudan|Sudan|Tanzania|Togo|Tunisia|Uganda|Zambia|Zimbabwe".split("|");
/** Audience tags that are an eligibility rule on where the product is from. */
const REGION_AUDIENCES: Record<string, { name: string; countries: string[] }> = {
  australia: { name: "Australian", countries: ["Australia"] },
  eu: { name: "EU", countries: EU },
  africa: { name: "African", countries: AFRICA },
};

/** Why this product can't be listed on a directory with these audience tags (pricing, region, stage), or null.
 *  Facts the product doesn't state never exclude. */
export function fitMismatch(p: Pick<Product, "pricing" | "country" | "status">, audience: string[]) {
  const pricing = pricingMismatch(p, audience);
  if (pricing) return pricing;
  const country = p.country?.trim().toLowerCase();
  for (const a of audience) {
    const region = REGION_AUDIENCES[a];
    if (region && country && !region.countries.some((c) => c.toLowerCase() === country)) return `it only lists ${region.name} products and this one is from ${p.country}`;
  }
  if (audience.includes("beta") && p.status && p.status !== "beta") return `it only lists products in beta and this one is ${p.status}`;
  return null;
}

export const Identity = z.object({
  display_name: z.string(),
  username: z.string(),
  email: z.email(),
  company: z.string().optional(),
  role: z.string().optional(),
  phone: z.string().optional(), // only if you're happy for directories to have it; unset → forms that require one block
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
  // A directory without its own entry follows submissions.submit (as work begin-submit enforces).
  if (group === "directories") return perms.directories?.[key!] ?? perms.submissions?.submit ?? "confirm";
  return perms[group!]?.[key!] ?? "confirm";
}

export function utm(productUrl: string, directoryId: string) {
  const u = new URL(productUrl);
  u.searchParams.set("utm_source", directoryId);
  u.searchParams.set("utm_medium", "directory");
  return u.toString();
}
