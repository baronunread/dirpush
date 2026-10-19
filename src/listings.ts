/** Is a submitted listing publicly live? Used by `submissions check`. */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
// Some directories publish the page before approval ("the approval team will review it").
const NOT_YET = /will review it|pending (approval|review)|awaiting (approval|review)|under review/i;

export const isLive = (body: string, host: string) => body.includes(host) && !NOT_YET.test(body);

/** Path segment naming the product: "ledgerline", "ledgerline-com", "ledgerline-1234" — not "ledgerlinex". */
export const matchesSlug = (url: string, slugs: string[]) => {
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })();
  return path.split("/").some((seg) => slugs.some((s) => seg === s || seg.startsWith(`${s}-`)));
};

export const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));

const get = (url: string) =>
  fetch(url, { redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) })
    .then(async (r) => ({ status: r.status, body: r.ok ? await r.text() : "" }))
    .catch((e: Error) => ({ status: 0, body: "", error: e.message }));

/** Listing URL from the directory's sitemap(s), for directories with no known URL pattern. */
export async function findInSitemap(site: string, slugs: string[]) {
  const origin = new URL(site).origin;
  const robots = (await get(`${origin}/robots.txt`)).body;
  const queue = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map((m) => m[1]!);
  if (!queue.length) queue.push(`${origin}/sitemap.xml`);
  // ponytail: fetches at most 30 sitemap files per directory; huge directories may hide the listing deeper.
  for (let i = 0; i < queue.length && i < 30; i++) {
    const xml = (await get(queue[i]!)).body;
    const urls = locs(xml);
    if (/<sitemapindex/i.test(xml)) queue.push(...urls);
    else {
      const hit = urls.find((u) => matchesSlug(u, slugs));
      if (hit) return hit;
    }
  }
}

/** Rendered page in a throwaway anonymous browser: client-rendered pages and sites that serve fetch a different page. */
function render(url: string, session: string) {
  const ab = (...args: string[]) => Bun.spawnSync(["agent-browser", "--session", session, ...args], { stderr: "pipe", timeout: 60_000 });
  if (ab("open", url).exitCode) return;
  ab("wait", "2000");
  const out = ab("eval", `JSON.stringify([location.href, document.body.innerText + [...document.querySelectorAll("a[href]")].map(a => a.href).join(" ")])`);
  try {
    let v = JSON.parse(out.stdout.toString());
    if (typeof v === "string") v = JSON.parse(v);
    return { finalUrl: v[0] as string, body: v[1] as string };
  } catch {}
}

export async function checkListing(url: string, host: string, slugs: string[], session: string) {
  const res = await get(url);
  if (isLive(res.body, host)) return { live: true, how: "fetch" };
  if (res.status === 404 || res.status === 410) return { live: false, how: `not yet (${res.status})` };
  // Fetch saw no listing (bot wall, JS-only page, soft 404) → look like a person.
  const page = render(url, session);
  // A redirect to the homepage can still show the product in a "recent" list; that's not its listing.
  const live = !!page && matchesSlug(page.finalUrl, slugs) && isLive(page.body, host);
  return { live, how: live ? "browser" : `not yet (${res.status || ("error" in res && res.error)}, browser: ${page ? "no listing" : "failed"})` };
}

export const closeBrowser = (session: string) => Bun.spawnSync(["agent-browser", "--session", session, "close"], { stderr: "ignore" });
