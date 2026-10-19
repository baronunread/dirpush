#!/usr/bin/env node
// npx/npm entry point. dirpush runs on Bun (bun:sqlite, Bun.serve); this shim finds it or says how to get it.
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const cli = join(__dirname, "..", "src", "cli.ts");
const bun = process.versions.bun ? process.execPath : "bun";
const run = spawnSync(bun, [cli, ...process.argv.slice(2)], { stdio: "inherit" });
if (run.error && run.error.code === "ENOENT") {
  console.error("dirpush needs Bun (https://bun.sh). Install it with:\n  curl -fsSL https://bun.sh/install | bash\nthen run the same command again.");
  process.exit(1);
}
process.exit(run.status ?? 1);
