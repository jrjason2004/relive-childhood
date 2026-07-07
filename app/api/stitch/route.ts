import { NextResponse } from "next/server";
import { stitchClips, stitchStills, stitchHybrid } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { sessionId, indices, mode, povImage } = await req.json();
    if (!sessionId || !Array.isArray(indices) || indices.length === 0) {
      return NextResponse.json({ error: "sessionId and indices required" }, { status: 400 });
    }
    if (mode === "clips") await stitchClips(sessionId, indices);
    else if (mode === "stills") await stitchStills(sessionId, indices);
    // hybrid is the default film: Wan clips where they rendered, Ken Burns
    // stills elsewhere, music-only audio, and the client-rendered POV line
    // (transparent PNG) burned in on top.
    else {
      const png =
        typeof povImage === "string" && povImage.length > 0
          ? Buffer.from(povImage.replace(/^data:image\/png;base64,/, ""), "base64")
          : null;
      await stitchHybrid(sessionId, indices, png);
    }
    return NextResponse.json({ videoUrl: `/api/video?session=${encodeURIComponent(sessionId)}` });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Stitch failed" }, { status: 500 });
  }
}
