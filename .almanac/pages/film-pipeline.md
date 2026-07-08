---
topics:
  - flows
  - video-gen
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

---

# Film pipeline

The whole product is one flow in [[app/page.tsx]] (a single ~2000-line client component): scan face → Gemini age estimate → type hometown → time-travel loading screen → a personalized 7-scene film. Nothing renders before the hometown is typed, because every scene must be location-specific (see [[experience-rules]]).

On "Take me back": `/api/research` ([[lib/gemini.ts]] `researchMoments`, gemini-2.5-flash with Google Search grounding, `thinkingBudget: 0` to avoid ~25s thinking latency) returns 7 era-verified moments ordered across one summer day. Each moment carries `imagePrompt`, `videoPrompt`, and `referenceQuery`. For each: `/api/still` generates a Nano Banana still grounded by real photos from [[reference-image-grounding]], then `/api/clip` animates that exact still on the [[wan-fleet]] (~13s per clip at 480×864). `buildSlide` in page.tsx resolves only after the clip lands; the still is never displayed.

The playlist is index-ordered (`{idx, url, video}` inserted sorted) so scenes play in storyboard order regardless of completion order. The reveal is gated on `genDone` — every clip settled — so the film plays start-to-finish as one continuous piece: 7 scenes × 2s (`SLIDE_MS = 2000`), hard cuts, each clip playing once per scene. A scene whose clip failed simply never exists; if all fail, the run surfaces "The film couldn't be developed — tap to start over" (`ok.length === 0` throw in `runPipeline`).

Media travels in POST response bodies, not via follow-up GETs against `/tmp` — on Vercel the instance that generated a file is not the instance that serves the next request. The shareable mp4 path is [[share-film-render]].

Timings measured on the real pipeline: research ~25s, stills 4–25s each (parallel), clips ~13s each across 3 workers, so travel lasts roughly 80–100s; the travel progress creep is tuned to ~80s to match (see [[travel-screen-performance]]).
