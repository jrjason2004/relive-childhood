---
title: Film Pipeline
summary: Film Pipeline is the measured end-to-end ordering contract from hometown research to clip reveal, including why scene media travels in POST bodies instead of relying on temp files between requests.
topics:
  - flows
  - generation
  - media
sources:
  - id: page
    type: file
    path: app/page.tsx
    note: Migrated from legacy files.
  - id: route
    type: file
    path: app/api/research/route.ts
    note: Migrated from legacy files.
  - id: route-2
    type: file
    path: app/api/still/route.ts
    note: Migrated from legacy files.
  - id: route-3
    type: file
    path: app/api/clip/route.ts
    note: Migrated from legacy files.
  - id: route-4
    type: file
    path: app/api/stitch/route.ts
    note: Migrated from legacy files.
  - id: gemini
    type: file
    path: lib/gemini.ts
    note: Migrated from legacy files.
  - id: wan
    type: file
    path: lib/wan.ts
    note: Migrated from legacy files.
status: active
verified: 2026-07-07
---

# Film pipeline

The whole product is one flow in [[app/page.tsx]]: scan face, estimate age, type hometown, wait through the travel screen, and reveal a personalized 7-scene film. Nothing renders before the hometown is typed because every scene must be location-specific; see [[experience-rules]].[@page]

On "Take me back", [[app/api/research/route.ts]] calls `researchMoments()` in [[lib/gemini.ts]] and returns 7 era-verified moments ordered across one summer day. Each moment carries `imagePrompt`, `videoPrompt`, and `referenceQuery`.[@route][@gemini]

For each moment, [[app/api/still/route.ts]] generates a Nano Banana still grounded by real photos from [[reference-image-grounding]], then [[app/api/clip/route.ts]] animates that exact still on the [[wan-fleet]]. `buildSlide()` resolves only after the clip lands, so the still is never displayed in the live film.[@route-2][@route-3][@wan]

The playlist is index-ordered so scenes play in storyboard order regardless of completion order. The reveal is gated on `genDone`, so the film plays start-to-finish as one continuous piece: 7 scenes, 2 seconds each, and hard cuts between them. A scene whose clip failed simply never exists. If all fail, `runPipeline()` surfaces "The film couldn't be developed."[@page]

Media travels in POST response bodies, not via follow-up GETs against `/tmp`, because the instance that generated a file may not be the instance that serves the next request. The shareable MP4 path is [[share-film-render]].[@route-2][@route-3][@route-4]

The current timing expectation is slow enough to justify the long travel screen. Research, still generation, and clip generation all run on the critical path, while `travelP` is tuned to an ~80 second crawl and the reveal waits for the settled result set; see [[travel-screen-performance]].[@page][@wan]
