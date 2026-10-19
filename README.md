# Dirpush

Submit your product to startup and SaaS directories with your own coding agent, and keep track of every submission on your own machine.

Dirpush is local-only. The `dirpush` CLI gives your agent a durable job queue, a verified registry of directories with playbooks, and your product's facts. The agent drives a browser on your computer, and a localhost dashboard shows what is live, what is pending and what needs you. There is no server and no account, and nothing leaves your machine unless you choose to share it.

Browse the registry at [dirpush.com](https://dirpush.com): every directory with its cost, its link type (dofollow, nofollow, ugc or sponsored, measured on real listing pages) and how to submit.

## Setup

Requires [Bun](https://bun.sh) and Google Chrome. Hand it to the agent you already use: any coding agent or computer-use bot that can run shell commands. It's tested with Claude Code and Codex. Agents drive their own Chrome profile with [agent-browser](https://github.com/vercel-labs/agent-browser), never your everyday browser, and saved passwords are filled by the CLI so they never pass through the model.

```sh
npm i -g dirpush agent-browser   # or run everything below with npx
dirpush init acme                # sets up ~/.dirpush and installs the agent skill
```

`init` keeps your launch in `~/.dirpush` (database, product files, the agents' Chrome profile) and installs the dirpush skill for your agents in `~/.claude/skills` and `~/.agents/skills`. Then open your agent and say **"set up dirpush"**: it fills in your product's facts with you and checks which tools it has, such as an email tool for verification links. After that, **"continue my launch"** runs the whole loop. `dirpush serve` opens the dashboard.

## Useful commands

| Command | Purpose |
| --- | --- |
| `dirpush directories recommend --free --unsubmitted --product <id>` | Directories that fit and haven't been tried |
| `dirpush submissions list --product <id>` | Every submission and its outcome |
| `dirpush submissions check` | Re-check pending listings and mark live ones |
| `dirpush actions` | What needs you: CAPTCHAs, verification emails, questions |
| `dirpush checks` | Clear CAPTCHAs and bot checks one by one in the agents' Chrome; agents pick each job back up |
| `dirpush registry updates [--apply]` | Update your registry from the published one on dirpush.com |
| `dirpush registry audit` | Measure link type, noindex and bot checks on real listing pages |
| `dirpush submissions add <id or URL>` | Record a listing you made yourself |
| `dirpush dr refresh` / `dirpush dr show` | Optional Ahrefs Domain Rating history (needs `AHREFS_API_KEY`) |

`dirpush help` lists everything.

## Working on dirpush

```sh
git clone https://github.com/baronunread/dirpush.git && cd dirpush
bun install --frozen-lockfile
bun launch init acme             # a git checkout keeps its data in the repo (data/, workspace/)
bun run dev                      # dashboard on localhost
bun run verify                   # repo checks, typecheck, tests
```

Releases publish to npm from GitHub Actions when a `v*` tag is pushed (trusted publishing, no token).

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | CLI, job queue, registry, dashboard server and UI |
| `registry/` | Verified directory definitions, playbooks and source provenance |
| `site/`, `scripts/build-site.ts` | The static dirpush.com site |
| `scripts/` | Registry and site builds, repository checks |
| `docs/` | Plan, operator guide and architecture |
| `data/`, `workspace/` | Your private local state, excluded from Git |

## Contributing

Know a directory that's missing, or one whose details are wrong? [Open an issue](https://github.com/baronunread/dirpush/issues/new?labels=new-directory&title=New%20directory%3A%20) with its URL. Pull requests that add or fix a directory in `registry/directories/` are welcome; run `bun run verify` first.

## License

- Code: [MIT](LICENSE).
- Registry data (`registry/`, and `registry.json` on dirpush.com): [CC BY 4.0](registry/LICENSE). Reuse it freely with credit to dirpush.com.

Third-party code and the directory seed lists keep their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
