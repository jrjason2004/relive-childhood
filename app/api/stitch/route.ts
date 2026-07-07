import { NextResponse } from "next/server";
import { stitchClips, stitchStills } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { sessionId, indices, mode } = await req.json();
    if (!sessionId || !Array.isArray(indices) || indices.length === 0) {
      return NextResponse.json({ error: "sessionId and indices required" }, { status: 400 });
    }
    if (mode === "clips") await stitchClips(sessionId, indices);
    else await stitchStills(sessionId, indices); // stills are the default film
    return NextResponse.json({ videoUrl: `/api/video?session=${encodeURIComponent(sessionId)}` });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Stitch failed" }, { status: 500 });
  }
}
