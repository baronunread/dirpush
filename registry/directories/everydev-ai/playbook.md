# EveryDev.ai

- 'Create' nav link and /create/tool (also referenced as /tools/submit, which 404s -- use /create/tool) both redirect to /sign-in?redirectTo=/create/tool.
- Sign-in offers only 'Continue with GitHub' or 'Continue with Google' -- there is no email/password path, so form fields stay unseen until OAuth login (badge gate not visible past login).
- Paid upsells (Featured Tool Listing which includes a 'Featured' badge, Newsletter Sponsorship) are contact-us only via /advertise, no published prices -- unrelated to the free base submission, and no badge is required for a plain free listing.
- Live listings sit at https://www.everydev.ai/tools/{slug} (verified via /tools/yello).