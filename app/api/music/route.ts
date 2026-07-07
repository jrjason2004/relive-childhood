import { trackNameForSession } from "@/lib/music";

export const runtime = "nodejs";

// Redirects to the session's deterministically-assigned track in
// public/music. The static layer serves the actual bytes (the ~11MB tracks
// exceed serverless response limits, and static serving gets proper Range
// support for Safari's audio streaming).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = url.searchParams.get("session");
  if (!session) return new Response("missing session", { status: 400 });

  const name = trackNameForSession(session);
  if (!name) return new Response("no music library", { status: 404 });

  return Response.redirect(new URL(`/music/${name}`, url.origin), 302);
}
