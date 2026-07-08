---
title: Generation Pipeline
summary: The active film pipeline researches seven hometown moments, renders a still for each, animates each still into a Wan clip, and reveals the film only after every scene attempt has settled.
topics: [flows, generation, media, decisions]
sources:
  - id: home-page
    type: file
    path: app/page.tsx
    note: Orchestrates research, still generation, clip generation, reveal timing, and share rendering.
  - id: env-example
    type: file
    path: .env.local.example
    note: Documents runtime toggles and preserves older comments that no longer match the active code path.
  - id: research-route
    type: file
    path: app/api/research/route.ts
    note: Defines the hometown-research request contract.
  - id: still-route
    type: file
    path: app/api/still/route.ts
    note: Defines still-generation behavior, real-photo fallback, and serverless delivery behavior.
  - id: clip-route
    type: file
    path: app/api/clip/route.ts
    note: Defines clip-generation behavior for both direct and two-step paths.
status: active
verified: 2026-07-07
---

[[generation-pipeline]] is the active server orchestration behind [[experience-flow]]. The client starts it from `toTravel()`, beginning with [[app/api/research/route.ts]], and the reveal waits for the whole scene queue to settle before opening the film screen.[@home-page][@research-route]

## Active path

The active path is not the one implied by `NEXT_PUBLIC_USE_WAN`. When that flag is unset, the client still ends up with Wan clips. It first posts scene prompts to [[app/api/still/route.ts]], receives the still bytes directly in the response body, and immediately re-uploads those bytes to [[app/api/clip/route.ts]] for animation.[@home-page][@still-route][@clip-route]

This two-step path is the serverless-safe path. [[app/api/still/route.ts]] explicitly returns image bytes in the POST response because the instance that generated a still may not be the same instance that serves a later GET. Saving the still to disk is best-effort, not the primary delivery contract.[@still-route]

## What `NEXT_PUBLIC_USE_WAN` actually does

`NEXT_PUBLIC_USE_WAN=1` switches on the older direct-clip path, not "whether Wan is used." In that branch, `buildSlide()` posts prompts straight to [[app/api/clip/route.ts]], ignores the raw response body, and then fetches the clip back through `/api/video?session=...&clip=N`.[@home-page][@clip-route]

That older branch depends on the clip being saved to temp storage and reachable through the follow-up GET. The code comments call it the "local-only path," which is why the default branch stopped depending on it.[@home-page][@clip-route]

## Scene count and failure behavior

`runPipeline()` slices research results to seven moments, creates one async task per moment, and runs the queue at `CONCURRENCY = 7`, which means the client tries to render the whole film in parallel.[@home-page]

Partial failure is allowed. `buildSlide()` returns `null` on per-scene failure, `runPipeline()` sets `genDone` after the whole pool resolves, and the run only becomes a full-screen error if every scene fails and `ok.length === 0`.[@home-page]

That means the reveal waits for every scene attempt to finish, not for all seven scenes to succeed. A degraded run can still reveal a shorter film if at least one clip made it through.[@home-page]

## Code drift to trust

[[./.env.local.example]] still describes an older film structure with three era-only warm slides and four researched moments. The current `runPipeline()` uses seven researched hometown moments and never injects generic filler scenes.[@env-example][@home-page]

Related pages: [[gemini]], [[reference-images]], [[wan-fleet]], [[video-stitching]].
