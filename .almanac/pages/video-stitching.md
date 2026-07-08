---
title: Video Stitching
summary: The shareable film is assembled in temp storage through ffmpeg, with hybrid stitching as the active path and a browser MediaRecorder fallback when the server render fails.
topics: [systems, media, decisions]
sources:
  - id: video-lib
    type: file
    path: lib/video.ts
    note: Defines temp-file layout, ffmpeg invocation, and the three stitch modes.
  - id: stitch-route
    type: file
    path: app/api/stitch/route.ts
    note: Defines how the client requests hybrid, clips, or stills stitching.
  - id: video-route
    type: file
    path: app/api/video/route.ts
    note: Serves clip and final-video artifacts from temp storage.
  - id: home-page
    type: file
    path: app/page.tsx
    note: Defines the client-side multipart upload, stitched-file fetch, and browser MediaRecorder fallback.
  - id: next-config
    type: file
    path: next.config.mjs
    note: Explains why ffmpeg-static must stay external in the Next.js server bundle.
status: active
verified: 2026-07-07
---

[[video-stitching]] is the last stage of the media pipeline. The active live film does not use the stitched file, but the share sheet does. Server-side assembly happens in [[lib/video.ts]] and is exposed through [[app/api/stitch/route.ts]].[@video-lib][@stitch-route][@home-page]

## Temp-file layout

Every stitch mode works out of [[session]]. `saveStill()` and `saveClip()` persist scene assets under the session temp directory, and `final.mp4` is the single stitched output path for later `/api/video?session=...` delivery.[@video-lib][@video-route]

## Modes

[[lib/video.ts]] still exposes three stitch modes. `stitchStills()` builds a Ken Burns slideshow with crossfades. `stitchClips()` concatenates clip files and lays music underneath. `stitchHybrid()` is the active share path and builds a 14-second scene sequence with hard cuts, optional still fallback, burned-in POV text, and AAC audio.[@video-lib][@stitch-route]

`renderShareFilm()` always requests `mode = "hybrid"`, so `clips` and `stills` are retained capabilities, not the path the shipped client currently exercises.[@home-page][@stitch-route]

## Hybrid specifics

Hybrid mode gives each scene a fixed two-second segment. If a clip file exists it is cover-cropped to `720x1280`; otherwise the still is rendered through one of four Ken Burns variants and downscaled into the same 9:16 canvas.[@video-lib]

The POV line is not drawn with ffmpeg text filters. The client renders the overlay text to a transparent PNG in `renderPovPng()`, uploads it as `povImage`, and the server overlays that PNG near the top of the frame.[@home-page][@video-lib]

## Browser fallback

If the server stitch fails, the client can still export. `renderFilmInBrowser()` loads each clip into an offscreen video element, draws the clips and POV text onto a canvas at 30 fps, mixes music into a captured media stream, and records a new MP4 or WebM through `MediaRecorder`.[@home-page]

## Music divergence

The active hybrid path does not honor session-specific track selection. `stitchHybrid()` always uses `public/music/childhood-1.mp3`, while `stitchClips()` and `stitchStills()` use `trackForSession(sessionId)` and the live player uses `/api/music?session=...`.[@video-lib]

That means the shared MP4 can carry different music from the live playback for the same session unless the browser fallback path is used, because the browser fallback pulls from `/api/music?session=...`.[@home-page][@video-lib]

## ffmpeg contract

[[./next.config.mjs]] keeps `ffmpeg-static` in `serverExternalPackages` because the package resolves its binary path via `__dirname`, which breaks if Next bundles it into a fake server path.[@next-config]

Related pages: [[music-library]], [[session]], [[generation-pipeline]].
