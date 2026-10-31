# ToolScout

- Open https://toolscout.ai/submit and choose Sign in to continue.
- The sign-in page offers Google or email. The submit form and its fields are visible only after signing in.
- Standard listing is free and reviewed by a human. Boost or Featured priority placement starts at $49; promoted tools are reviewed within 24–48 hours.

Real flow (verified 2026-10-26): after sign-in, a 5-step wizard: Main info (name, URL, description, category; "Let ToolScout choose" is fine), Launch plan (optional, Skip), Placement (Continue with Free), Details & extras (platform, pricing page URL, pricing tags), then "Support the community": the 5 "Visit" links on community tools must each be opened (counter 5 / 5 visited; close the extra tabs, do not press Save) before "Submit for review" enables. Cloudflare Turnstile sits on that last step and cleared on its own. Success page: /submit/success?sid=...; check /submissions.
