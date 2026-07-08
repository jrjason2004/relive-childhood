---
title: Session
summary: The session ID is the only cross-request identity in the app and drives temp-file paths, deterministic music selection, clip and final-video URLs, and stale-work isolation on the client.
topics: [concepts, media, generation]
sources:
  - id: home-page
    type: file
    path: app/page.tsx
    note: Creates the session ID and threads it through music, generation, and restart behavior.
  - id: video-lib
    type: file
    path: lib/video.ts
    note: Defines sessionDir, clipPath, stillPath, finalPath, and safeId.
  - id: music-lib
    type: file
    path: lib/music.ts
    note: Hashes the session ID into one of the bundled music tracks.
  - id: music-route
    type: file
    path: app/api/music/route.ts
    note: Redirects a session ID to its deterministic public music file.
  - id: video-route
    type: file
    path: app/api/video/route.ts
    note: Serves clip and final-video files by session ID.
status: active
verified: 2026-07-07
---

[[session]] is the app's only durable identity token. There is no database row, auth record, or server-side session store. The client creates a UUID in [[app/page.tsx]] after scan lock-in, keeps it in `sessionRef`, and passes it through every later media request.[@home-page]

## Storage contract

[[lib/video.ts]] maps each session to `os.tmpdir()/relive-childhood/<safe-id>`. `safeId()` strips the ID down to alphanumerics, underscore, and hyphen before building the directory path.[@video-lib]

Every saved artifact hangs off that directory: `clip-<index>.mp4`, `still-<index>.jpg`, and `final.mp4`.[@video-lib]

## Network contract

The client uses the same session ID for three separate surfaces. `/api/music?session=...` resolves to a track, `/api/video?session=...&clip=N` resolves an individual scene clip, and `/api/video?session=...` resolves the stitched share file.[@home-page][@music-route][@video-route]

`renderShareFilm()` also sends the session ID inside the multipart `stitch` request so the server can save uploaded clips and the final MP4 under the same directory.[@home-page][@video-lib]

## Session-specific randomness

Music selection is stable per session instead of per render. [[lib/music.ts]] hashes the session ID into one of three bundled tracks, which makes the pick effectively random across runs while keeping the live player and the session-based ffmpeg modes consistent for a given ID.[@music-lib]

## Lifetime

The session is per browser run. `restart()` clears `sessionRef`, revokes blob URLs, stops media, and begins a fresh scan, so nothing from the previous film is reused on the client after a restart.[@home-page]

Related pages: [[music-library]], [[video-stitching]], [[generation-pipeline]].
