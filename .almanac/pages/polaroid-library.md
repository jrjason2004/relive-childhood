---
title: Polaroid Library
summary: The travel screen uses a prebuilt library of 160 square-cropped pop-culture photos, stored in public/polaroids and timed against the rewind year rather than the user's hometown.
topics: [assets, frontend]
sources:
  - id: home-page
    type: file
    path: app/page.tsx
    note: Defines how the travel screen loads, prewarms, and schedules Polaroid images during the rewind.
  - id: manifest
    type: file
    path: public/polaroids/manifest.json
    note: Defines the shipped manifest format and year coverage.
  - id: fetch-script
    type: file
    path: scripts/fetch-polaroids.mjs
    note: Defines how the image set is scraped, filtered, cropped, and indexed.
status: active
verified: 2026-07-07
---

[[polaroid-library]] is the visual memory tunnel behind the travel screen. It is a fixed asset set of real pop-culture photos, not user-generated output and not hometown-specific research.[@home-page][@manifest]

## Asset shape

[[public/polaroids/manifest.json]] is a flat array of `{ y, l, f }` objects. The checked-in manifest covers two entries per year from 1946 through 2025, for 160 shipped items total.[@manifest]

Each file is a square JPEG under [[public/polaroids/]]. The client reads the manifest, groups entries by year, and only prewarms the current year plus adjacent years so the rewind does not try to load the full library at once.[@home-page]

## Runtime behavior

The travel screen does not choose photos at random on every tick. It computes a virtual time window for each displayed year, spaces that year's photo flashes across the window, waits on a single pending image if the network is slow, and keeps only the last few active fly-by images mounted at once.[@home-page]

That scheduling makes the tunnel feel synchronized with the date rewind. Early years appear farther apart because the rewind is moving slowly; later years compress as the rewind accelerates.[@home-page]

## Build script

[[scripts/fetch-polaroids.mjs]] builds the library with DuckDuckGo image queries, filters out major stock-photo domains to avoid watermarked previews, downloads candidate images, square-crops them to `360x360` through ffmpeg, and rewrites the manifest in year order.[@fetch-script]

The script's source list is hardcoded. Extending coverage past 2025 or replacing a weak image requires editing that entry table and rerunning the script.[@fetch-script]

Related pages: [[experience-flow]], [[claude-design-handoff]].
