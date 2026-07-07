// Background-music library: a session is deterministically assigned one track
// so the live player (browser) and any legacy ffmpeg mix always use the same
// music. Session ids are random UUIDs, so the pick is effectively a random
// rotation across the library. The tracks live in public/music so Vercel's
// static layer serves them (11MB files with Range support, no function
// limits); TRACKS is a build-time constant because serverless functions
// can't readdir the public folder at runtime.

import path from "path";

const TRACKS = ["childhood-1.mp3", "childhood-2.mp3", "childhood-3.mp3"];

export function trackNameForSession(sessionId: string): string | null {
  if (TRACKS.length === 0) return null;
  let h = 0;
  for (const ch of sessionId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TRACKS[h % TRACKS.length];
}

// Filesystem path for the legacy ffmpeg stitch (local Wan mode only).
export async function trackForSession(sessionId: string): Promise<string | null> {
  const name = trackNameForSession(sessionId);
  return name ? path.join(process.cwd(), "public", "music", name) : null;
}
