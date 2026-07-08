---
topics:
  - flows
  - incidents
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

---

# Reference image grounding

Nano Banana stills are grounded with real photos of the researched local places so signage and architecture match reality. [[lib/refimages.ts]] fetches them via a keyless provider chain, first provider that yields images wins:

1. **DuckDuckGo images** (unofficial vqd-token + `i.js` endpoints) — works from the Mac, **fails on Vercel with `DDG vqd token not found`** (DDG blocks datacenter IPs).
2. **Bing Images HTML scrape** (`murl` extraction from the search page) — the provider that actually wins in production.
3. Google Programmable Search — official, free 100 queries/day, only if `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` are set (currently unset in prod).
4. SerpAPI — legacy paid scrape, only if `SERPAPI_KEY` is set. Credits ran out 2026-07-07 and Jason won't pay; do not rely on it.

Every provider throws or returns `[]`; `fetchReferenceImages` degrades to ungrounded generation, so a run never breaks over references. That fail-soft behavior is also how grounding silently broke in production: `/api/still` returned `x-ref-count: 0` for weeks-equivalent of runs until the Bing fallback was added. The incident diagnostics remain: `/api/still` sets an `x-ref-count` response header, [[lib/refimages.ts]] logs `[refimages] provider_failed` / `provider_result` / `no_refs`, and [[lib/gemini.ts]] logs `[gemini:image] request` with `refCount` and `inlineImageParts` before the Nano Banana call. To confirm grounding on a live run, watch production logs for `inlineImageParts: 3` per scene.

Candidate URLs are downloaded in a parallel batch (serial downloads burned up to 8s per dead URL), filtered to raster formats Nano Banana accepts (jpeg/png/webp/heic/heif), capped at 8MB.

The predecessor module `lib/serpapi.ts` was deleted when the chain replaced it. `scripts/fetch-polaroids.mjs` reuses the DDG approach with an added stock-site blocklist (alamy/getty/shutterstock etc. watermark their previews) — see [[travel-screen-performance]] for that library.
