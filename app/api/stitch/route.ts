import { NextResponse } from "next/server";
import { get, del } from "@vercel/blob";
import { saveClip, stitchClips, stitchStills, stitchHybrid } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { sessionId, indices, mode, povImage, clips, clipUrls } = await readPayload(req);
    if (!sessionId || !Array.isArray(indices) || indices.length === 0) {
      return NextResponse.json({ error: "sessionId and indices required" }, { status: 400 });
    }
    if (clips.length > 0) {
      await Promise.all(clips.map((clip) => saveClip(sessionId, clip.index, clip.data)));
    }
    // Blob mode: the phone uploaded the clips to Blob storage (no request
    // body cap) and only sent their URLs — pull them down server-side.
    if (clipUrls.length > 0) {
      await Promise.all(
        clipUrls.map(async ({ index, url }) => {
          const result = await get(url, { access: "private" });
          if (!result || result.stream === null) {
            throw new Error(`Clip ${index} missing from Blob storage`);
          }
          const data = Buffer.from(await new Response(result.stream).arrayBuffer());
          await saveClip(sessionId, index, data);
        }),
      );
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
    // The clips served their purpose — clear them out of Blob storage.
    if (clipUrls.length > 0) {
      del(clipUrls.map((c) => c.url)).catch(() => {});
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
  clipUrls: Array<{ index: number; url: string }>;
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
      clipUrls: Array.isArray(body.clipUrls)
        ? body.clipUrls.filter(
            (c: unknown): c is { index: number; url: string } =>
              !!c &&
              typeof c === "object" &&
              Number.isInteger((c as { index?: unknown }).index) &&
              typeof (c as { url?: unknown }).url === "string",
          )
        : [],
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
    clipUrls: [],
  };
}
