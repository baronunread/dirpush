# Operator guide

Read `.agents/skills/launch/SKILL.md` before research, submissions or state changes. Set `LAUNCH_WORKER=claude-code` (or `codex`) before `work` commands. Never read or edit `data/launch.db` directly.

## Setup

```sh
bun install --frozen-lockfile
bun link
bun launch init acme
bun launch product show --product acme
```

Product templates live in `examples/workspace/`. The resulting `workspace/` and `data/` are private and Git-ignored. Configure identity and permissions locally, and never put credentials in source or shell arguments.

## Registry updates

`bun run registry:build` writes `dist/registry.json` from the verified YAML files and playbooks. `launch registry updates` (default https://dirpush.com/registry.json; `--url` or `LAUNCH_REGISTRY_URL` for another copy) lists added and changed directories. `--apply` writes them. Entries you verified more recently than the published copy are kept and listed as `localNewer`. Directories missing from the published copy are reported as `onlyLocal` and are never deleted.

## Registry audit (link type, noindex, bot checks)

`launch registry audit [ids…]` measures every directory without AI and writes a `link:` block into its YAML:
- `rel`: dofollow, nofollow, ugc, sponsored or mixed. It is read from the "visit website" link on real listing pages: your own live listings first, otherwise product pages found in the directory's sitemap. GitHub lists are nofollow by platform rule.
- `noindex`: whether listing pages tell search engines to ignore them.
- `bot_check`: the CAPTCHA type on the submit page.
- `claimed`: what the directory's own text says, so claims and reality can be compared.

Pages without a clear visit link are skipped, so "unknown" means "not measured", never a guess. Evidence from your own listings is not stored (the registry is shared); the listing URL stays on the submission.

`bun scripts/scrub-registry.ts [--dry-run]` removes sentences naming a workspace product or internal tooling from the shared registry. `bun run site:build` applies the same filter to the public site and `registry.json`; `bun run site:serve` previews it on localhost:4500.

## Domain Rating

Optional. Put a free Ahrefs API key in `AHREFS_API_KEY`:
- `launch dr refresh` measures your products' domains if the last reading is a week old or more. Add `--all` to include every registry directory, `--force` to ignore the week.
- `launch dr show` prints each product's history next to its live-listing count.

## Importing dirpush.com data (one-off)

The retired hosted app's records were exported with read-only queries:

```sh
cd <archive checkout>/hosted
for t in tracked_products tracked_targets target_events domain_ratings domain_rating_history; do
  bunx wrangler d1 execute dirpush --remote --json --command "SELECT * FROM $t" > ../data/hosted-export/$t.json
done
```

`launch import hosted [--input data/hosted-export]` maps hosted target states onto local submission jobs:
- Hosted rows newer than the local job win. Newer local jobs are kept.
- Hosted events become `hosted.*` events, and ratings go into `domain_ratings`.
- Only products present in `workspace/products/` are imported.

It is safe to re-run. The import of 2026-10-19 brought the pilot product to 16 live, 55 pending and 41 blocked.

## Development

```sh
bun run typecheck
bun test src
```

Start the dashboard only when you need it: `bun run dev`.
