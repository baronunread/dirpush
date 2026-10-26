# ChatGPT App and Plugin Directory

- OpenAI's docs now call these "plugins" (docs URL still /apps-sdk/deploy/submission). The directory is at chatgpt.com/apps; submit from https://platform.openai.com/plugins ("Upload new or existing plugin"). The old ChatGPT plugins are not the route.
- Prerequisites: OpenAI Platform organization; owner, or member with Apps Management Write. Complete individual or business verification in https://platform.openai.com/settings/organization/general; the directory shows the verified developer identity.
- Package: ZIP with plugin metadata and/or skills and MCP config. If it uses an MCP server, include it in the first ZIP (adding one to a skills-only plugin is not supported). Plugin ZIPs with app references or lifecycle hooks cannot currently be submitted. Local MCP / desktop-only plugins follow a separate process.
- MCP server: stable public HTTPS endpoint; host the challenge token at `/.well-known/openai-apps-challenge`; auth none, OAuth or mixed only (no API-key or bearer flow; nonempty server headers are rejected); explicit readOnlyHint/destructiveHint/openWorldHint on each tool; only one MCP server per plugin.
- Review inputs: HTTPS website, support, privacy policy and terms URLs; 5 positive and 3 negative test cases; reviewer video URL; reviewer credentials (a demo account with sample data; sign-up flows or inaccessible 2FA are rejected); release notes; policy attestations.
- Policy gotchas: commerce only for physical goods with external checkout; no selling digital goods, subscriptions or credits; no ads; no ChatGPT-specific pricing; descriptions must not advertise pricing or promotions; general audience (13+).
- One review active at a time; feedback by email; reject can be appealed by replying. After approval, click Publish. MCP tool changes are rescanned daily and go live after automated checks.
- GPT Store is a separate path (custom GPTs published from the GPT builder, not MCP apps). The help-center page returned 403 here; per search snippets only: publishing depends on plan and workspace settings, may need a builder profile with a verified domain, and public actions need a privacy policy URL. Not established directly, so no separate entry was created.
- Link value: chatgpt.com/apps returned 403 to curl, so listing pages could not be read; rel not established.
- Research only; no account created or listing submitted.
