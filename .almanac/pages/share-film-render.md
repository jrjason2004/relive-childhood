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

The shareable file is 7 scenes by 2 seconds, `720x1280`, hard cuts, music as the only audio, POV text burned into the frame. `renderShareFilm()` in [[app/page.tsx]] is kicked at `genDone` (in parallel with the live pass, so it is usually ready by the time the share sheet pops) with a two-step chain:

1. **Server ffmpeg stitch — the reliable, browser-agnostic primary, for every film size.** When the clips total under ~4.2MB they ride directly in the stitch POST as `clip-{index}` multipart parts (Vercel caps request bodies at ~4.5MB). Bigger films upload each clip to Vercel Blob (private store `relive-media`) via `upload()` from `@vercel/blob/client` with tokens minted by [[app/api/share-upload/route.ts]], then POST only `clipUrls` to [[app/api/stitch/route.ts]], which downloads them with `get()` and deletes them with `del()` after stitching. Either way `stitchHybrid()` in [[lib/video.ts]] runs `concat`, overlays the POV PNG, and trims `public/music/childhood-1.mp3` to length. Produces a real mp4 that shares/downloads on any browser.[@route][@video]
The stitch route **streams the finished mp4 back in its own POST response**, read on the same instance that just wrote it. It does NOT return a `/api/video?session=` URL for the client to GET: `/api/video` reads `final.mp4` from `os.tmpdir()`, and on Vercel that follow-up request can hit a different cold instance with an empty tmp and 404 — which used to strand the share on "Getting your share video ready" and drop it into the (now-removed) in-browser recorder. `FFMPEG_BIN` is also `chmod 0o755`'d on load because Vercel can strip the traced binary's exec bit, which made every stitch fail into that same hang.

2. **In-browser render — REMOVED (2026-07-08).** `renderFilmInBrowser()` + its `MediaRecorder`/`captureStream` helpers are gone. In iOS Low Power Mode its dynamically created videos never play, so it hung indefinitely. A stitch failure now sets `shareFailed` and shows the failure state fast instead of hanging.[@page]

A **live-pass canvas recorder was tried as the primary** (record exactly what plays) and removed: `canvas.captureStream()` + `MediaRecorder` yields empty/dud recordings in Safari and other environments (headless Chromium produced ~1.7KB for 1.2s of animation), so the 200KB dud guard tripped and the in-browser fallback — which uses the same fragile API — failed too, leaving the Share button stuck grayed (`opacity: videoUrl ? 1 : 0.5`). The server stitch avoids that whole class of failure.

The former open risk — films over ~4.2MB skipping the server stitch and hanging for minutes in the in-browser render ("Getting your share video ready" stuck) — was closed 2026-07-08 by the Blob upload path above. `BLOB_READ_WRITE_TOKEN` is set in all Vercel environments; the store was created with `vercel blob create-store relive-media --access private --yes`.

The share sheet auto-opens at the end of the first pass regardless of export state ("still developing" copy; the button lights when `videoUrl` lands) — gating the auto-open on `videoUrl` was a bug that made the sheet never appear when the export ran long.[@page]

Gotchas encoded here:

The export path has three important gotchas. The client renders POV text to a transparent PNG because the local ffmpeg path does not rely on `drawtext`. `ffmpeg-static` must stay in `serverExternalPackages` in [[./next.config.mjs]] or the spawned binary path breaks after bundling. The active server stitch always uses `childhood-1.mp3` from byte 0 instead of the session-deterministic live track.[@page][@video][@next-config]

The share sheet appears after the film's first full pass. Web Share needs a `File`, so the final blob stays in `finalBlobRef`, with an `<a download>` fallback on desktop.[@page]
