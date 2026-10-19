/** Writes dist/registry.json, the file `launch registry updates` reads. Publish it from CI. */
import { join } from "node:path";
import { PKG } from "../src/db";
import { buildRegistryFile } from "../src/registry-updates";

const file = await buildRegistryFile();
const out = process.argv[2] ?? join(PKG, "dist/registry.json");
await Bun.write(out, JSON.stringify(file) + "\n");
console.log(`Wrote ${file.directories.length} directories (revision ${file.revision}) to ${out}`);
