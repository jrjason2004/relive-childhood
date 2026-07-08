---
title: Music Library
summary: Music playback is backed by three bundled MP3 files in public/music, with deterministic session hashing for live playback and static-file delivery through an API redirect.
topics: [assets, media, concepts]
sources:
  - id: music-lib
    type: file
    path: lib/music.ts
    note: Defines the three-track library and deterministic session hashing.
  - id: music-route
    type: file
    path: app/api/music/route.ts
    note: Redirects session IDs to static files under public/music.
  - id: home-page
    type: file
    path: app/page.tsx
    note: Starts music at the travel step and carries it through film playback.
  - id: public-music
    type: file
    path: public/music/
    note: Contains the actual MP3 assets used for live playback and stitching.
  - id: video-lib
    type: file
    path: lib/video.ts
    note: Shows which stitch modes use the session-deterministic track and which one does not.
status: active
verified: 2026-07-07
---

[[music-library]] is a bundled static asset library, not a streaming backend. The repo ships three MP3 files under [[public/music/]], and the live experience picks one track per session by hashing the session ID.[@music-lib][@public-music]

## Live playback contract

The client starts music inside `toTravel()` so the browser sees it as user-gesture-initiated media. That track keeps playing across the travel screen and the live film until the film has finished.[@home-page]

`/api/music?session=...` does not serve bytes directly. [[app/api/music/route.ts]] resolves the session to a filename and returns a `302` redirect to `/music/<name>`, leaving the static layer to handle the actual MP3 response.[@music-route]

That redirect is deliberate. The route comment calls out Safari's `Range` behavior and serverless response-size limits as the reason static delivery is preferred for these 11 MB files.[@music-route]

## Deterministic selection

`trackNameForSession()` hashes the session string into one of `childhood-1.mp3`, `childhood-2.mp3`, or `childhood-3.mp3`. The selection is stable for a given session and effectively random across sessions because the client generates a fresh UUID for each run.[@music-lib]

## Stitching mismatch

`stitchClips()` and `stitchStills()` ask `trackForSession(sessionId)` for the same deterministic track the live player used. `stitchHybrid()` does not. It always points at `public/music/childhood-1.mp3`.[@video-lib]

Related pages: [[session]], [[video-stitching]].
