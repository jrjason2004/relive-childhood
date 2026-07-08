---
title: Reference Image Grounding
summary: Reference Image Grounding records the production failure modes and observability around real-photo grounding, especially why Bing is the practical production provider even though DuckDuckGo is first in the code path.
topics:
  - generation
  - incidents
  - stack
sources:
  - id: refimages
    type: file
    path: lib/refimages.ts
    note: Migrated from legacy files.
  - id: route
    type: file
    path: app/api/still/route.ts
    note: Migrated from legacy files.
  - id: gemini
    type: file
    path: lib/gemini.ts
    note: Migrated from legacy files.
status: active
verified: 2026-07-07
---

# Reference image grounding

Nano Banana stills are grounded with real photos of the researched local places so signage and architecture match reality. [[lib/refimages.ts]] fetches them through a provider chain where the first provider that yields images wins.[@refimages]

1. **DuckDuckGo images** via the unofficial `vqd` plus `i.js` flow. This worked from the developer machine and failed from Vercel with `DDG vqd token not found`, which is why the fallback chain matters.[@refimages]
2. **Bing Images HTML scrape** via `murl` extraction. This is the practical production fallback when DuckDuckGo is blocked.[@refimages]
3. **Google Programmable Search** only when `GOOGLE_CSE_KEY` and `GOOGLE_CSE_CX` are set.[@refimages]
4. **SerpAPI** only when `SERPAPI_KEY` is set.[@refimages]

Every provider throws or returns `[]`; `fetchReferenceImages()` degrades to ungrounded generation, so a run never breaks over references.[@refimages]

**Every candidate is verified before it reaches Nano Banana.** The scrapers sometimes "succeed" with confident garbage: a Bing scrape for "Ashburn Farm Market Virginia 1990s storefront" returned 24 tiles of Slovakia (Bratislava castle, country maps) with a clean 200, and those composited straight into generated scenes as clipart and wrong-country maps. `filterRelevantRefs()` in [[lib/gemini.ts]] sends the candidate batch plus the query to gemini-2.5-flash (temperature 0, thinking budget 0) and keeps only real photographs that plausibly depict the subject; cartoons, maps, logos, and wrong-place photos are dropped. [[app/api/still/route.ts]] fetches 6 candidates and keeps up to 3 verified. On filter failure it returns zero refs — a prompt-only scene beats a garbage-grounded one. Logged as `[gemini:reffilter]` with candidate/kept counts.[@gemini][@route]

The incident observability hooks remain in code. [[app/api/still/route.ts]] sets an `x-ref-count` response header, [[lib/refimages.ts]] logs `provider_failed`, `provider_result`, and `no_refs`, and [[lib/gemini.ts]] logs the reference count and inline image-part count before it calls Nano Banana.[@route][@refimages][@gemini]

Candidate URLs are downloaded in a parallel batch, filtered to raster formats Nano Banana accepts, and capped at 8 MB.[@refimages]

[[scripts/fetch-polaroids.mjs]] reuses the DuckDuckGo approach with an extra stock-site blocklist for the travel tunnel; see [[travel-screen-performance]].[@refimages]
