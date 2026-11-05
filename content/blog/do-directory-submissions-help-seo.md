---
title: Do directory submissions still help SEO in 2026?
description: Some do, most don't, and blasting 500 directories can hurt. What a listing can do for a new site, what Google says about directories, and how to pick the ones worth it.
date: 2026-11-05
hubs: free, saas
---

Short answer: a few well-chosen directory listings help a new site, and mass submission doesn't. A listing helps when the page is indexed, the link is followed, and the directory is about what you make. Most directories fail at least one of those.

We measure 514 startup, SaaS and AI directories for [dirpush](/), so here's what we've learned, with numbers.

## What Google says about directories

Google doesn't ban directory links. Its spam policies name "low-quality directory or bookmark site links" as an example of link spam, along with "excessive link exchanges". The key word is low-quality: a directory that exists only to sell links, accepts anything, and has no visitors of its own.

Two other details matter:

- **`nofollow`, `ugc` and `sponsored` are hints.** Since 2020 Google may use them for crawling and indexing, but you shouldn't expect ranking value from them.
- **A `noindex` page passes nothing useful.** If the listing page isn't in Google's index, its link doesn't matter.

So the question isn't "do directories work". It's "is this listing an indexed page, on a real site, with a followed link, about my kind of product".

## What a good listing gives a new site

### A followed link from a relevant page

For a domain that's a few weeks old, the first links are the hardest to get. Nobody writes about a product nobody has heard of yet. A directory in your category with a followed link from an indexed page is one of the few links you can get on day one. In our registry 290 of 514 directories serve a followed link; 52 do it for free with no conditions.

### Discovery

Search engines find new sites by following links. A brand-new domain with zero links can sit for weeks before it's crawled properly. A handful of listings on sites Google crawls often speeds that up. This works even for nofollowed links, since Google may use them for discovery.

### Pages that rank for your name

Big directories rank well. Within weeks of launching, searches for "<your product>", "<your product> alternatives" and "<your product> reviews" often show directory pages: SaaSHub, AlternativeTo, Product Hunt. You'd rather those results describe you correctly. This is the main reason to list on big sites even when their links are nofollow.

### Being read by AI assistants

When someone asks ChatGPT or Perplexity for "the best tools for X", the answer is built from pages that list and compare tools. Directory and review pages are often among them. A product that appears in many of these lists is more likely to show up in the answer. This is harder to measure than a backlink, but it's a real reason to be listed where people compare products.

### Launch-day visitors

Launch boards, from Product Hunt to the smaller ones, can send real traffic for a day or two. It drops off fast, but early users and feedback are worth more than the link.

## What doesn't work

- **Submitting to hundreds of junk directories.** The "500 directories for $49" services mostly submit to sites with no visitors, no indexed listings, or both. At best that's wasted money. At worst it's the "low-quality directory links" pattern Google describes.
- **Counting nofollow links as backlinks.** One in four directories we measured gives no followed link on any listing. That includes many of the biggest: Product Hunt marks links `ugc`; Indie Hackers, SaaSHub and SourceForge use `nofollow`.
- **Trusting "dofollow" claims.** Of 125 directories that say their links are dofollow, 75 actually give every listing one. [The full numbers are here](/blog/directory-link-study/).
- **Trading badges everywhere.** 151 directories are free only if you link back to them. A few are fine. Dozens of footer badges look like a link exchange.

## Five checks before you submit

1. **Is the listing page indexed?** Search `site:directory.com "some product name"`, or view the source of a listing and look for `noindex`.
2. **Is the link followed?** In the source, find the link to the product and look at its `rel` attribute. No `nofollow`, `ugc` or `sponsored` means it's followed.
3. **Is the site real?** It should get search traffic of its own. Domain Rating is a rough proxy: in our data the median is 43.
4. **Is it about your kind of product?** A link from an AI tools directory means more for an AI product than a link from a general list.
5. **What does it cost?** Money, a badge on your site, or a queue that can take months. One directory's free queue was about five years long when we checked.

Our [directory pages](/directories/) answer the first four for every directory we track, measured on real listings.

## How many is enough?

There's no magic number. For a new SaaS, 20 to 50 well-chosen directories cover the free followed links in your category, the big profiles that rank for your name, and a launch board or two. Past that the returns drop quickly, and your time is better spent on things directories can't give you: content people link to, integrations, and customers who mention you.

If you want a starting order, we wrote one: [the first directories to submit a new SaaS to](/blog/first-directories-for-a-new-saas/).
