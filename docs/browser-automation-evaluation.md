# Browser automation options for local Dirpush

Research date: 2026-10-15
Status: documentation comparison, not an installed or benchmarked integration

## Requirements

Use the owner's existing signed-in Chrome without a special debug launch; upload approved local product images repeatedly without downloading each time; continue a queue with durable checkpoints; handle supported CAPTCHA challenges where the client/service permits it; retain Claude and ChatGPT compatibility. A new browser with copied sessions and a cloud browser are different products and must be labelled accordingly.

No vendor documentation establishes uninterrupted success across arbitrary directories. Login/MFA, passkeys, site-side rejections, challenge variations, stale browser connections and ambiguous form submissions remain failure modes. Reliable continuation means recording the block, processing independent eligible targets and resuming safely, rather than claiming nothing ever fails.

## Shortlist and recommendation

| Option | Existing normal Chrome | Images | CAPTCHA evidence | Fit |
| --- | --- | --- | --- | --- |
| rtrvr.ai extension + MCP/API | Yes; extension dispatches to an online device | File inputs and file-to-page actions documented; MCP input workflow can stage assets in vendor storage | Built-in solve_captcha action documented, success/coverage unverified | First candidate to test against the exact browser + upload + CAPTCHA requirement; hosted dependency |
| Nanobrowser | Yes; Chrome/Edge extension | File attachments and page upload documented | No automatic solver established in reviewed docs | Strong open-source extension candidate; uses chosen model/API/local model, not the ChatGPT chat UI |
| Native Claude / ChatGPT browser extensions | Yes | Local upload supported with client-specific permissions | Human/client confirmation constraints; not an unattended CAPTCHA guarantee | First-party baseline and cleanest use of existing subscriptions/clients |
| BrowserOS neo | Separate agent browser; import from Chrome is not controlling Chrome | Official skill describes local uploads | Skill explicitly requests human help for CAPTCHA | Good local MCP alternative if a second browser is acceptable |
| Browser Use / Browser Harness | Real Chrome possible, but CDP/remote-debugging authorization remains | Local uploads advertised | Cloud offering advertises CAPTCHA solving; not established for the existing local session | Does not remove the owner's debugging objection |
| Skyvern | Self-hosted existing-Chrome attachment documented; setup needs validation | File upload SDK documented | Vendor documents common-type solving and manual interaction fallback | Workflow-engine option with more setup; local-session CAPTCHA parity unproven |

Conductor wraps coding agents and does not change any row's CAPTCHA, upload or browser transport limitations. Supporting an MCP or OpenAI model is not automatically support for a ChatGPT desktop/browser conversation; actual tool discovery, browser access and upload must be verified per client.

## Why rtrvr is the first experiment, not a proven winner

Its official MCP docs explicitly describe controlling the user's signed-in Chrome through an extension, agent runs and workflow replay. The normal API/MCP route requires a subscription/credits and is cloud-mediated; it is not an all-local engine. Local files may be staged to its storage for agent inputs. Pin the requested extension/device and fail if unavailable rather than silently moving the run into a cloud browser. Reusing a staged approved asset is a possible design, but its lifetime, access scope and reuse behavior require testing.

The official tool list includes upload_file and solve_captcha page actions. That establishes a supported action name, not CAPTCHA coverage, accuracy or compatibility with every challenge. CapSolver's separate integration article explicitly says its included test is mocked and that a live session/page still needs validation; its new-headless-page operation is a different browser session. Do not infer that an external solver result was accepted by the directory or that adding that service is necessary before testing the built-in action.

## Open-source local alternative

Nanobrowser avoids a special browser launch and supports long chats, multiple providers and file upload. It is a browser-side agent with model/API/local-model configuration. That can support OpenAI and Anthropic models, but it does not mean users run it inside their existing ChatGPT and Claude conversations or reuse those subscription allowances. CAPTCHA handling and a suitable local Dirpush integration remain separate gaps. Its current source also describes browser-stored provider keys, which conflicts with this project's existing non-file-secret preference; assess credential handling before adopting it rather than silently adding keys to files/browser storage.

BrowserOS neo is deliberately a second agent browser. Its official guidance hands CAPTCHA and other human-only steps back to the user. It may simplify persistent agent sessions, but it does not satisfy the strict existing-Chrome requirement or automatic CAPTCHA requirement.

## Proof before migration or purchase

Use the same tasks and approved test images for rtrvr and the native first-party baseline. Evaluate Nanobrowser only if open-source/local infrastructure is the higher priority. Do not install all six options or build a new browser engine.

1. Prove the correct existing Chrome profile and target tab are used, with no debug launch, imported profile or silent cloud fallback.
2. Attach the same approved logo and screenshot to several controlled forms, verify image previews, and confirm no repeated Desktop downloads. Verify where the bytes are staged and whether subsequent uploads reuse them.
3. Test supported CAPTCHA handling on an authorized test page, record exact challenge types, attempts, time and accepted page state. Follow the controlling client's action-time confirmation requirements. Unsupported, identity-linked or unresolved challenges become bounded human handoffs; do not disable client safeguards.
4. Run multiple independent fixture targets from one start, including one blocked item. Confirm the rest continue without repeated prompts and every outcome is checkpointed.
5. Interrupt the agent/browser and resume from a new chat. Inspect uncertain prior submissions before retry; never mistake replay for idempotency.
6. Test both Claude and ChatGPT desktop integration separately. Codex in Conductor is an additional target, not proof of ChatGPT UI compatibility.
7. Record completed tasks, human interventions, failed/repeated uploads, reconnects, unsupported challenges, active time and actual cost. Keep provider claims separate from measured results.

No actual directory submission, provider purchase, browser permission change or CAPTCHA solving occurred during this research. Existing launch policy still requires a human step for real challenges; changing a future runner's capabilities requires explicit scoped policy design and cannot override the client's own restrictions.

## Sources

- [rtrvr MCP/browser API](https://rtrvr.ai/docs/mcp): signed-in Chrome, device targeting, paid API/MCP access, file inputs and replay.
- [rtrvr tool calling](https://rtrvr.ai/docs/tool-calling): browser actions include file upload and solve_captcha.
- [CapSolver integration analysis](https://www.capsolver.com/blog/ai/rtrvr-capsolver-mcp-browser-agent): mocked test, session-sensitive acceptance and separate-headless-session limitation.
- [Nanobrowser source and documentation](https://github.com/nanobrowser/nanobrowser): extension execution, model providers, uploads and long-task behavior.
- [BrowserOS source](https://github.com/browseros-ai/BrowserOS) and [official agent skill](https://github.com/browseros-ai/BrowserOS/blob/main/skills/browseros-neo/SKILL.md): separate agent browser and human handoffs.
- [Browser Harness source](https://github.com/browser-use/browser-harness) and [vendor overview](https://browser-use.com/browser-harness): remote-debugging setup, upload capability and distinction from cloud CAPTCHA offering.
- [Skyvern source](https://github.com/Skyvern-AI/skyvern) and [vendor FAQ source](https://github.com/Skyvern-AI/skyvern/blob/main/docs/developers/debugging/faq.mdx): file upload, existing Chrome and CAPTCHA limitations. FAQ source was search-index readable but direct retrieval failed, so verify the local setup before relying on it.
- [Claude Chrome documentation](https://code.claude.com/docs/en/chrome) and [OpenAI Chrome documentation](https://learn.chatgpt.com/docs/chrome-extension): first-party upload/browser baseline.
