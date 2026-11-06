---
title: Dofollow or not? We checked the links on 514 startup directories
description: 125 directories say their links are dofollow. 75 of them are. What we found reading real listing pages on 514 startup, SaaS and AI directories.
date: 2026-11-05
updated: 2026-11-06
hubs: dofollow, free-dofollow
---

Most lists of "dofollow directories" copy what each directory says about itself. We wanted to know what the listing pages actually serve, so we opened them and read the HTML.

Across 514 startup, SaaS, AI and developer-tool directories, 290 serve a followed link to the products they list. That's 56%. But of the 125 directories that advertise dofollow links, only 75 give every listing one. The rest give a followed link only to paid or featured listings, or don't give one at all.

## How we measured

For each directory we found real listing pages, products other people had submitted, and read the `rel` attribute on the link from the listing to the product's site.

- **485 directories** were measured on sample listings, usually several pages each.
- **19** were measured on a listing we made ourselves.
- **7** are GitHub "awesome" lists. GitHub adds `nofollow` to every link in a README, so those are nofollow by rule.
- **3** couldn't be measured: one shows no listing pages, one hides them behind a bot check, one doesn't link out with a normal link.

We also checked whether listing pages carry a `noindex` tag, which keeps them out of search results and makes the link worthless for ranking either way. For 507 directories we have an Ahrefs Domain Rating (DR), on DR4, the model that replaces DR3 on December 1, 2026, measured November 6. The link measurements ran from September 27 to November 3, 2026.

## The numbers

| Link on the listing page | Directories | Share |
|---|---|---|
| Dofollow | 290 | 56% |
| Mixed (followed only for some listings) | 96 | 19% |
| Nofollow | 105 | 20% |
| Sponsored | 13 | 3% |
| UGC | 7 | 1% |
| Not measurable | 3 | 1% |

Since 2019, Google treats `nofollow`, `ugc` and `sponsored` as hints rather than strict rules. In practice none of the three is a link you should count on for rankings. So 125 directories, about one in four, give no ranking signal on any listing.

"Mixed" usually means the free listing gets `nofollow` and the paid or featured one doesn't. Some directories also follow links only for a weekly winner, or only after you add their badge to your site.

## What directories say vs. what they serve

151 directories say something about their links on their own pages: on the submit form, the pricing page or the FAQ. 125 of them say dofollow. Here's how those claims held up:

| Directory says "dofollow" | Directories |
|---|---|
| Every listing we read was dofollow | 75 |
| Only some listings were (usually paid ones) | 32 |
| Listings were nofollow or sponsored | 18 |

Some of the 18 are not small sites:

| Directory | DR | Says | We read |
|---|---|---|---|
| [Tiny Startups](/directories/tinystartups/) | 74 | dofollow | nofollow |
| [ShowMySites](/directories/showmysites/) | 64 | dofollow | nofollow |
| [StartupBase](/directories/startupbase/) | 46 | dofollow | nofollow |
| [OpenHunts](/directories/openhunts/) | 42 | dofollow | nofollow |
| [Huzzler](/directories/huzzler/) | 29 | dofollow | nofollow |
| [Days Launch](/directories/dayslaunch/) | 23 | dofollow | nofollow |

This doesn't have to be dishonest. A directory may have changed its markup since writing its FAQ, or may mean that paid listings are dofollow. But if you're choosing where to spend an afternoon, the page is what counts, not the FAQ.

It goes the other way too: 9 directories say their links are nofollow, and the listings we read were dofollow.

## "Free" usually has a condition

Only 100 of the 514 directories are free with no strings. 166 are freemium: there's a free listing, and paid upgrades. 78 are paid only.

The other 170 are free *if*. Most of the time (151 directories) the condition is a badge or a link back to the directory from your site, often in your footer, sometimes checked before your listing goes live. Others make free listings wait in a queue that runs from weeks to, in one case, about five years.

Badges are worth a second thought. Google's spam policies list "excessive link exchanges" and "low-quality directory or bookmark site links" as examples of link spam. One badge on your site won't get you in trouble. Fifty badges in your footer, each traded for a directory link, look a lot like a link scheme. If you do accept a badge, put it on a page you don't mind it being on, and keep the count low.

## A high DR doesn't mean a followed link

You might expect the biggest directories to give the best links. It's roughly the opposite:

| Link type | Median DR |
|---|---|
| Dofollow | 23 |
| Nofollow | 15 |
| Mixed | 29 |
| Sponsored | 37 |
| UGC | 64 |

The highest-rated sites protect themselves from spam submissions. Product Hunt (DR 91) marks product links `ugc`. Indie Hackers (81), SaaSHub (76) and SourceForge's software directory (92) use `nofollow`. These sites are still worth being on, for the visitors, for how often their pages rank for "<product> alternatives" searches, and because AI assistants read them. They just won't pass ranking signal through the link.

The free, dofollow, high-DR directory exists, but there aren't many. Of 514, 52 are free with no conditions and serve a followed link. 8 of those have a DR of 50 or more: [Docker MCP Catalog](/directories/docker-mcp-catalog/) (91), [Cursor Marketplace](/directories/cursor-marketplace/) (88), [StackShare](/directories/stackshare/) (81), [LibHunt](/directories/libhunt/) (62) and [Betabound](/directories/betabound/) (55) are among them. Under the old DR3 model the top of that list was [OpenResources](/directories/openresources/) at 87; on DR4, which rates its subdomain on its own, it's 49.

## Accounts and bot checks

Submitting isn't just filling a form. 329 directories (64%) want an account first, through email, Google or GitHub. Bot checks are less common than you'd think: 449 directories showed none on their submit flow. Of the rest, 25 use Cloudflare Turnstile, 7 reCAPTCHA, 4 hCaptcha and 5 ask an arithmetic question.

## What we'd do with this

1. **Start with the [free and dofollow directories](/directories/free-dofollow/).** 52 are free outright and 90 more have a free tier next to paid upgrades. They cost nothing and pass a followed link.
2. **Don't trust "dofollow" in a directory's copy.** Open a listing, view source, and look at the link. Or look it up: every [directory page](/directories/) here shows what was measured and when.
3. **Still list on the big nofollow sites.** They bring visitors and get read by people and AI assistants. Just don't count them as backlinks.
4. **Be choosy with badges.** Accept a few for directories you'd want to be associated with anyway.
5. **Skip noindexed listings for SEO.** 10 directories serve listing pages with `noindex`, which keeps the page out of search results whatever the link says.

## The data

The full dataset is public: [registry.json](https://dirpush.com/registry.json), licensed CC BY 4.0. It has every directory's cost, sign-in methods, bot check, the fields its submit form asks for, the measured link type, how it was measured and when. Links are re-measured monthly, so numbers on the [directory pages](/directories/) may have moved since this post.
