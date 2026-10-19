# Dirpush

Submit your product to startup and SaaS directories with your own coding agent, and keep track of every submission on your own machine.

Dirpush is local-only. The `launch` CLI gives your agent a durable job queue, a verified registry of directories with playbooks, and your product's facts. The agent drives a browser on your computer, and a localhost dashboard shows what is live, what is pending and what needs you. There is no server and no account, and nothing leaves your machine unless you choose to share it.

Browse the registry at [dirpush.com](https://dirpush.com): every directory with its cost, its link type (dofollow, nofollow, ugc or sponsored, measured on real listing pages) and how to submit.

## Setup

Requires Bun and Google Chrome. Hand it to the agent you already use: any coding agent or computer-use bot that can run shell commands. It's tested with Claude Code and Codex. Agents drive their own Chrome profile with [agent-browser](https://github.com/vercel-labs/agent-browser), never your everyday browser, and saved passwords are filled by the CLI so they never pass through the model.

```sh
git clone https://github.com/baronunread/dirpush.git && cd dirpush
bun install --frozen-lockfile
bun launch init acme                  # creates workspace/products/acme/product.yaml
bun launch product show --product acme
bun run dev                           # dashboard on localhost
```

Then ask your agent to "continue my launch". The workflow it follows is in [the launch skill](.agents/skills/launch/SKILL.md). On the first run it records what it can use, such as an email tool for verification links (`launch capabilities`).

## Useful commands

| Command | Purpose |
| --- | --- |
| `launch directories recommend --free --unsubmitted --product <id>` | Directories that fit and haven't been tried |
| `launch submissions list --product <id>` | Every submission and its outcome |
| `launch submissions check` | Re-check pending listings and mark live ones |
| `launch todo list` | What needs you: CAPTCHAs, verification emails, questions |
| `launch registry updates [--apply]` | Compare your registry with the published one on dirpush.com |
| `launch registry audit` | Measure link type, noindex and bot checks on real listing pages |
| `launch submissions add <id or URL>` | Record a listing you made yourself |
| `launch dr refresh` / `launch dr show` | Optional Ahrefs Domain Rating history (needs `AHREFS_API_KEY`) |

`bun launch help` lists everything.

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

Know a directory that's missing, or one whose details are wrong? [Open an issue](https://github.com/baronunread/dirpush/issues/new?labels=new-directory&title=New%20directory%3A%20) with its URL. Pull requests that add or fix a directory in `registry/directories/` are welcome; run the checks first:

```sh
bun run verify
```

## License

- Code: [MIT](LICENSE).
- Registry data (`registry/`, and `registry.json` on dirpush.com): [CC BY 4.0](registry/LICENSE). Reuse it freely with credit to dirpush.com.

Third-party code and the directory seed lists keep their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
