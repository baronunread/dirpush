# Registry categories and launch-list audit

Audited 2026-10-08. Type describes the submission channel; audience describes eligibility; cost remains an independent field. The Registry UI filters type and audience alongside cost. Unknown historical types remain explicitly Unclassified rather than guessed.

| Type | What belongs here |
| --- | --- |
| Software directory (`listing`) | Permanent product entry |
| Launch site (`launch_board`) | Dated launches, voting, leaderboards |
| MCP registry (`mcp_registry`) | Actual MCP server packages or endpoints |
| GitHub list (`github_list`) | Curated entries contributed through repository PRs |
| Plugin marketplace (`plugin_marketplace`) | Installable plugins or skills; bare MCP support is insufficient |
| API catalog (`api_catalog`) | Public APIs with documented access |
| llms.txt directory (`llms_directory`) | Public working llms.txt files |
| Campaign / Lead generation / Marketplace | Existing specialized commercial channels |

Use `bun launch registry list --kind mcp_registry` to inspect MCP listings. Recommendations for specialized channels require `bun launch directories recommend <product-id> --all --kind mcp_registry`. Default software recommendations exclude these channels.

## Mapping the supplied list

The post contains 38 names. Verified records store their primary sources, cost conditions, artifact requirements, and practical notes in directory YAML/playbooks. These are research records, not submissions.

| Supplied name | Registry record or remaining verification | Type |
| --- | --- | --- |
| Official MCP Registry | official-mcp-registry | MCP registry |
| Glama | glama | MCP registry |
| MCP Servers | mcpservers | MCP registry |
| AllMCPs | allmcps | MCP registry |
| MCP Market | mcp-market | MCP registry |
| MCP Directory | Exact identity ambiguous; mcpdirectory.ai intake unverified. developers-digest-mcp is a separately verified alternative, not an assumed alias. | MCP registry candidate |
| MCP Repository | mcp-repository | MCP registry |
| TensorBlock MCP | tensorblock-mcp | GitHub list |
| AI Indigo | /mcp-servers/submit requires sign-in; pricing and final gates unresolved | MCP registry candidate |
| MCP So | mcp-so; paid server submission | MCP registry |
| awesome remote mcp servers | awesome-remote-mcp-servers; contribution prerequisites recorded | GitHub list |
| awesome mcp list | awesome-mcp-list (MobinX) | GitHub list |
| awesome mcp lists | awesome-mcp-lists (collabnix) | GitHub list |
| toolsdk mcp registry | toolsdk-ai/toolsdk-mcp-registry exists; exact contribution intake unresolved | MCP/package registry candidate |
| xAI plugin marketplace | xai-plugin-marketplace; actual compatible plugin required | Plugin marketplace |
| Product Hunt | product-hunt | Launch site |
| AlternativeTo | alternativeto | Software directory |
| Better Launch | betterlaunch | Launch site |
| DanielLaunches | daniellaunches | Launch site |
| IndieTool | indietool | Software directory |
| Tinyshelf | Live tinyshelf.co /submit redirects to Google sign-in; pricing unresolved; stale DEAD verdict reset | Software directory candidate |
| Stork | stork-ai: software listing paid; separate stork-mcp: free MCP route | Software directory / MCP registry |
| Findly | findly-tools | Software directory |
| Twelve Tools | twelve-tools | Software directory |
| Turbo0 | turbo0 | Software directory |
| Noonlaunch | noonlaunch | Launch site |
| LaunchPanda | Live independent listing alongside paid submission service; final free/badge gates unresolved; stale DEAD reset | Listing/launch candidate |
| Launch Streak | Live launch leaderboard; final requirements behind auth unresolved; stale DEAD reset | Launch site candidate |
| ScrollLaunch | scrolllaunch | Launch site |
| ConfettiSaaS | confettisaas | Software directory |
| AI Directories | ai-directories; independent tool-listing route, distinct from bulk submission service | Software directory |
| Launch Llama | launchllama | Software directory |
| Acid Tools | acid-tools; badge-gated free listing corrected | Software directory |
| Claude Code plugin directory | claude-plugin-directory; compatible plugin and paid Claude plan. claude-mcp-directory records separate connector route. | Plugin marketplace / MCP registry |
| ClawHub | clawhub; actual skill or native plugin required | Plugin marketplace |
| Public APIs | public-apis; repository contribution requirements recorded | API catalog |
| llms txt Hub | llms-txt-hub | llms.txt directory |
| llms txt Site | llms-txt-site | llms.txt directory |

No SEO ranking, traffic, followed-backlink, or DR improvement is inferred from inclusion. Unresolved candidates stay out of the verified directory set. Public evidence is preserved without creating accounts to bypass authentication gates.
