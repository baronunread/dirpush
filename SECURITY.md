# Security and private data

The repository must contain no credentials or local databases. Keep tokens, OAuth credentials, password material, private keys and local environment files out of Git and logs. Environment templates contain placeholders only.

Run `bun run repo:check` before staging. This checks candidate file paths and ignore coverage; it is not a content secret scanner or a full security audit. Review the actual staged diff before a future commit. If a credential was ever committed, revoke/rotate it; adding it to `.gitignore` does not remove it from history.

Report a vulnerability privately to the repository owner. Do not put credentials, database exports or personal data into an issue, screenshot or diagnostic report. Use GitHub private security reporting if it has been enabled for the eventual repository.

Duplicate-submission guards (leases, `begin-submit`, `unknown` verification) and permission stops must not be bypassed for convenience.
