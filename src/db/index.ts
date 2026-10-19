import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as schema from "./schema";

/** Where the package lives: registry, migrations, examples, scripts and the skill. Read-only once installed. */
export const PKG = join(import.meta.dir, "../..");
/**
 * Where your launch lives: data/ (database, Chrome profile, evidence) and workspace/ (products, identity).
 * A git checkout keeps it in the repo, as before; an installed package uses ~/.dirpush. LAUNCH_HOME overrides both.
 */
export const HOME = process.env.LAUNCH_HOME ?? (existsSync(join(PKG, ".git")) ? PKG : join(homedir(), ".dirpush"));

export function openDb(path = process.env.LAUNCH_DB ?? join(HOME, "data/launch.db")) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA busy_timeout = 5000");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: join(PKG, "drizzle") });
  return db;
}

export type Db = ReturnType<typeof openDb>;
export { schema };
