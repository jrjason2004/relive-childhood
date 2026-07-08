---
topics:
  - flows
  - deploy
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

---

# Share film render

The shareable mp4 (7 scenes × 2s = 14.00s, 720×1280, hard-cut `concat`, first ~14s of the music as the only audio, POV text burned in) is rendered after all clips settle, in a two-tier fallback in `renderShareFilm` ([[app/page.tsx]]):

1. **Server ffmpeg stitch.** The client uploads its clip blobs via `FormData` to `/api/stitch` (`clip-{index}` parts) — required on Vercel because the serverless instance doing the stitch has no access to the `/tmp` files another instance wrote during generation. [[app/api/stitch/route.ts]] saves the uploaded clips, then `stitchHybrid` in [[lib/video.ts]] runs `concat` (not `xfade` — hard cuts per [[experience-rules]]), overlays the POV PNG, and trims `public/music/childhood-1.mp3` to length.
2. **In-browser render fallback** (`renderFilmInBrowser`): canvas + MediaRecorder produce a webm/mp4 client-side if the server stitch fails. `finalFileExtRef` tracks which extension the share sheet offers.

Gotchas encoded here:

- **The local ffmpeg had no `drawtext` filter**, so POV text is never drawn by ffmpeg. The client renders it to a transparent PNG (`renderPovPng`, canvas 2D with stroke+fill matching the live overlay) and ffmpeg composites it with `overlay`.
- **`ffmpeg-static` must stay in `serverExternalPackages`** in `next.config.mjs`. Bundling it rewrites its `__dirname`-derived binary path to a fake `/ROOT/...` and every spawn fails `ENOENT`. This was caught only by exercising the API route — typecheck and build were clean.
- Vercel function caps: the clip route runs with `maxDuration = 600` (a value of 3000 was rejected at deploy; the Pro cap for this shape was 1800), stitch with 300.
- Music chunks live in `public/music/` (three ~9-min slices of one 28-min track) served statically; `/api/music` 302-redirects to the session's chunk. The stitch always uses `childhood-1.mp3` from byte 0 — the original song's opening.

The share sheet appears after the film's first full pass; if the render is still in flight it shows "Your film is still developing — the button lights up when it's ready." Web Share needs a `File`, so the final blob is kept in `finalBlobRef` (iPhone camera roll path), with an `<a download>` fallback on desktop.
