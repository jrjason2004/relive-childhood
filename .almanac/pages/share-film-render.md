---
title: Share Film Render
summary: Share Film Render is the export flow that turns the clip set into a 14-second MP4, first through server ffmpeg stitching and then through a browser MediaRecorder fallback when the server path fails.
topics:
  - flows
  - media
  - operations
sources:
  - id: page
    type: file
    path: app/page.tsx
    note: Migrated from legacy files.
  - id: route
    type: file
    path: app/api/stitch/route.ts
    note: Migrated from legacy files.
  - id: video
    type: file
    path: lib/video.ts
    note: Migrated from legacy files.
  - id: next-config
    type: file
    path: next.config.mjs
    note: Migrated from legacy files.
status: active
verified: 2026-07-07
---

# Share film render

The shareable file is 7 scenes by 2 seconds, `720x1280`, hard cuts, music as the only audio, POV text burned into the frame. The primary path is the **live-pass recorder** in [[app/page.tsx]]: when the film reveals, a hidden 720x1280 canvas mirrors the on-screen scene each frame (`shownVideoElRef` + `drawCover` + `drawPovText`) into a `MediaRecorder` with the prefetched session track mixed from 0:00; the recorder stops when the first pass ends (`liveDone`), so the file is ready the instant the share sheet pops. A blob under 200KB is treated as a dud (stalled/backgrounded tab) and falls through.[@page]

`renderShareFilm()` is the fallback chain when recording is unsupported or produced a dud:

1. **Server ffmpeg stitch — only when the clips total under 4MB.** Vercel caps request bodies at 4.5MB; seven Wan clips usually exceed it, so the upload is skipped entirely rather than burning seconds to a 413. When viable, the client uploads clip blobs via `FormData` to [[app/api/stitch/route.ts]] as `clip-{index}` parts and `stitchHybrid()` in [[lib/video.ts]] runs `concat`, overlays the POV PNG, and trims `public/music/childhood-1.mp3` to length.[@route][@video]
2. **In-browser render.** `renderFilmInBrowser()` plays the clips into a canvas + `MediaRecorder` in real time (~15s). `finalFileExtRef` tracks which extension the share sheet offers.[@page]

The share sheet auto-opens at the end of the first pass regardless of export state ("still developing" copy; the button lights when `videoUrl` lands) — gating the auto-open on `videoUrl` was a bug that made the sheet never appear when the export ran long.[@page]

Gotchas encoded here:

The export path has three important gotchas. The client renders POV text to a transparent PNG because the local ffmpeg path does not rely on `drawtext`. `ffmpeg-static` must stay in `serverExternalPackages` in [[./next.config.mjs]] or the spawned binary path breaks after bundling. The active server stitch always uses `childhood-1.mp3` from byte 0 instead of the session-deterministic live track.[@page][@video][@next-config]

The share sheet appears after the film's first full pass. Web Share needs a `File`, so the final blob stays in `finalBlobRef`, with an `<a download>` fallback on desktop.[@page]
