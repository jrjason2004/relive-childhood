---
title: Claude Design Handoff
summary: The UI is a direct implementation of a Claude Design handoff bundle, so app/page.tsx and globals.css preserve the prototype's screen structure, font pairing, and animation names instead of abstracting them away.
topics: [design, frontend, assets, decisions]
sources:
  - id: handoff-readme
    type: file
    path: handoff/childhood-memory-reliving-website/README.md
    note: Explains the bundle's role as a design handoff and points to Reverie.dc.html as the primary source.
  - id: handoff-html
    type: file
    path: handoff/childhood-memory-reliving-website/project/Reverie.dc.html
    note: Contains the prototype structure, animation names, font choices, and visual composition that the app reproduces.
  - id: home-page
    type: file
    path: app/page.tsx
    note: Shows the production implementation that keeps the same screen structure and much of the same naming.
  - id: globals
    type: file
    path: app/globals.css
    note: Preserves the prototype animation names as global keyframes.
  - id: layout
    type: file
    path: app/layout.tsx
    note: Preserves the Figtree and Instrument Serif font pairing from the handoff.
status: active
verified: 2026-07-07
---

[[claude-design-handoff]] explains why so much of the app lives in one large client file with many inline style objects. The repo includes a Claude Design export under [[handoff/childhood-memory-reliving-website/]], and the handoff README explicitly says `Reverie.dc.html` is the file a coding agent should read first.[@handoff-readme]

## What carried over

The active app keeps the prototype's four-screen shape: scan, city, travel, and film. It also preserves the prototype's animation names such as `rcMorphIn`, `rcScan`, `rcRetic`, `rcKen`, and `rcMemFly` in [[app/globals.css]].[@handoff-html][@globals]

The font pairing is also unchanged. [[app/layout.tsx]] loads Figtree and Instrument Serif, the same two families referenced by the handoff HTML.[@handoff-html][@layout]

## What changed

The prototype is static HTML, CSS, and imperative design logic. [[app/page.tsx]] rewires that surface to the real runtime: camera capture, API calls, timed reveal behavior, clip playback, and share export all live behind the same visuals.[@handoff-html][@home-page]

## Why the page is large

The code favors fidelity to the handoff over abstraction. The one-file client keeps screen-local layout, animation timing, and sequencing close together so the production runtime can stay visually aligned with the prototype without reinterpreting it through a separate component system.[@handoff-html][@home-page]

Related pages: [[relive-childhood]], [[experience-flow]], [[polaroid-library]].
