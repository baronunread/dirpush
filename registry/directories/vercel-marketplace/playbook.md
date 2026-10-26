# Vercel Marketplace

Two very different paths. Pick based on the product.

## Connectable account integration (open to any developer)
- Vercel dashboard, team, Integrations, Integrations Console, Create. Fill the Create Integration form in full (name, slug, legal developer name, contact and public support email, logo, category, website, docs, EULA and privacy URLs, overview, 1-8 feature images at 16:9, redirect URL, scopes) and accept Vercel's terms.
- After submission it gets a **Community** badge: installable via your own site or a Deploy Button, but not shown in the public marketplace.
- To be listed publicly: at least 500 active installations, pass the approval checklist, then email integrations@vercel.com asking for review.
- You are solely responsible for user support, at or above Vercel's own response levels.

## Native integration (partner-only in practice)
- Requires the Marketplace provider program: "Become a Provider" form (company name, contact, email, website) at vercel.com/marketplace/program; Vercel contacts you. Eligibility, fees and revenue share are not published (not established).
- Needs an Integration API server (SSO, installation sync), billing/usage reporting through Vercel, a Marketplace template, then an email to integrations@vercel.com and a final walkthrough call. Vercel also expects `team_id` and slug shared in a shared Slack channel.

## Gotchas
- This is a SaaS/infra integration, not a place to list an MCP server or skill. For skills see `skills-sh`.
- Outbound link value on listing pages was not measurable (product link is not in the static HTML); rel is not established.
- Research only; no integration created or submitted.
