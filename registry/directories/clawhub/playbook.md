# ClawHub

- Publish with the separate `clawhub` CLI (not `openclaw`): `clawhub login`, `clawhub whoami`.
- Skill: `clawhub skill publish <path>` on a folder containing `SKILL.md`; options `--slug --name --version --changelog --tags` (tag defaults to `latest`). Use `--owner <handle>` to publish under an org.
- Plugin: `clawhub package publish <source>` (folder, `owner/repo`, `owner/repo@ref` or GitHub URL). Needs `openclaw.plugin.json`, and for code plugins `package.json` with `openclaw.compat.pluginApi` and `openclaw.build.openclawVersion`, plus source repo and exact commit metadata. Scope must match the publish owner.
- Run `clawhub package validate <source>` and `--dry-run` first; `--json` for CI.
- Docs say publishing needs a GitHub account "old enough to pass the upload gate". The minimum age is NOT stated anywhere read: a very new GitHub account may be rejected.
- Publishing a skill releases it under MIT-0. Do not publish anything that must stay proprietary.
- Each release is stored as pending and security-scanned; it is invisible in search, install and download until checks pass. Malicious, repeatedly failing or timed-out checks mean it is not published. Check `/dashboard` for held releases.
- Users can report content; moderators can hide or restore it and ban accounts. Reports do not auto-hide packages.
- Outbound link behaviour of listing pages is not established (pages are rendered client-side; not measured).
- Research only; no account created, nothing published.
