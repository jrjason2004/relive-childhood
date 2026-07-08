---
topics:
  - stack
  - deploy
sources:
  - id: next-config
    type: file
    path: next.config.mjs
    note: Migrated from legacy files.
  - id: env-local
    type: file
    path: .env.local.example
    note: Migrated from legacy files.

---

# Vercel deployment

Project `relive-childhood`, team `jasons-projects-608a66ae`, production alias `relive-childhood.vercel.app`, behind Vercel Deployment Protection (SSO) by default. Deploy with `vercel --prod --yes`.

Production env vars: `GEMINI_API_KEY`, `GEMINI_RESEARCH_MODEL=gemini-2.5-flash`, `GEMINI_IMAGE_MODEL=gemini-3.1-flash-lite-image`, `SERPAPI_KEY` (dead — out of credits), and the Wan set `COMFY_URL` / `WAN_WIDTH=480` / `WAN_HEIGHT=864` / `WAN_LENGTH=33` / `WAN_GEN_LENGTH=17`. `COMFY_URL` in production points at the [[wan-fleet]] workers' **public IPs** on `:8188` (the SSM tunnels are localhost-only); those IPs are ephemeral, so a worker stop/start requires a Vercel env update. Writing secrets to Vercel required explicit approval from Jason — the permission classifier blocks secret-store writes.

Serverless constraints that shaped the code:

- **No shared disk between invocations.** Any route that generates media returns the bytes in the POST response body; the client keeps blobs. The stitch route receives the clips back as multipart uploads (see [[share-film-render]]).
- **No system ffmpeg** — `ffmpeg-static` provides the binary, and it must be listed in `serverExternalPackages` (`next.config.mjs`) or Next's bundling breaks its path (`spawn /ROOT/... ENOENT`).
- **DuckDuckGo is blocked from Vercel IPs** — the Bing fallback carries reference grounding in production ([[reference-image-grounding]]).
- `.env.local` on the Mac holds the live keys and must never be clobbered; `vercel link` once appended `VERCEL_OIDC_TOKEN` to it. `.env.local.example` is the documented shape.

Local dev quirk unrelated to Vercel but hit constantly while verifying: a hidden/occluded browser window throttles timers and suspends media, so timing-sensitive checks need a visible window (pages actively playing audio are exempt from the heaviest throttling).
