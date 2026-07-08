---
topics:
  - incidents
  - decisions
  - frontend
sources:
  - id: page
    type: file
    path: app/page.tsx
    note: Migrated from legacy files.
  - id: globals
    type: file
    path: app/globals.css
    note: Migrated from legacy files.
  - id: fetch-polaroids
    type: file
    path: scripts/fetch-polaroids.mjs
    note: Migrated from legacy files.
  - id: polaroids
    type: file
    path: public/polaroids/
    note: Migrated from legacy files.

---

# Travel screen performance

The time-travel loading screen went through five designs in one day, three killed by lag. The lesson is the invariant: **no per-frame React state, no per-frame image drawing on the travel screen.** The screen already re-renders at 25fps from the `travelP` progress ticker; anything else per-frame compounds it.

The designs, in order:

1. Floating polaroids of the session's own stills — killed on looks ("they look dumb").
2. Soft full-screen still glimpses — killed by the video-only rule ([[experience-rules]]).
3. 3D tear-off calendar + decade fly-bys + warp streaks — looked right, "super laggy": the rip/decade spawners set React state up to ~14×/s, each re-rendering the whole ~2000-line component.
4. Canvas polaroid tunnel (photos flying in 3D, zero React) — still "way too laggy": ~14 scaled `drawImage` calls per frame on a DPR-2 canvas.
5. **Current:** warp light-streaks on one canvas (90 line strokes, DPR capped 1.5, speed tied to eased rewind progress via `warpSpeedRef`), month + giant year as the only text, and "flashes of memories" — real photos flying outward via pure CSS transform animations (`rcMemFly` in [[app/globals.css]], `--dx`/`--dy` custom properties set per flash), up to 4 concurrent, one state update per spawn (~every 0.4–1.2s, cadence tightening with rewind speed).

The flash photos come from `public/polaroids/`: 160 curated pop-culture moments, exactly 2 per year 1946–2025, so an 80-year-old flies through their own era. Built by [[scripts/fetch-polaroids.mjs]] (edit `ENTRIES` and rerun; idempotent, `--force` refetches) using keyless DuckDuckGo image search with a stock-site blocklist — the first fetch returned alamy previews with watermarks plastered across the moon landing. Images are square-cropped to 360px by ffmpeg; `manifest.json` maps `{y, l, f}`.

Flashes are matched to the year the rewind is passing (`curYearRef`) and clamped to the user's actual journey — nothing newer than today, nothing older than the childhood year (`povYearRef`). Each image is preloaded via `Image()` and only shown once `complete`, so nothing pops in half-decoded.

The date rewind itself is a quintic ease of `travelP` from now to mid-June of the childhood year, creeping to 97% over ~80s to span the real generation wait; the arrival ramp (armed by `genDone`, see [[film-pipeline]]) accelerates it to 100%.
