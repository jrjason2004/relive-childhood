---
title: Vercel Deployment
summary: Vercel Deployment captures the local Vercel link metadata and the serverless constraints that the current code explicitly encodes for ffmpeg, media delivery, and remote worker access.
topics:
  - stack
  - operations
sources:
  - id: vercel-project
    type: file
    path: .vercel/project.json
    note: Records the locally linked Vercel project metadata.
  - id: vercel-readme
    type: file
    path: .vercel/README.txt
    note: Explains the purpose of the local .vercel directory and project.json file.
  - id: next-config
    type: file
    path: next.config.mjs
    note: Migrated from legacy files.
  - id: env-local
    type: file
    path: .env.local.example
    note: Migrated from legacy files.
status: active
verified: 2026-07-07
---

# Vercel deployment

The repo is locally linked to a Vercel project through [[.vercel/project.json]]. That file records `projectName = relive-childhood`, plus a `projectId` and `orgId` for the linked project.[@vercel-project]

[[.vercel/README.txt]] says the `.vercel` directory exists because the repo was linked to a Vercel project and that `project.json` holds the linked project and owner IDs.[@vercel-readme]

The checked-in deployment shape lives in [[./.env.local.example]]. It documents the Gemini variables, the optional image-search credentials, and the Wan worker settings that a remote deployment would need.[@env-local]

Three serverless constraints are directly encoded in the codebase. Media-generating routes return bytes in POST responses instead of relying on shared disk between invocations. `ffmpeg-static` provides the video binary and must stay externalized in [[./next.config.mjs]]. Remote deployments cannot use the local SSM tunnel script, so `COMFY_URL` has to point at worker endpoints that the deployment can reach directly.[@next-config][@env-local]

Related pages: [[wan-fleet]], [[share-film-render]], [[reference-image-grounding]].
