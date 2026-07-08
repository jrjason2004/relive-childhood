---
title: Travel Screen Performance
summary: Travel Screen Performance records the discarded loading-screen designs and the performance invariant that the rewind screen must avoid per-frame React work.
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
status: active
verified: 2026-07-07
---

# Travel screen performance

The time-travel loading screen went through several designs in one day, and the surviving invariant is simple: no per-frame React state and no heavy per-frame image drawing on the travel screen. The screen already re-renders from the `travelP` ticker, so any extra per-frame state churn compounds it.[@page]

The designs, in order:

1. Floating polaroids of the session's own stills — killed on looks ("they look dumb").
2. Soft full-screen still glimpses — killed by the video-only rule ([[experience-rules]]).
3. 3D tear-off calendar + decade fly-bys + warp streaks — looked right, "super laggy": the rip/decade spawners set React state up to ~14×/s, each re-rendering the whole ~2000-line component.
4. Canvas polaroid tunnel (photos flying in 3D, zero React) — still "way too laggy": ~14 scaled `drawImage` calls per frame on a DPR-2 canvas.
5. **Current:** warp light-streaks on one canvas, month plus giant year as the only text, and "flashes of memories" implemented as pure CSS transform animations (`rcMemFly` in [[app/globals.css]]) with only one state update per spawn.[@page][@globals]

The flash photos come from [[public/polaroids/]]: 160 curated pop-culture moments, exactly 2 per year from 1946 through 2025. [[scripts/fetch-polaroids.mjs]] builds that library with keyless DuckDuckGo image search, a stock-site blocklist, and ffmpeg square-cropping.[@fetch-polaroids][@polaroids]

Flashes are matched to the year the rewind is passing and clamped to the user's actual journey. Each image is preloaded via `Image()` and only shown once complete so nothing pops in half-decoded.[@page]

The date rewind itself is an eased mapping of `travelP` from now to mid-June of the childhood year, creeping to 97 percent over roughly 80 seconds to span the real generation wait. The arrival ramp, armed by `genDone`, accelerates the final reveal; see [[film-pipeline]].[@page]
