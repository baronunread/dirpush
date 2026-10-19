# Dirpush

Submit your product to startup and SaaS directories with your own coding agent, and keep track of every submission on your own machine.

Dirpush is local-only. The `launch` CLI gives Claude Code or Codex a durable job queue, a verified registry of directories with playbooks, and your product's facts. The agent drives a browser on your computer, and a localhost dashboard shows what is live, what is pending and what needs you. There is no server and no account, and nothing leaves your machine unless you choose to share it.

> Status: being reshaped from the retired dirpush.com app into a local tool and npm package. See [the plan](docs/plan.md). The last hosted version is tagged `archive/dirpush`.

## Setup

Requires Bun and Google Chrome. Hand it to the agent you already use: any coding agent or computer-use bot that can run shell commands. Agents drive their own Chrome profile with [agent-browser](https://github.com/vercel-labs/agent-browser), never your everyday browser, and saved passwords are filled by the CLI so they never pass through the model.

```sh
bun install --frozen-lockfile
bun launch init acme                  # creates workspace/products/acme/product.yaml
bun launch product show --product acme
bun run dev                           # dashboard on localhost
```

Then ask your agent to "continue my launch". The workflow it follows is in [the launch skill](.agents/skills/launch/SKILL.md).

## Useful commands

| Command | Purpose |
| --- | --- |
| `launch directories recommend --free --unsubmitted --product <id>` | Directories that fit and haven't been tried |
| `launch submissions list --product <id>` | Every submission and its outcome |
| `launch submissions check` | Re-check pending listings and mark live ones |
| `launch registry updates [--apply]` | Compare your registry with the published one on dirpush.com |
| `launch registry audit` | Measure link type, noindex and bot checks on real listing pages |
| `launch submissions add <id or URL>` | Record a listing you made yourself |
| `launch dr refresh` / `launch dr show` | Optional Ahrefs Domain Rating history (needs `AHREFS_API_KEY`) |

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | CLI, job queue, registry, dashboard server and UI |
| `registry/` | Verified directory definitions, playbooks and source provenance |
| `scripts/` | Registry bootstrap/build and repository checks |
| `docs/` | Plan, operator guide, architecture and field notes |
| `data/`, `workspace/` | Your private local state, excluded from Git |

## Checks

```sh
bun run verify
```

Third-party code and directory source data keep their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
