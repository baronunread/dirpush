# AI Agents Directory

- Submit page (/submit-agent) requires login before any form appears - no fields, and no badge/backlink language, visible without an account.
- Login/signup is via Auth0: email+password, or 'Continue with Google'. No GitHub option despite earlier notes.
- Free tier exists (agents get a listing page at /agent/{slug}); paid 'Featured' upgrade goes through a Stripe checkout link, and a separate /sponsor page sells limited advertise slots.
- No autofetch from product URL observed pre-login.
