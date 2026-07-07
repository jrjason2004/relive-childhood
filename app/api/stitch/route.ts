import { NextResponse } from "next/server";
import { saveClip, stitchClips, stitchStills, stitchHybrid } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { sessionId, indices, mode, povImage, clips } = await readPayload(req);
    if (!sessionId || !Array.isArray(indices) || indices.length === 0) {
      return NextResponse.json({ error: "sessionId and indices required" }, { status: 400 });
    }
    if (clips.length > 0) {
      await Promise.all(clips.map((clip) => saveClip(sessionId, clip.index, clip.data)));
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

async function readPayload(req: Request): Promise<{
  sessionId: string;
  indices: number[];
  mode: string;
  povImage: string;
  clips: Array<{ index: number; data: Buffer }>;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const body = await req.json();
    return {
      sessionId: body.sessionId,
      indices: body.indices,
      mode: body.mode,
      povImage: body.povImage,
      clips: [],
    };
  }

  const form = await req.formData();
  const indices = JSON.parse(String(form.get("indices") ?? "[]"));
  const clips: Array<{ index: number; data: Buffer }> = [];
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0) continue;
    const file = form.get(`clip-${index}`);
    if (!file || typeof file !== "object" || !("arrayBuffer" in file)) continue;
    clips.push({ index, data: Buffer.from(await file.arrayBuffer()) });
  }

  return {
    sessionId: String(form.get("sessionId") ?? ""),
    indices,
    mode: String(form.get("mode") ?? "hybrid"),
    povImage: String(form.get("povImage") ?? ""),
    clips,
  };
}
