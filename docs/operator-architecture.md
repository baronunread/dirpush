> Paths below are relative to the repository root.

# Launch Distribution Agent — Architecture

## 1. Product goal

Build a durable, local-first startup distribution system operated through **Claude Code or Codex**.

The user clones the repository, configures a product once, starts the local application, and asks their coding agent to find suitable free directories, create or reuse accounts, prepare listings, select real product screenshots, submit entries, and track outcomes.

The system must survive interruption at any point. Claude Code, Codex, the browser, an API call, or the terminal may disappear without losing authoritative state or causing unsafe duplicate submissions.

### Core principles

1. **Local-first MVP.** No hosted backend is required.
2. **Agent-agnostic.** Claude Code and Codex are interchangeable workers.
3. **Durable by default.** SQLite, explicit state transitions, checkpoints, leases, and an event log own progress—not model context.
4. **Browser automation through agent-browser.** Do not build a browser automation framework in the MVP.
5. **Canonical product truth.** Agents may adapt marketing copy but must not invent product capabilities.
6. **URL-first submissions.** If a directory can import product information from a URL, use that before manually filling fields.
7. **Real product media.** Screenshots must depict the actual product. Agents may capture them from the application and propose a gallery.
8. **Human approval where representation matters.** New screenshot/gallery choices require approval; approved sets can be reused automatically.
9. **Idempotent external actions.** An uncertain submission must be verified before it is retried.
10. **Research precedes automation.** Existing public datasets are only one-time candidate seeds; a finite research campaign independently verifies the registry before submission automation relies on it.
11. **Registry improves through use.** After the research campaign, differences between registry knowledge and live directory behavior generate opportunistic corrections.

---

## 2. High-level architecture

```text
                 Claude Code          Codex
                      \                /
                       \              /
                    Portable Agent Skill
                           |
                           v
                       launch CLI
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
       SQLite          Filesystem      agent-browser
          |                |                |
   jobs / events       product /         browser
   submissions         assets /          sessions
   approvals           registry             |
          |                                 v
          +------------ Local UI ------ Directories
```

The **agent is an executor, not the source of truth**.

All durable state changes go through the Launch CLI/application layer. Agents must not modify the SQLite database directly.

---

## 3. Repository layout

One Bun package. Split into workspaces only if parts ever ship separately.

```text
launch/
├── AGENTS.md / CLAUDE.md          # thin adapters -> the launch skill
├── architecture.md
├── .agents/skills/launch/         # portable skill (symlinked at .claude/skills/launch)
│   ├── SKILL.md
│   └── references/{research,submissions,authentication,assets,recovery}.md
├── src/
│   ├── cli.ts                     # the agent protocol (`launch …`, JSON out)
│   ├── jobs.ts                    # state machine, leases, events (+ jobs.test.ts)
│   ├── db/{schema,index}.ts       # Drizzle + bun:sqlite, migrations in drizzle/
│   ├── registry.ts                # directory schema, candidates, normalization
│   ├── research.ts                # discovery recording, saturation, probe
│   ├── workspace.ts               # product / identity / permissions
│   ├── review.ts                  # human decisions (galleries, registry changes)
│   ├── server.ts                  # local dashboard API
│   └── web/                       # React dashboard (Bun HTML import, no bundler config)
├── scripts/bootstrap-registry.ts  # one-time upstream seed
├── registry/
│   ├── sources/                   # raw upstream snapshots + SOURCES.md (provenance/licences)
│   └── directories/<id>/{directory.yaml,playbook.md}   # verified only
├── examples/workspace/            # templates copied by `launch init <product-id>`
├── workspace/                     # (gitignored)
│   ├── identity.yaml, permissions.yaml          # shared defaults
│   └── products/<id>/{product.yaml,assets/}     # one folder per product; may override identity/permissions
└── data/                          # launch.db, browser-profile/, evidence/                  (gitignored)
```

Candidates (unverified) live in SQLite, not in files; only verified directories are written to `registry/directories/` so they are reviewable in git.

`workspace/` and `data/` should normally be ignored by Git except for example/template files.

---

## 4. Technology choices for MVP

- **Runtime/package manager:** Bun
- **Language:** TypeScript
- **Database:** SQLite
- **ORM/query layer:** Drizzle
- **Local HTTP server:** `Bun.serve` routes (no framework)
- **UI:** React via Bun HTML imports; hash tabs instead of a router
- **Browser automation:** agent-browser
- **Validation:** Zod
- **Directory definitions:** YAML frontmatter/data + Markdown playbooks
- **Agent integration:** portable `SKILL.md`, with thin `AGENTS.md` and `CLAUDE.md` adapters
- **Research discovery:** the agent's own web search (Claude Code WebSearch / Codex search) recorded via `launch research record`; DuckDuckGo HTML as a keyless scriptable fallback. No search infrastructure or API keys. Keyed providers (Tavily, Exa, Brave) can be added later as one fetch function each.

Do not add Redis, cloud queues, hosted databases, user accounts, billing, remote object storage, or a custom agent runtime to the MVP.

---

## 5. Agent integration

### 5.1 Portable skill

The repository ships one authoritative Launch skill. Both Claude Code and Codex consume the same workflow and references.

The skill teaches the agent how to:

- inspect product configuration;
- query available work through the CLI;
- discover and research directories;
- use agent-browser;
- create accounts and log in;
- handle URL-based directory imports;
- reconcile imported data against canonical product facts;
- capture and select screenshots;
- request human approval;
- submit listings;
- checkpoint outcomes;
- recover interrupted work;
- report changes observed on directory websites.

`CLAUDE.md` and `AGENTS.md` should be intentionally small. They should direct the agent to the Launch skill and prohibit direct DB manipulation.

### 5.2 CLI as agent protocol

Agents communicate with application state using deterministic commands and structured JSON output.

Examples:

```bash
launch product show --json
launch directories recommend --free --unsubmitted --limit 20 --json
launch work next --claim --worker claude-code
launch work checkpoint <job-id> authenticated --data '{"account":{"vault":"saashub"}}'
launch work begin-submit <job-id>
launch work submitted <job-id> --outcome pending --listing-url <url>
launch work complete <job-id> --result result.json
launch work block <job-id> --type email_verification --message "..."
launch work fail <job-id> --retryable --reason browser_timeout
launch work show <job-id>
launch registry propose <url>
launch registry report-change <directory-id> --input observation.json
launch research record "<query>" --input '["https://..."]'
launch research saturation
```

The CLI validates state transitions and prevents agents from bypassing safety rules.

---

## 6. Product model

The workspace holds any number of products. `workspace/products/<id>/product.yaml` is the canonical source of facts for product `<id>` (the folder name is the id). Commands take `--product <id>` / `LAUNCH_PRODUCT`; with one product it is implicit, with several an unqualified command is an error rather than a guess. The directory registry and research are shared across products; submissions, galleries and approvals are per product (`jobs.product_id`, unique per `(kind, product, subject)`).

Example:

```yaml
name: Example
url: https://example.com

tagline: A concise canonical tagline.

categories:
  - developer-tools
  - saas

features:
  - Feature A
  - Feature B

pricing:
  free_plan: true

social:
  github: null
  x: null

assets:
  logo: assets/brand/logo.svg
```

Descriptions may contain approved short, medium, and long variants, but the agent may generate directory-specific wording from canonical facts and live field constraints.

### Identity

`workspace/identity.yaml` contains reusable non-secret signup/profile data such as display name, username preference, and email address. A product folder may contain its own `identity.yaml` / `permissions.yaml` to override the shared ones. Directory accounts default to one per product (vault name `<directory-id>-<product-id>`).

Secrets must not be stored in these files or in SQLite.

---

## 7. Authentication and account creation

Authentication is part of normal automated execution.

Priority order:

1. reuse an existing persistent agent-browser session;
2. reuse an available authenticated browser/profile state;
3. use a credential reference from the agent-browser auth vault (`agent-browser auth login <directory-id>`);
4. create a new account when permitted;
5. block for human action if verification cannot be automated safely.

Claude Code or Codex may:

- navigate signup/login flows;
- create accounts when permitted;
- fill identity/profile fields;
- use vault-backed credentials without exposing secrets to model context;
- reuse authenticated sessions.

Human handoff is required for things such as CAPTCHAs, passkeys, unsupported MFA, or email verification that is not integrated.

A blocked authentication step is persisted. The agent may terminate and resume later.

Never store plaintext passwords in product files, registry files, logs, evidence, SQLite, or model-visible command output.

---

## 8. Directory registry

Each directory is represented by a machine-readable definition plus optional semantic instructions.

```text
registry/directories/saashub/
├── directory.yaml
└── playbook.md
```

Example definition:

```yaml
id: example-directory
name: Example Directory
website: https://example.com
submission_url: https://example.com/submit

cost:
  classification: verified-free

audience:
  - saas
  - developer-tools

authentication:
  required: true
  signup_allowed: true

submission:
  url_first: true
  account_required: true

autofetch:
  supported: true
  expected:
    - name
    - description
    - logo

media:
  logo: true
  screenshots:
    supported: true
    max: 5

verification:
  status: verified
  checked_at: 2026-09-27
  sources: []
```

The registry records expected behavior. The live website remains authoritative during execution.

If the live form disagrees with the registry, the agent continues using the live requirements and records a proposed registry correction.

---

## 9. URL-first entry resolution

Many directories can automatically inspect a product URL and prefill listing data. This should be the preferred path.

Workflow:

```text
open submission
      |
authenticate
      |
enter base product URL
      |
wait for directory import/AI fetch
      |
capture imported values
      |
compare with canonical product profile
      |
keep accurate values
correct inaccurate values
fill missing values
      |
validate live constraints
```

The system stores both the fetched representation and the final submitted representation where useful.

```text
submission/
├── fetched.json
├── resolved.json
└── evidence/
```

The resolver must never accept an auto-generated claim that conflicts with canonical product facts.

---

## 10. Product screenshots and galleries

Product media is first-class data.

```text
workspace/assets/
├── brand/
│   ├── logo.svg
│   └── icon.png
└── screenshots/
    ├── dashboard.png
    ├── analytics.png
    └── editor.png
```

Screenshot metadata records what each image depicts and its suitability.

```yaml
screenshots:
  - id: dashboard
    path: assets/screenshots/dashboard.png
    description: Main product dashboard
    priority: 100
```

### Capture rules

The agent may use agent-browser to navigate the actual product and capture representative views.

Screenshots must depict the real product. Do not fabricate nonexistent UI or features.

Cropping, resizing, and simple presentation treatments may be allowed, but the underlying product view must remain authentic.

### Gallery approval

When the system needs a new default screenshot set, the agent proposes one to the user before it becomes reusable.

Example:

```text
Proposed gallery

1. Dashboard — product overview
2. Analytics — reporting capabilities
3. QR generator — secondary feature
4. Link editor — creation workflow

Approve / reorder / remove / capture another
```

Once approved, the gallery revision is durable and may be reused automatically.

The agent asks again only when a directory has materially different media requirements or it proposes new/unapproved imagery.

---

## 11. Permissions

Explicit workspace permissions define what agents may perform autonomously.

Example:

```yaml
accounts:
  create: automatic
  login: automatic

submissions:
  fill_forms: automatic
  submit: automatic

content:
  descriptions: automatic
  categories: automatic

assets:
  reuse_approved: automatic
  capture_new: confirm
  create_new_gallery: confirm

money:
  spend: never

external:
  add_backlink: confirm
  publish_social_post: confirm
```

Agents must obey these settings regardless of directory playbook instructions.

---

## 12. Durable execution model

Durability is an application responsibility, not an LLM responsibility.

Every research candidate and every directory submission is a row in one `jobs` table (`kind = research | submission`), unique per `(kind, product, subject)`. Research and submissions share leases, checkpoints, events and blocks.

State is split in two:

- **`status`** — small, enforced by `src/jobs.ts`:
  `queued → running → done`, plus `blocked` (human), `retry` (backoff), `failed` (permanent), `unknown` (uncertain side effect).
- **`step`** — the agent's free-form checkpoint inside `running` (`existing_checked`, `authenticated`, `url_imported`, `resolved`, `assets_selected`, `ready`, …) with accumulated `data` (fetched/resolved fields, account reference, evidence).

The one reserved step is `submitting`, entered only through `work begin-submit`. Post-submit moderation (`submitted → pending → live/rejected`) is the `outcome` column of a `done` submission.

Rules the engine enforces (tested in `src/jobs.test.ts`):

- claiming is atomic (`BEGIN IMMEDIATE`); a live lease can't be stolen;
- a lease that expires mid-`submitting`, a `fail`, `block` or `release` mid-`submitting` → `unknown`, never `retry`;
- `unknown` jobs are served first by `work next` and can only leave via `work submitted` (found) or `work not-submitted` (verified absent);
- retryable failures back off exponentially (2^attempt min) up to 5 attempts, then `failed`.

Each meaningful step is checkpointed.

### The dangerous boundary

The most important recovery case is interruption immediately after an external side effect.

```text
click Submit
    |
process dies
    |
outcome unknown
```

The job becomes `UNKNOWN_SUBMISSION_STATE` or remains in a verification-required state.

On resume, the agent must inspect the directory for evidence of submission before attempting another submit.

It may check:

- current page/confirmation state;
- account submission history;
- moderation queue;
- public listing search;
- known confirmation URL or evidence.

Only when non-submission is established may the action be retried.

---

## 13. Idempotency

External operations should be modeled with idempotency in mind.

Before creating a listing, always search for an existing listing for the same product/domain.

Before account creation, check whether the account/session already exists.

Before submission retries, resolve uncertain prior attempts.

Internally, use unique constraints where applicable, such as one active canonical submission per `(product_id, directory_id)` while retaining separate attempt records.

---

## 14. Jobs and leases

Claude Code and Codex must be able to replace each other safely.

When an agent claims a job, the database creates a time-limited lease:

```yaml
job: sub_192
worker: claude-code
lease_expires_at: ...
```

While the lease is valid, another worker does not execute that job.

If the worker disappears, the lease expires and another agent may claim it.

Concurrency need not be enabled in the first UI, but the data model should support it.

---

## 15. Event log

Keep an append-only event history in addition to current state.

Example:

```text
job_created
existing_listing_checked
authentication_started
authenticated
url_import_started
url_import_completed
field_corrected
asset_attached
submit_attempted
worker_disconnected
recovery_started
submission_detected
submission_recorded
```

Events should contain timestamps, job/submission IDs, structured metadata, and worker identity where appropriate.

The event log supports debugging, recovery, dashboard activity feeds, and future hosted migration.

---

## 16. Browser durability

Use a persistent agent-browser profile (`--profile ./data/browser-profile`). New-account passwords are generated, filled and saved to the vault inside one shell command so they never enter model context (see the skill's authentication reference).

Browser state is useful for:

- cookies;
- authentication sessions;
- local storage;
- browser continuity.

However, browser state is **not authoritative application state**.

SQLite determines what the system believes happened. The browser may always be discarded and reconstructed from a durable checkpoint.

---

## 17. Human interruption model

Human interaction is a durable block, not a synchronous wait.

Example:

```yaml
state: BLOCKED_USER
block:
  type: email_verification
  message: Verify the account email for Example Directory.
```

The agent can exit immediately.

The local dashboard surfaces all outstanding actions:

```text
ACTION REQUIRED

Example Directory
Email verification required
[Mark verified]

Product Hunt
New screenshot gallery requires approval
[Review]

Another Directory
CAPTCHA requires manual completion
[Open browser]
```

After resolution, the job becomes eligible for execution again.

---

## 18. Submission records

A submission should retain:

- product;
- directory;
- directory/playbook version;
- current state;
- timestamps;
- account reference (never plaintext credentials);
- fetched directory data;
- resolved/submitted fields;
- selected gallery revision;
- listing URL;
- evidence;
- attempts;
- blocks;
- errors;
- event history.

This creates an audit trail of exactly how the product was represented.

---

## 19. Registry bootstrap and research campaign

Directory discovery is **not** a permanent crawler or a core runtime requirement. It has two bounded stages: a one-time dataset bootstrap and a finite research/verification campaign. Once coverage reaches diminishing returns, normal product operation uses the resulting trusted registry.

### 19.1 One-time dataset bootstrap

Existing public datasets are candidate sources only. Their claims about pricing, availability, requirements, or quality are never copied into authoritative registry fields without independent verification.

Initial seed sources include:

- `mmccaff/PlacesToPostYourStartup`;
- `mezmer90/saas-directories`;
- `volodstaimi/Startup-Launch-List`;
- other useful datasets added during bootstrap when licensing/provenance is acceptable.

The bootstrap lives under `scripts/bootstrap-registry/` because it is migration/setup tooling rather than normal product behavior.

```text
upstream datasets
      |
      v
raw source snapshots / provenance
      |
      v
normalize names + URLs + domains
      |
      v
deduplicate identities
      |
      v
unified candidate queue
```

Conflicting upstream claims are preserved as provenance, not resolved by guessing. For example, if one source says `free` and another says `paid`, the candidate remains `unverified` until our research establishes the current state.

After the unified candidate seed has been created, upstream repositories do not need to be continuously synchronized.

### 19.2 Finite research campaign

Research begins from the bootstrap candidates and expands beyond them through **agent-native search**: the worker (Claude Code or Codex) uses its built-in web search and records each query's result URLs with `launch research record`. `launch research discover` (DuckDuckGo HTML, no key) is the scriptable fallback. A self-hosted SearXNG was considered and dropped to avoid running infrastructure.

Provider results all feed the same durable candidate queue. Search-provider claims are discovery evidence only; they cannot mark a directory as verified.

```text
bootstrap candidates
        +
agent web search (research record) / DuckDuckGo fallback
        |
        v
normalized + deduplicated candidates
        |
        v
cheap reachability / obvious-junk filtering  (launch research probe)
        |
        v
Claude Code or Codex research job
        |
        v
agent-browser inspection of live site
        |
        v
verified registry + private playbook
```

The research worker establishes, where possible:

- whether the site is alive and is actually a relevant directory/catalog;
- whether product owners can currently submit listings;
- whether publication is free, freemium, conditional-free, or paid;
- the current submission URL;
- account/signup requirements;
- whether URL auto-import exists;
- required and optional listing fields;
- logo, screenshot, gallery, and other media requirements;
- backlink/social/other conditions;
- moderation behavior and other submission peculiarities useful to later automation.

A candidate is never `verified-free` merely because an upstream dataset or search result calls it free. The live site/submission flow is authoritative.

Useful classification states include:

```text
VERIFIED_FREE
FREEMIUM
CONDITIONAL_FREE
PAID
UNVERIFIED
DEAD
NOT_RELEVANT
```

Research should be durable like submissions: candidates are jobs with leases, checkpoints, evidence, blocks, and retryable/permanent failure states. Claude Code and Codex can therefore stop and resume the campaign interchangeably.

### 19.3 Research completion criterion

The goal is not an arbitrary directory count. The campaign is considered sufficiently complete when repeated searches across query families mostly return already-known domains or low-value candidates. `launch research saturation` reports the share of new domains over the last N recorded queries; below ~10% means stop. This coverage saturation is the signal to stop spending time on discovery and move to submission automation.

Research can later be run manually again if desired, but it is not a continuous background service and no part of the system requires search-provider API keys.

### 19.4 Manual additions

A newly encountered directory can still enter the same research pipeline:

```bash
launch registry propose https://example.com
```

The URL becomes an unverified candidate. The agent researches it, verifies the live submission flow, and only then promotes it into the trusted registry.

---

## 20. Registry self-healing

During real submissions, agents compare expected registry behavior with the live site.

Examples of reportable changes:

- submission URL changed;
- directory became paid;
- free submission returned;
- account requirement changed;
- URL autofetch added/removed;
- field limit changed;
- new required field;
- screenshot limit changed;
- directory shut down;
- moderation behavior changed.

Observed mismatches create proposed changes. They must not silently rewrite verified global knowledge without validation.

---

## 21. Local dashboard

The local UI is an observability and control surface, not the agent runtime.

Minimum screens:

### Overview

- queued submissions;
- executing;
- action required;
- submitted/pending;
- live;
- failures.

### Discover

- search/filter directories;
- free/conditional/paid;
- product fit;
- verified date;
- submitted/unsubmitted;
- queue actions.

### Submissions

- state;
- current durable step;
- attempts;
- submitted representation;
- listing URL;
- evidence;
- timeline/event history.

### Actions required

- email verification;
- CAPTCHA/manual authentication;
- gallery approval;
- uncertain submission resolution;
- policy/permission confirmation.

### Product

- canonical facts;
- identity;
- permissions;
- brand assets;
- screenshots;
- approved galleries.

---

## 22. Tracking performance

The initial MVP primarily tracks operational distribution state:

```text
planned -> executing -> submitted -> pending -> live/rejected
```

Each live listing stores its public URL.

Generate directory-specific UTM parameters where supported, for example:

```text
https://example.com/?utm_source=saashub&utm_medium=directory
```

Traffic/conversion analytics can follow as a later local integration without changing the submission architecture.

---

## 23. Recovery guarantees

The application should target these guarantees:

### Agent termination

`Ctrl+C`, API quota failure, context exhaustion, model error, or terminal closure does not lose completed checkpoints.

### Agent replacement

A run started by Claude Code may be resumed by Codex and vice versa.

### Browser failure

A browser crash does not erase workflow state. Authentication may be restored from persistent browser/auth state when available.

### Machine restart

SQLite and workspace files allow the application to reconstruct queued, blocked, retryable, and uncertain jobs.

### Network/API failure

Retryable failures use bounded retries/backoff and preserve the current checkpoint.

### Ambiguous external side effect

Never blindly repeat an uncertain submission. Verify first.

---

## 24. MVP scope

The MVP includes:

1. local Bun application;
2. SQLite/Drizzle durable state;
3. local dashboard;
4. portable Launch skill for Claude Code and Codex;
5. deterministic Launch CLI;
6. agent-browser integration;
7. persistent browser sessions/authentication;
8. automatic signup/login where possible;
9. durable human handoffs;
10. product onboarding/profile;
11. real product screenshot capture;
12. gallery proposal + approval + reuse;
13. directory registry/playbooks;
14. URL-first autofetch support;
15. entry reconciliation/resolution;
16. automatic form completion and submission;
17. durable submission state machine;
18. jobs, leases, attempts, and event log;
19. interruption/recovery logic;
20. one-time upstream dataset bootstrap;
21. finite research/verification campaign (agent-native search + DuckDuckGo fallback);
22. easy agent-assisted registry additions;
23. registry mismatch reporting;
24. listing URL/status tracking;
25. UTM generation.

Explicitly out of scope for the first MVP:

- hosted multi-user service;
- billing;
- cloud execution;
- Redis/cloud queues;
- remote browser fleet;
- autonomous CAPTCHA bypass;
- paid directory purchases;
- full conversion analytics platform;
- social/community spam automation.

---

## 25. Suggested implementation phases

### Phase 0 — bootstrap candidate registry

Run the one-time importers for the selected upstream datasets, preserve source provenance, normalize URLs/domains, deduplicate identities, and create the initial unverified candidate queue. Do not trust upstream pricing or verification claims.

### Phase 1 — research and verification campaign

Implement the minimal durable job/event foundation needed for research, agent-native discovery recording, candidate filtering, agent-browser verification, evidence capture, registry promotion, and private playbook generation. Run the campaign until discovery reaches coverage saturation.

### Phase 2 — durable submission core

Complete schemas, migrations, jobs, leases, events, submission state transitions, CLI protocol, workspace model, and tests for crash/recovery and ambiguous external side effects.

### Phase 3 — agent/browser execution

Add/finalize the portable skill, persistent browser sessions, authentication flows, durable human blocks, and account creation.

### Phase 4 — product representation

Implement onboarding, canonical product facts, assets, screenshot capture, gallery revisions, and approval flows.

### Phase 5 — directory submission execution

Use the verified registry to implement URL-first import, live-form inspection, entry resolution, automatic form completion, submission attempts, evidence, and uncertain-submit recovery.

### Phase 6 — local UI

Build Registry/Research visibility as needed, plus Queue, Submissions, Actions Required, Product, and Activity views on top of the stable core.

---

## 26. Definition of success

A successful MVP supports this interaction:

```text
$ bun dev
$ claude
# or
$ codex

> Set up this product, find 20 relevant free directories I have not
> submitted to, create accounts when necessary, prepare the listings,
> and submit them. Ask me when you need verification or approval.
```

The agent can stop at any point.

Later, either agent can be started and told:

```text
> Continue my launch.
```

It must recover from durable state, safely resolve uncertain operations, reuse approved product representation, and continue without requiring the previous agent's conversation context.

That durability and agent interchangeability are non-negotiable architectural properties of the project.

---

## 27. Status (2026-09-27)

Built: Phase 0 (bootstrap: 3 sources, 942 unique candidates, probe: 109 dead), the durable job core (Phase 2's engine, pulled forward because research needs it), CLI protocol, portable skill, dashboard (overview, needs you, submissions, research, registry, products, settings; see docs/dashboard-design.md), gallery proposal/approval, registry change proposals, UTM. Research campaign started with agent workers.

Not yet built: screenshot capture helpers beyond the skill instructions, onboarding wizard (use `launch init` + editing YAML), automatic application of accepted registry changes, conversion analytics.
