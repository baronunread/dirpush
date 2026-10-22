# Fazier

- Sign up with email or Google.
- Free launch at https://fazier.com/launch, three requirements before "Verify Badge" enables:
  1. 3 thoughtful, specific public comments on other Fazier launches ("Avoid generic comments like 'Looks cool'"). These post in the human's name: draft them, get the human's approval of the exact text, then post. The counter on /launch shows x/3.
  2. Product link: the bare homepage URL (e.g. https://example.com). The badge href is built from it: `https://fazier.com/launches/<hostname>`.
  3. The Fazier badge image in the served homepage HTML (the checklist asks for the badge; a text link alone was not tested): `<a href="https://fazier.com/launches/<hostname>" target="_blank"><img src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&theme=light" width=120 alt="Fazier badge" /></a>` (badge_type launched|featured, theme light|neutral|dark; the double slash is Fazier's). The site's CSP must allow images from fazier.com. Then tick the conditions box (badge visible, English site, DR > 0, 3 comments) and click "Verify Badge".
- After verification: logo and gallery (at least 3 images), pricing, makers, competitors, launch date. The date input ignores typed keys: set it with the native value setter plus input/change events. The earliest allowed date is about a month out; launches go live at 12:00 AM Pacific.
- Topic search: ref fill/click loses focus to another field; mouse-click the search box, then `keyboard type`.
- "Schedule launch" opens /premium?slug=… with "Premium Product ($49)" pre-checked: uncheck it and continue; the free listing needs no payment.
- Listing at https://fazier.com/launches/{slug}. May be featured on homepage.
- Paid tiers offer: Lite ($29-39) - permanent listing, no backlink, featured; Premium ($49-69) - 15 days promo, guaranteed backlink; Super ($99-139) - top homepage placement for 15 days.
