# PulseMCP

- The submit page (read 2026-10-26) says new MCP server and client submissions are paused and existing listings are not being edited. No reopening date is given.
- It says to publish to the Official MCP Registry (see `official-mcp-registry`) as the best first step, and that PulseMCP will pick it up automatically once back. How the ingestion works was not detailed.
- A listing page showed a `com.pulsemcp.mirror/...` server.json, with a note that PulseMCP manages it until the maintainer publishes to the official registry. So some listings are mirrors made without a submission.
- Dependency: do the official-mcp-registry entry first; nothing to submit on PulseMCP itself while paused.
- Link rel and noindex are not measured: plain HTTP requests got a Cloudflare 403 challenge, and the fetch tool does not show rel attributes. The submit form itself was not seen (the page showed only the pause notice).
- Research only; no account created or listing submitted.
