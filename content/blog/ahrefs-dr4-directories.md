---
title: Ahrefs DR4 and startup directories: the median dropped from 42 to 23
description: We measured 372 startup, SaaS and AI directories on Ahrefs' old and new Domain Rating. Launch boards lost a median of 23 points. Here's who held up, and which free dofollow directories are still strong.
h1: What Ahrefs DR4 did to startup directories
date: 2026-11-06
hubs: dofollow, free-dofollow, launch-sites
---

On November 5, Ahrefs published a preview of DR4, a new Domain Rating model. It replaces the current one, DR3, on December 1, 2026. Two things change:

1. **Subdomains get their own rating.** Before, `tools.example.org` had the same DR as `example.org`. Now it's rated on its own links.
2. **Fewer sites count.** The pool of domains whose links affect DR is about half what it was, around 132 million. Links from sites outside that pool stop adding to anyone's DR.

We track 514 directories and had DR3 readings for 372 of them, so we measured all of them again on DR4 the day after the announcement. These are preview numbers. Ahrefs may still adjust the model before December 1, and we'll measure again then.

## The short version

| | DR3 | DR4 |
|---|---|---|
| Median DR | 42.5 | 23 |
| Directories with DR 50 or more | 152 | 67 |
| Directories with DR 70 or more | 59 | 28 |
| Directories under DR 10 | 55 | 139 |
| Followed, indexed links with DR 50 or more | 84 | 31 |

302 of the 372 directories went down, 150 of them by 20 points or more. 19 stayed the same and 51 went up.

## Launch boards took the biggest hit

| Kind of directory | Directories | Median DR3 | Median DR4 |
|---|---|---|---|
| Listing directories | 266 | 40.5 | 26 |
| Launch boards | 95 | 44 | 11 |
| MCP registries | 8 | 59 | 40 |

A launch board ranks new products by day or week. Many of them got their DR from each other: badge-for-listing deals, "featured on" links, and the same few hundred makers listing on all of them. If those linking sites fell out of Ahrefs' pool, that's exactly the DR that disappears.

Some examples, DR3 to DR4:

| Directory | DR3 | DR4 |
|---|---|---|
| [Product Watch](/directories/productwatch/) | 72 | 20 |
| [KittyLaunch](/directories/kittylaunch/) | 65 | 27 |
| [LaunchClash](/directories/launchclash/) | 51 | 5 |
| [ScrollLaunch](/directories/scrolllaunch/) | 73 | 30 |
| [NoonLaunch](/directories/noonlaunch/) | 56 | 5 |
| [LetsLaunch](/directories/letslaunch/) | 51 | 1 |
| [LaunchAF](/directories/launchaf/) | 52 | 0 |

The boards with a real audience held up better: [Product Hunt](/directories/product-hunt/) stayed at 91, [TinyLaunch](/directories/tinylaunch/) went from 74 to 52 and [Microlaunch](/directories/microlaunch/) from 64 to 49.

## The big sites barely moved

Of the 15 directories that had DR 80 or more, 9 lost fewer than 10 points: [SourceForge](/directories/sourceforge/) 93 to 92, [Indie Hackers](/directories/indiehackers/) 82 to 81, [AlternativeTo](/directories/alternativeto/) 81 to 81, [SaaSHub](/directories/saashub/) 80 to 76. [TrustRadius](/directories/trustradius/) went up, 85 to 87.

The drops were biggest in the middle. Directories that started between 50 and 70 went from a median of 59 to 34. Those that started at 70 or more went from 76 to 60. Those are the sites whose DR most likely came from many small sites rather than a few big ones.

## Subdomains are rated on their own

Twelve of our directories live on a subdomain. Under DR3 they borrowed the main domain's rating:

| Directory | DR3 | DR4 |
|---|---|---|
| [OpenResources](/directories/openresources/) (tools.us.org) | 87 | 49 |
| [Official MCP Registry](/directories/official-mcp-registry/) (registry.modelcontextprotocol.io) | 91 | 69 |
| [Launch Llama](/directories/launchllama/) (tools.launchllama.co) | 73 | 30 |
| [We Are Founders](/directories/we-are-founders/) (directory.wearefounders.uk) | 48 | 0 |
| [Developers Digest MCP](/directories/developers-digest-mcp/) (mcp.developersdigest.tech) | 56 | 0 |

OpenResources was the strongest free, dofollow directory in our [link study](/blog/directory-link-study/) at 87. On DR4 it's 49. It still gives a followed link, but it no longer stands out.

[Docker MCP Catalog](/directories/docker-mcp-catalog/) (hub.docker.com) is the other way round: DR 91 on its own.

## The strongest free, followed links on DR4

These serve a followed link on the listings we read, their listing pages are indexed, and they have a free listing:

| Directory | DR4 | DR3 | Good for |
|---|---|---|---|
| [Docker MCP Catalog](/directories/docker-mcp-catalog/) | 91 | - | MCP servers |
| [Cursor Marketplace](/directories/cursor-marketplace/) | 88 | - | Cursor plugins |
| [TrustRadius](/directories/trustradius/) | 87 | 85 | B2B software with reviews |
| [StackShare](/directories/stackshare/) | 81 | - | Developer tools |
| [Website Rating](/directories/website-rating/) | 81 | 74 | Any website |
| [There's An AI For That](/directories/theresanaiforthat/) | 73 | 77 | AI tools |
| [Smithery](/directories/smithery/) | 73 | - | MCP servers |
| [Spotsaas](/directories/spotsaas/) | 70 | 66 | SaaS |
| [FutureTools](/directories/futuretools/) | 65 | 69 | AI tools |
| [LibHunt](/directories/libhunt/) | 62 | 66 | Open source |

A dash means we added the directory after our last DR3 run.

Most of these are places where your product would be listed anyway because it belongs there: developer platforms, review sites, category directories with real visitors. Few are launch boards. All are in the [free and dofollow list](/directories/free-dofollow/), which is now sorted by DR4.

## What this means if you're submitting

- **Your own DR will probably move on December 1.** If your links come from launch boards and small directories, expect it to go down even though nothing about your site changed. Compare DR4 to DR4, not to your old DR3 numbers. dirpush keeps the two apart for that reason.
- **Fewer directories, chosen better.** The case for submitting to 300 launch boards was already weak. On DR4 most of them count for very little. Twenty directories in your category, with real visitors and followed links, are worth more.
- **DR was always Ahrefs' estimate.** Google doesn't use it. Ahrefs says DR4 matches Google rankings better than DR3 did; we haven't tested that. The link type and whether listing pages are indexed matter more than any third-party score, and you can see both on every [directory page](/directories/).

## How we measured

On November 6, 2026 we asked Ahrefs' free Domain Rating API for every directory in our registry, once with the DR3 model and once with DR4. 372 directories have both readings; 135 more only have a DR4 reading, mostly ones we added recently. Lists hosted on GitHub are left out because they'd only show GitHub's rating. Link types and `noindex` come from our own reading of real listing pages between September 27 and November 3. Every number here is on the directory's page, and the [dirpush](/directory-submission/) registry is open source.
