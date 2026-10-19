# Launch

Operating this repo (researching directories, submitting listings, "continue my launch"): use the **dirpush** skill at `.agents/skills/dirpush/SKILL.md`.

- Never read or write `data/launch.db` directly — all state goes through `bun launch …` (JSON out).
- Set `LAUNCH_WORKER=claude-code` before `work` commands.
- Never put secrets in files, CLI args, logs, or your context.

Developing this repo: Bun + TypeScript. `bun test`, `bun run typecheck`. Schema change → edit `src/db/schema.ts`, then `bun run db:generate`. See `ARCHITECTURE.md`.
