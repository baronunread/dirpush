# Official MCP Registry

- Metadata-only registry, in preview. Publish with the `mcp-publisher` CLI (`init`, `login`, `publish`); there is no web submission form.
- Steps: add ownership proof to the package, publish the package to its public registry, write `server.json` (`name` must match the proof), `mcp-publisher login github` (device code flow), then `mcp-publisher publish`. Verify with `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=<name>"`.
- Namespace: GitHub login means `io.github.<user-or-org>/*`. A domain needs DNS TXT or an HTTP file at `/.well-known/mcp-registry-auth` and the reversed-domain name, for example `com.example/*`.
- Package types: npm (`mcpName` in package.json), PyPI, NuGet and Cargo (`mcp-name: <name>` in the README; crates.io strips HTML comments so it must be visible text), OCI image (label `io.modelcontextprotocol.server.name`; Docker Hub, GHCR and a few other registries), MCPB (GitHub or GitLab release URL containing "mcp", plus `fileSha256`). Remote servers use `remotes` with a public URL, Streamable HTTP preferred.
- Private servers are not supported.
- Downstream: the official docs say aggregators and marketplaces pull from this registry (roughly hourly). PulseMCP says it picks up official registry entries automatically. GitHub's MCP registry (github.com/mcp) is described by a GitHub blog post as a separate surface where inclusion was requested by emailing partnerships@github.com after publishing; the current process was not confirmed from an official GitHub page. VS Code reading from it was not confirmed here.
- Listing page has no per-server pages. The search page renders repository and website links in the browser with no rel attribute in its template; link value is not measured.
- Do not store the private key, device codes or tokens in files or logs.
- Research only; no account created or listing submitted.
