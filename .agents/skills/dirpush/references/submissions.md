# Submission jobs

`job.subject` is a directory id. Load its definition and playbook first:

```bash
P=<job.productId>
dirpush registry show <directory-id>
dirpush product show --product $P
dirpush gallery approved --product $P
dirpush utm <directory-id> --product $P   # use this URL wherever a website link is asked
```

The registry describes **expected** behaviour; the live site wins. Any mismatch (new required field, now paid, URL changed, closed…) → fix `registry/directories/<id>/directory.yaml` (and `playbook.md`) yourself, check it still loads with `dirpush registry show <id>`, then record it: `dirpush registry report-change <id> --input '{"field":"cost","expected":"VERIFIED_FREE","observed":"PAID","evidence":"https://…"}'` and keep going with the live requirements (or `work fail` if it is now paid — `money.spend` is `never`).

## Steps (checkpoint after each)

1. **existing_checked** — never skip this, even when `dirpush accounts show` finds no account (people submit by hand). Search the directory for the product name/domain. Already listed? `work begin-submit` is not needed: `dirpush work checkpoint <job> existing_checked --data '{"existing":"<url>"}'` then `dirpush work complete <job> --result '{"outcome":"live","listing_url":"<url>"}'`.
2. **authenticated** — follow [authentication.md](authentication.md). Always drive the browser with `dirpush ab`.
   One directory account per product is the default (vault name `<directory-id>-<product-id>`); reuse one account across products only if the directory lists several products per account.
3. **url_imported** — if `submission.url_first` / `autofetch.supported`: enter the product URL first and let the site fill fields. Save what it fetched: `--data '{"fetched":{…}}'`.
4. **resolved** — compare every fetched/required field with canonical facts. Keep accurate values, correct wrong ones, fill missing ones from `product.yaml`, respect live character limits. Never keep an auto-generated claim that conflicts with product facts. Save `--data '{"resolved":{…}}'`.
5. **assets_selected** — logo from `product.assets.logo`; the square icon field takes `product.assets.icon` (PNG). URL-first forms often pre-fill the logo/icon from the site (a screenshot or OG image): always replace it, or moderators reject the listing; screenshots from the approved gallery (see assets.md). No approved gallery and the directory needs screenshots → propose one and block.
6. **ready** — form filled, nothing submitted yet. Take a screenshot as evidence: `mkdir -p data/evidence/<job> && dirpush ab screenshot data/evidence/<job>/ready.png`.
7. `dirpush work begin-submit <job>` → click submit → observe the result →
   `dirpush work submitted <job> --outcome submitted|pending|live [--listing-url <url>]`.

Any failure **before** step 7: `work fail <job> --retryable --reason …` (timeouts, flaky pages) or without `--retryable` (directory now paid/closed, product ineligible).

## Later: moderation tracking

"Check my pending listings" (or at the start of any session, if some are older than a few days):

```bash
dirpush submissions list --outcome pending --product <id>
```

For each: search Gmail (if connected, same rules as authentication.md) for mail from the directory's domain — approvals/rejections usually arrive there — then confirm on the site (account dashboard, or the directory's page for the product). Record what you saw:

```bash
dirpush submissions outcome <job> live --listing-url <url>   # or: rejected
```

No news and no listing yet → leave it pending. Nothing to record.
