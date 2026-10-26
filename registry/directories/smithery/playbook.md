# Smithery

- Two publish paths. URL: go to smithery.ai/new (redirects to smithery.ai/servers/new, which returned 404 when logged out; the sign-in step was not inspected) and enter the server's public HTTPS URL. CLI: `smithery mcp publish "https://your-server.com/mcp" -n @your-org/your-server`.
- Local stdio servers: build a `.mcpb` bundle and run `smithery mcp publish ./server.mcpb -n your-org/your-server`.
- Remote servers must use Streamable HTTP. If auth is required, support OAuth and return 401 (not 403) for unauthenticated requests so discovery works.
- Smithery scans the server for tools, prompts and resources. If the scan fails, allow the `SmitheryBot/1.0` user agent or serve a static card at `/.well-known/mcp/server-card.json`.
- After publishing, the server's Settings, Verification page has an official-vendor verification checklist.
- Listing links to the repository and website carried `rel="noopener noreferrer"` with no nofollow on the Brave Search listing. A second listing (Gmail) had no outbound product link, so only one sample measured. No meta robots tag was found on the page.
- GitHub-based publishing and account sign-in methods were not established from the docs read.
- Research only; no account created or listing submitted.
