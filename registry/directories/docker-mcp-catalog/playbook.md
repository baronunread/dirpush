# Docker MCP Catalog

- Submit by pull request to https://github.com/docker/mcp-registry; follow https://github.com/docker/mcp-registry/blob/main/CONTRIBUTING.md.
- Local (containerized) server: needs a Dockerfile in the source repo. Fork, run `task wizard` (or `task create`), which writes `servers/<name>/server.yaml`; test by importing the generated catalog into Docker Desktop's MCP Toolkit; reset the catalog afterwards.
- Remote server: no Dockerfile; public endpoint with `streamable-http` or `sse`. Run `task remote-wizard`; the PR needs `server.yaml`, `tools.json` (always `[]`) and `readme.md` with a valid docs URL.
- Docker-built (default, no image supplied): Docker builds and hosts it under the `mcp` namespace on Docker Hub with signatures, provenance, SBOMs and automatic security updates. Self-built (`--image`): container isolation only, none of those extras.
- License must permit use by others (MIT or Apache 2 recommended; GPL is called out as not fitting).
- Declare every environment variable the server uses, or it is not configurable in the UI. If the server needs configuration before listing tools, add `tools.json`, otherwise the build step can fail and block the PR.
- Docker team reviews every PR; test credentials are shared through a form linked in the guide. Approved entries are expected live within 24 hours.
- No fee is mentioned. Listing pages on hub.docker.com/mcp link out to the server's repository and docs with plain `rel="noopener noreferrer"` (no nofollow seen, no robots meta on the sampled page).
- Not established: GitHub-account requirements beyond opening a PR; review turnaround.
- Research only; no account created or listing submitted.
