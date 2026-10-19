# Architecture

Everything runs on the user's machine:

```text
Coding agent (Claude Code / Codex) ──► launch CLI (JSON out) ──► SQLite (data/launch.db)
        │                                    │
        ▼                                    ├─ registry/directories/*.yaml (+ playbooks)
  agent-browser (local Chrome)               ├─ workspace/products/<id>/product.yaml
                                             └─ localhost dashboard (src/server.ts, src/web/)
```

- **State:** SQLite owns progress. Jobs carry leases, checkpoints and an append-only event log, so a dead conversation loses nothing. A job left mid-submit becomes `unknown` and must be verified before any retry. Schema: `src/db/schema.ts`; migrations: `drizzle/`.
- **Registry:** one YAML file per verified directory plus an optional playbook. `scripts/build-registry.ts` publishes it as a single `registry.json`, and `launch registry updates` compares a local copy with it.
- **Product truth:** `workspace/products/<id>/product.yaml` and the permissions files. Agents may reword facts but never invent them.
- **Domain Rating:** optional. `launch dr refresh` calls Ahrefs' free endpoint with the user's own key and appends to `domain_ratings`.
- **Browser:** the agent drives a local, headed Chrome via `scripts/ab`. Sites whose bot checks reject automation are marked for the human.

The detailed design is in [docs/operator-architecture.md](docs/operator-architecture.md), and the next steps are in [docs/plan.md](docs/plan.md).
