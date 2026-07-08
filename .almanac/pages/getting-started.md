---
title: Getting Started
summary: Start here to choose the right reading path through the Relive Childhood wiki before diving into the large client file or the media-generation stack.
topics: [product, concepts]
sources:
  - id: home-page
    type: file
    path: app/page.tsx
    note: The main runtime is concentrated in one file, so new agents need a reading map before opening it.
  - id: package
    type: file
    path: package.json
    note: Confirms the repo is small enough that most durable complexity comes from flows and external systems rather than a large module graph.
status: active
verified: 2026-07-07
---

[[getting-started]] is the front door for this repo's wiki. The codebase is physically small, but the important behavior is dense: one large client file coordinates a real-time camera flow, multiple AI providers, ffmpeg stitching, and bundled travel assets.[@home-page][@package]

## Read this first

Start with [[relive-childhood]]. It explains the repo's actual runtime shape and points out the nearby stale comments that still describe older scene counts or older film structure.

Then read [[experience-flow]]. That page is the fastest way to understand why the app keeps the camera and music alive through generation, why the reveal waits, and why the stitched MP4 is for sharing rather than live playback.

## Generation and export cluster

If the problem touches prompts, provider outages, or missing scenes, read [[generation-pipeline]] first. Then branch into [[gemini]], [[reference-images]], and [[wan-fleet]] depending on whether the failure is in research, still grounding, or motion generation.

If the problem touches the shared MP4, temp files, or ffmpeg, read [[video-stitching]] and [[music-library]]. Those pages explain the active hybrid stitch path and the current mismatch between live playback music and the default server-rendered share file.

## Asset and UI cluster

If the problem is visual rather than generative, read [[claude-design-handoff]] before reshaping the UI. That page explains why [[app/page.tsx]] and [[app/globals.css]] mirror the exported prototype so closely.

If the issue is in the travel tunnel, read [[polaroid-library]]. The rewind photos come from a fixed manifest and a builder script, not from Gemini research.

## Named entities worth knowing

[[session]] is the repo's only cross-request identity. It explains temp-file locations, deterministic music selection, and how the client invalidates stale async work on restart.

There are no checked-in tests for the runtime flow. When you change behavior here, plan to verify through code reading and manual runtime checks rather than by extending an existing test suite.
