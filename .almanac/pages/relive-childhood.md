---
title: Relive Childhood
summary: Relive Childhood is a single-screen Next.js app that turns a selfie and hometown into a short first-person nostalgia film backed by Gemini, Wan, ffmpeg, and bundled media assets.
topics: [product, systems, frontend]
sources:
  - id: package
    type: file
    path: package.json
    note: Confirms the repo is a small Next.js app with ffmpeg-static as the only non-framework runtime dependency.
  - id: home-page
    type: file
    path: app/page.tsx
    note: Defines the entire client-side experience, screen state machine, and pipeline orchestration.
  - id: layout
    type: file
    path: app/layout.tsx
    note: Defines page metadata and the two Google fonts used throughout the experience.
  - id: api-routes
    type: file
    path: app/api/
    note: Contains the server routes that perform analysis, research, still generation, clip generation, stitching, music redirect, and video delivery.
status: active
verified: 2026-07-07
---

[[relive-childhood]] is a personalized nostalgia-film app. The active runtime takes a selfie, estimates the user's age, asks for the city where they grew up, researches seven hometown-specific childhood moments, generates one first-person scene per moment, and reveals the finished film only after the clip generation pass has settled.[@home-page][@api-routes]

## What lives here

The runtime is concentrated in [[app/page.tsx]]. That file owns the four-screen client flow, camera lifecycle, travel animation, live film playback, browser-side share fallback, and restart behavior.[@home-page]

The server surface lives under [[app/api/]]. The routes split into six concerns: selfie analysis, hometown research, still generation, clip generation, final stitch, and asset delivery for music and video.[@api-routes]

The repo is intentionally small. [[./package.json]] declares Next.js, React, React DOM, and `ffmpeg-static`, with TypeScript as the main development toolchain.[@package]

## Current product shape

The active client builds a seven-scene film. `runPipeline()` slices research results to seven moments, `SLIDE_MS` is two seconds, and the reveal logic waits until generation has finished before opening the film screen.[@home-page]

Two nearby metadata sources still describe older behavior. [[app/layout.tsx]] still says "five moments," and [[./.env.local.example]] still describes a mixed film with era-only warm slides, but the current code path renders seven researched hometown scenes with no generic filler.[@layout][@home-page]

## Core dependencies

[[gemini]] supplies selfie analysis, research, and still-image generation. [[wan-fleet]] supplies motion clips. [[video-stitching]] uses ffmpeg to assemble the shareable file. [[music-library]] and [[polaroid-library]] provide the bundled audio and travel-screen assets that make the experience feel continuous instead of generated one scene at a time.

## Where to read next

Read [[experience-flow]] for the client sequence, [[generation-pipeline]] for the server orchestration, and [[claude-design-handoff]] for why so much of the interface lives in one large file instead of a component library.
