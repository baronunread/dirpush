# Plan: Dirpush as a local tool

Decided 2026-10-19. dirpush.com is retired. Dirpush becomes a free, local npm CLI: your coding agent does the submissions in your own browser, and a static registry is published monthly. There is no server, no accounts and no billing. The last hosted version is tagged `archive/dirpush`.

## Why

The pilot product's hosted run (Sep 27 – Oct 14) produced 77 submissions: 16 live, 55 pending and 6 needing a badge. Agents did the form work well. What stalled the launch was 41 jobs waiting on the human, and most of those were questions answerable once, not hard problems:

| Blocker | Jobs | Fix |
| --- | --- | --- |
| Questions with a standing answer (share contact email? stage? what it replaces? username?) | ~15 | Standing answers |
| Claude's safety check refused the final submit click | 4–5 | Approve-submit |
| Email verification | 4 | Inbox step or one-click list |
| Turnstile or invisible reCAPTCHA fails in the automated browser | ~20 | Manual kit |
| On hold by choice (Product Hunt, BetaList…) | 7 | None needed |

**Success test for phase 2:** the pilot product's blocked jobs drop to a short manual list plus the deliberate holds.

## Phase 1: cut to local (done 2026-10-19)

- Removed `hosted/` (Worker, D1, MCP, OAuth, billing, dashboard) and the sync commands.
- `launch import hosted` brought the D1 records local: 233 targets, 634 events and 625 DR readings. The hosted profile is saved at `workspace/products/<id>/hosted-profile.json`.
- `launch dr refresh|show`: optional Ahrefs DR history with the user's own key.
- `launch registry updates [--apply]` and `bun run registry:build`, which writes `dist/registry.json`.

## Phase 2: fewer interruptions

1. **Standing answers.** These are new `product.yaml` fields, collected at `init` and read before any block:
   - Facts: `company`, `stage`, `funding`, `founder` (name, role, X), `replaces` (competitors), `usernames.default`.
   - Policies under `answers`: `share_contact_email`, `oauth_github`, `oauth_x_read_scopes`, `phone_required`, `dns_verification`, `reviews_required`, each `yes | no | ask`.
   - `listing_rules`: free-text rules such as "title is always the product name".
   - Seed the pilot product from `hosted-profile.json` (stage, funding source, contact-details permission, naming rule).
   - **Rule:** an agent may block only when the question isn't covered. A `no` answer fails the job with a reason instead of blocking it.
2. **Batched questions.** Blocks carry `fields` (key, label, hint), and the dashboard shows one "answer these" form across jobs. An answer that should apply to every future job is written back to the standing answers, with a checkbox to confirm.
3. **Approve-submit.** For jobs where the agent can't make the last click, the dashboard shows the final payload and URL. Approving lets `work begin-submit` proceed; the human can also click Submit themselves and mark the job submitted.
4. **Manual kit.** `launch kit <job>` and a dashboard page show the submit link, every field value with a copy button, the logo and screenshot paths, and the gotchas from the playbook. Directories that are `human_only` or failed a CAPTCHA go straight to the kit instead of being retried.
5. **Clear the pilot product's queue** with the above. Measure: blocked jobs before and after, and minutes per manual kit.

## Phase 3: package

- npm package `dirpush` (name free on npm as of 2026-10-19). Bun is required; consider `bun build --compile` binaries later.
- State moves to `~/.dirpush/` (database, workspace, registry cache) instead of the repository.
- `dirpush init` drafts `product.yaml` from the website, asks the standing-answer questions, and installs the launch skill into `.claude/skills` or `.agents/skills`.
- The registry is downloaded on first run and refreshed when older than 30 days (`registry updates --apply`).
- `dirpush report <directory>`: the agent drafts a GitHub issue (new directory, correction, gone or paid), with personal data stripped. The human confirms, then it's posted via `gh issue create` or a pre-filled issue URL. Dedupe by domain first.
- Minimal dashboard: system font, tables, one accent color. Three views: Products (DR trend, live/pending/blocked), Directories (filterable, status per product) and Needs you.

## Phase 4: public registry

- Public GitHub repo with `registry/` and a monthly Actions cron that checks every site is up, flags moved submit URLs and redirects, detects new pricing language, and opens a PR with changes.
- Approved `report` issues become registry PRs.
- Optional: tag directory audiences with a classifier (e.g. classifier.dev) in CI. This runs on public data only and never sends product data.
- Publish `registry.json` via GitHub Pages; that URL becomes the default `LAUNCH_REGISTRY_URL`.

## Not doing

Hosted browsers, customer accounts, done-for-you service, MCP server, billing.
