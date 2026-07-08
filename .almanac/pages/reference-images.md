---
title: Reference Images
summary: Reference-photo grounding is best-effort and provider-chained, so still generation can use real images when possible without failing the whole scene when image search breaks.
topics: [stack, generation]
sources:
  - id: home-page
    type: file
    path: app/page.tsx
    note: Shows that the current client always requests generated stills rather than the archival-photo mode.
  - id: refimages-lib
    type: file
    path: lib/refimages.ts
    note: Defines the provider chain, download filters, and logging for reference-photo lookup.
  - id: still-route
    type: file
    path: app/api/still/route.ts
    note: Shows how still generation uses refs for generated and real-photo modes.
  - id: clip-route
    type: file
    path: app/api/clip/route.ts
    note: Shows how the direct clip route can still fetch references when it must generate the start frame server-side.
  - id: env-example
    type: file
    path: .env.local.example
    note: Documents the optional Google CSE and SerpAPI credentials.
status: active
verified: 2026-07-07
---

[[reference-images]] is the grounding layer between hometown research and image generation. The client never calls it directly. [[app/api/still/route.ts]] and the legacy branch in [[app/api/clip/route.ts]] call `fetchReferenceImages()` when they have a `referenceQuery`.[@still-route][@clip-route]

## Provider order

`fetchReferenceImages()` tries providers in a fixed order and returns as soon as one yields usable images: DuckDuckGo, Bing Images HTML scrape, optional Google Programmable Search when both CSE variables are present, and optional SerpAPI when `SERPAPI_KEY` is set.[@refimages-lib][@env-example]

This is intentionally best-effort. Provider failure logs a warning and falls through to the next provider. Empty results are not fatal and simply mean the scene will render ungrounded.[@refimages-lib]

## Download filters

The helper downloads a generous batch in parallel, up to `count * 3` candidates and capped at 12 URLs, then keeps the first successful raster images in result order.[@refimages-lib]

Only JPEG, PNG, WebP, HEIC, and HEIF are accepted. SVG and oversized or empty files are dropped before the image generator sees them.[@refimages-lib]

## How refs are used

Generated stills pass up to three reference images into [[gemini]]. `mode: "real"` in [[app/api/still/route.ts]] asks for up to six references, picks the largest file by base64 length as the best archival-photo candidate, and turns that photo into a full-screen 9:16 slide through [[video-stitching]].[@still-route]

The current client never requests `mode: "real"`. `runPipeline()` always asks for generated stills, so the archival-photo branch is preserved functionality, not active UI behavior.[@home-page]

Related pages: [[gemini]], [[generation-pipeline]], [[video-stitching]].
