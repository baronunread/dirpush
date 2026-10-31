# Startups Lab

- Weekly launch board, not a permanent plain listing: new batch every Monday, live community upvoting, homepage shows 'Week NN · Live now'.
- /submit only asks for Product Name + Product URL, then 'Generate Launch Listing' runs an AI scraper to prefill tagline/category/description/logo -- review and edit before it goes live. No manual moderation queue; auto-published per schedule.
- Free tier: standard queue, launches on the next free Monday, up to 2 active free submissions per account, no guaranteed dofollow backlink (unless you land in the week's top 3 by upvotes, which grants one automatically). The free queue is long: a submission on 2026-10-26 was first given 2027-06-07, then moved to 2027-06-14. Dates can slip, so record the outcome as `pending`.
- Paid upsells: Skip the Queue ($6, guaranteed dofollow backlink + pick any Monday) and Spotlight ($29/30 days, homepage placement below hero, only 3 concurrent slots). Neither is required for a free listing.
- Account required to manage/track launches. New signups: 'Continue with Google' only (auto-creates account). A Cloudflare 'I am not a robot' check sits under the Google button on /login and keeps it disabled until it passes: hand it to the human (`work block --type captcha`). The email+password form on /login is explicitly 'EXISTING EMAIL ACCOUNTS ONLY' -- not a real signup path.
- After saving, the product is editable at https://startupslab.site/my-products/{slug}/edit.
- Listings sit at https://startupslab.site/product/{slug}. The page is public from the moment you save, before launch day (status `waiting` in the page data, with `launchDate`), so a 200 there does not mean it has launched.
