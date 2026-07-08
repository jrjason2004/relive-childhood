---
title: Gemini
summary: Gemini handles selfie analysis, hometown-specific moment research, and still-image generation, while the Veo helper in the same module remains unwired from the active clip route.
topics: [stack, generation]
sources:
  - id: gemini-lib
    type: file
    path: lib/gemini.ts
    note: Defines Gemini-backed selfie analysis, research, image generation, and the dormant Veo helper.
  - id: analyze-route
    type: file
    path: app/api/analyze/route.ts
    note: Shows how the client calls analyzeSelfie.
  - id: research-route
    type: file
    path: app/api/research/route.ts
    note: Shows how the client calls researchMoments and computes the returned era metadata.
  - id: clip-route
    type: file
    path: app/api/clip/route.ts
    note: Confirms the active clip route imports Wan, not Gemini video generation.
status: active
verified: 2026-07-07
---

[[gemini]] is the active external model stack for everything except motion clips. [[lib/gemini.ts]] exports four helpers, but only three are in the active runtime: `analyzeSelfie()`, `researchMoments()`, and `generateImage()`.[@gemini-lib][@clip-route]

## Selfie analysis

`analyzeSelfie()` sends the uploaded image plus a strict JSON-only prompt and asks for an approximate age, gender, and skin-tone descriptor. The parser is defensive and falls back to `30`, `male`, and `medium` if Gemini returns prose or malformed JSON.[@gemini-lib]

The client calls that helper through [[app/api/analyze/route.ts]] during scan lock-in, and the returned profile is later reused by research so the travel step does not need to re-analyze the photo.[@analyze-route]

## Hometown research

`researchMoments()` is the most constrained prompt in the repo. It derives a childhood window from the estimated age, forces exactly seven moments, requires every moment to be tied to a named local place that existed during that window, orders the scenes across one summer day, and turns on Gemini's `google_search` tool for grounding.[@gemini-lib]

The function retries once when grounded output comes back as prose or truncated JSON. [[app/api/research/route.ts]] returns both the moments and a simplified profile object with `ageYears` plus a decade label, but the client only uses the moments for rendering.[@gemini-lib][@research-route]

## Still generation

`generateImage()` does not trust the upstream prompt alone. It appends another block that reasserts the low child-height POV, visible hands, active nostalgic behavior, visible local anchor, and 9:16 framing. Any downloaded reference photos are passed inline as additional image parts.[@gemini-lib]

## Dormant Veo helper

[[lib/gemini.ts]] still includes `generateVideoClip()` for Veo 3.1 long-running video generation. The active clip route does not import it. [[app/api/clip/route.ts]] imports `generateVideoClip` from [[lib/wan.ts]] instead, so Veo is preserved code, not live behavior.[@gemini-lib][@clip-route]

Related pages: [[generation-pipeline]], [[reference-images]], [[wan-fleet]].
