---
title: Experience Flow
summary: The client runtime is a four-screen state machine in app/page.tsx that keeps the camera and music alive through generation, reveals the film only after the pipeline settles, and auto-opens sharing after the first playback.
topics: [flows, frontend, product]
sources:
  - id: home-page
    type: file
    path: app/page.tsx
    note: Defines the screen state machine, travel timer, film playback, restart behavior, and share flow.
  - id: analyze-route
    type: file
    path: app/api/analyze/route.ts
    note: Supports the scan step's selfie-analysis call.
  - id: research-route
    type: file
    path: app/api/research/route.ts
    note: Supports the city-to-research transition.
status: active
verified: 2026-07-07
---

[[experience-flow]] is the runtime contract implemented in [[app/page.tsx]]. The client exposes four screens, `scan`, `city`, `travel`, and `film`, and keeps nearly all flow state in one component instead of routing between pages.[@home-page]

## Scan

The app starts in `scan`. `useEffect()` calls `beginScan()` on mount, which starts a progress interval, opens the front camera, captures a JPEG frame after a short exposure delay, and posts the image to [[app/api/analyze/route.ts]].[@home-page][@analyze-route]

The progress bar is cosmetic until the server returns. `beginScan()` creeps to 90 percent over four seconds, and `finishScan()` snaps to 100 percent only after the profile arrives.[@home-page]

If camera access fails, the screen stays in `scan` and exposes an upload fallback. The upload path still reuses the same `analyze()` call, so the downstream flow does not care whether the selfie came from `getUserMedia()` or a file picker.[@home-page]

## City and travel

`finishScan()` creates the session ID before the user enters a city. `toCity()` moves to the hometown prompt, and `toTravel()` starts the session audio, keeps the live camera running, clears previous timers, and launches the travel countdown plus the [[app/api/research/route.ts]] pipeline in parallel.[@home-page][@research-route]

The travel screen is deliberately a waiting show, not a progress dashboard. `travelP` creeps toward 97 percent over `TRAVEL_LOAD_MS`, the displayed month and year rewind on an ease curve, and the actual reveal is armed later by an effect that waits for generation to finish.[@home-page]

The travel visuals are split between a canvas light tunnel and year-matched photos from [[polaroid-library]]. Those photos are not random overlays. The client spaces them across the virtual time window for each year so slow early years breathe and later years flash faster as the rewind accelerates.[@home-page]

## Film and sharing

The live film is clip-first. `playlist` entries are inserted only after a scene has a real motion clip, and they are sorted by index so late scenes slot into storyboard order instead of append order.[@home-page]

The shareable file is separate from the live player. The live screen plays scene videos directly and never swaps over to the stitched MP4 because `finalMode` is hardcoded to `false`.[@home-page]

After the first full playback, a `useEffect()` opens the share sheet automatically when `liveDone` and `videoUrl` are both set. `shareFilm()` prefers the Web Share API with an attached file and falls back to a plain download link when file sharing is unavailable.[@home-page]

## Cancellation model

`runRef` is the global stale-work guard. Restart increments it, and every long-running async path checks `runRef.current !== run` before mutating state. The app has no job queue or persistence layer, so this integer is the only cancellation primitive between the client and its in-flight requests.[@home-page]

Related pages: [[session]], [[generation-pipeline]], [[video-stitching]], [[claude-design-handoff]].
