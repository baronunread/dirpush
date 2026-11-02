/** After a deploy: tells IndexNow (Bing, Yandex, and search built on Bing) about every URL in the sitemap.
 *  The key file the build writes (dist/site/<key>.txt) proves the site is ours. */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../src/db";

const OUT = join(PKG, "dist/site");
const key = readdirSync(OUT).find((f) => /^[0-9a-f]{32}\.txt$/.test(f))?.slice(0, -4);
if (!key) throw new Error("no IndexNow key file in dist/site: run bun run site:build first");
const urlList = [...(await Bun.file(join(OUT, "sitemap.xml")).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: "dirpush.com", key, keyLocation: `https://dirpush.com/${key}.txt`, urlList }),
});
// 200 and 202 both mean accepted; 202 = key not checked yet (normal on the first ping).
console.log(`IndexNow: ${res.status} for ${urlList.length} URLs`);
if (!res.ok) process.exit(1);
