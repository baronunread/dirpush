/** Serves dist/site locally (directory URLs resolve to index.html). Build first: bun run site:build */
import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { PKG } from "../src/db";

const root = resolve(join(PKG, "dist/site"));
const server = Bun.serve({
  port: Number(process.env.PORT ?? 4500),
  hostname: process.env.HOST ?? "127.0.0.1", // HOST=0.0.0.0 to preview from another device on the LAN
  fetch(req) {
    let path = resolve(root, "." + decodeURIComponent(new URL(req.url).pathname));
    if (!path.startsWith(root + sep) && path !== root) return new Response("forbidden", { status: 403 });
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
    return existsSync(path) ? new Response(Bun.file(path)) : new Response("Not found", { status: 404 });
  },
});
console.log(`site: ${server.url}`);
