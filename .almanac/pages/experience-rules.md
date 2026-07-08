---
title: Experience Rules
summary: Experience Rules captures the product constraints that intentionally override simpler engineering defaults, especially around what the film may show and when it is allowed to reveal.
topics:
  - product
  - decisions
sources:
  - id: page
    type: file
    path: app/page.tsx
    note: Migrated from legacy files.
  - id: gemini
    type: file
    path: lib/gemini.ts
    note: Migrated from legacy files.
status: active
verified: 2026-07-07
---

# Experience rules

Jason's product rules arrived through same-day iteration and override "obvious" engineering instincts, so check here before changing film or travel behavior.[@page]

**Video-only, never a still.** The film never shows a static image. Nano Banana stills exist solely to hand Wan the exact frame to animate. A scene enters the playlist only when its clip resolves (`animateSlide` in [[app/page.tsx]]); there is no Ken Burns fallback in the live film.[@page]

**All 7 scenes location-specific.** No generic era-only filler. The research prompt in [[lib/gemini.ts]] makes local anchoring non-negotiable: every scene needs a verified named local place or unmistakable regional element, with the anchor visible in frame, and a tactile nostalgic kid activity happening there instead of a static landmark shot.[@gemini]

**The reveal waits for the whole film.** Generation is fully hidden behind the travel screen. No clips looping while later ones render, and no mid-film waits. Reveal gating hangs off `genDone`.[@page]

**Hard cuts, no crossfades.** The live player uses scene swaps without opacity transitions, and the stitched MP4 uses `concat` rather than `xfade`.[@page]

**No progress or waiting UI on the film screen.** Latency is hidden rather than surfaced on top of the finished video. The travel screen is the only place waiting is acknowledged, and even there only implicitly; see [[travel-screen-performance]].[@page]

**No age numbers in copy.** The estimated-age reveal stays, but the journey is to "childhood," never "age 7." `CHILD_AGE = 7` drives internal year math and POV prompts only.[@page]

**POV overlay is two-line and city-only.** `POV_PREFIX` plus `povTextForCity()` produce line 1 `POV: Growing up in` and line 2 `{city}`. The same text is burned into the shared MP4.[@page]

**Sharing is part of the product.** The share sheet appears after the first full pass; see [[share-film-render]].[@page]
