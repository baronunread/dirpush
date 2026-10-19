# Recovery

Everything you need is in the DB; you never need the previous conversation.

```bash
launch work show <job>      # status, step, data, and the full event timeline
```

## Status meanings

| status | what to do |
|---|---|
| `queued` / `retry` | claim and start (or resume from `step` — earlier checkpoints' `data` are still there) |
| `running` (lease expired) | a worker died; `work next --claim` hands it to you. Resume from `step`. Browser state may be gone — re-authenticate if needed. |
| `unknown` | a submit may or may not have landed. **Verify before anything else.** |
| `blocked` | waiting on the human (`launch actions`). Don't claim; they unblock it from the dashboard or `launch work unblock <job>`. |
| `failed` | permanent. Human can `launch work requeue <job>`. |

## Verifying an `unknown` job

Look for evidence the directory received the listing, in this order:

1. the current page / confirmation screen (if the browser is still there);
2. the account's "my submissions / my products" page;
3. public search on the directory for the product name and domain;
4. confirmation emails the human can check (block with `--type verify_submission` if that's the only way).

Then exactly one of:

- found → `launch work submitted <job> --outcome pending|live [--listing-url …]`
- verified absent → `launch work not-submitted <job> --evidence "searched my-products and public search for 'Name'/domain: nothing"` → the job is `running` again at step `verified_not_submitted`; redo from `resolved` and `begin-submit` again.
- can't tell → `launch work block <job> --type verify_submission --message "…"`.

**Never** `begin-submit` an unknown job without one of the first two.
