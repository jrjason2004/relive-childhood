---
topics:
  - concepts
  - decisions
sources:
  - id: page
    type: file
    path: app/page.tsx
    note: Migrated from legacy files.
  - id: gemini
    type: file
    path: lib/gemini.ts
    note: Migrated from legacy files.

---

# Experience rules

Jason's product rules, each arrived at through iteration on 2026-07-07. They override "obvious" engineering instincts, so check here before changing film or travel behavior.

**Video-only, never a still.** The film never shows a static image. Nano Banana stills exist solely to hand Wan the exact frame to animate. A scene enters the playlist only when its clip resolves (`animateSlide` in [[app/page.tsx]]); there is no Ken Burns fallback in the live film. Earlier versions showed stills that upgraded in place to video — rejected: "there should NEVER be static images."

**All 7 scenes location-specific.** No generic era-only filler. The research prompt in [[lib/gemini.ts]] makes local anchoring non-negotiable: every scene needs a verified named local place or unmistakable regional element, with the anchor visible in frame, AND a tactile nostalgic kid activity happening there (not a static landmark shot). If a place can't be era-verified via search, the model must pick a different verified anchor — never fall back to generic. The original "warm slides" (3 generic scenes pre-rendering at the age reveal, for speed) were removed for this: "by having them generic, just based off the age, it's not as resonant."

**The reveal waits for the whole film.** Generation is fully hidden behind the travel screen (~80–100s is acceptable: "honestly, take your time"). No clips looping while later ones render, no mid-film waits. Gated on `genDone`.

**Hard cuts, no crossfades** — in the live player (no opacity transition) and the stitched mp4 (ffmpeg `concat`, not `xfade`).

**No progress/waiting UI on the film screen.** Latency is hidden, never surfaced. The travel screen is the only place waiting is acknowledged, and even there only implicitly (see [[travel-screen-performance]]).

**No age numbers in copy.** The estimated-age reveal (big number) stays, but the journey is to "childhood," never "age 7." `CHILD_AGE = 7` drives internal year math and POV prompts only.

**POV overlay is two-line, city-only:** line 1 `POV: Growing up in`, line 2 `{city}` (`POV_PREFIX` + `povTextForCity()` in page.tsx). The year was in an earlier revision and was dropped. The same text is burned into the shared mp4.

**Sharing is a feature.** It was removed once ("keep it live-only") and explicitly reinstated the same day when the film went back to Wan video. The share sheet appears after the first full pass; see [[share-film-render]].
