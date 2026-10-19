# Working on Dirpush

Install dependencies from the committed Bun lockfile, then run the checks:

```sh
bun install --frozen-lockfile
bun run verify
```

`verify` checks Git exclusions, typechecks and runs the tests in `src/`. CI runs the same command.

Schema change: edit `src/db/schema.ts`, run `bun run db:generate`, and review the generated migration in `drizzle/`.

- Never read or write `data/launch.db` directly. State changes go through `bun launch …`.
- Keep credentials out of source, command arguments, logs and issues. Optional keys such as `AHREFS_API_KEY` come from the environment.
- Registry entries are verified against the live site. Record the sources you inspected in `verification.sources`.
- Start the dashboard (`bun run dev`) only when you need it.
