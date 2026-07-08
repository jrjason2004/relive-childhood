import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

// Mints short-lived client-upload tokens so the phone can push its Wan clips
// straight to Blob storage. Vercel caps request bodies at ~4.5MB, so a full
// film can't ride inside the stitch POST — Blob has no such cap, which keeps
// the fast server ffmpeg stitch viable for every film.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/mp4", "video/webm"],
        addRandomSuffix: true,
        maximumSizeInBytes: 64 * 1024 * 1024,
        validUntil: Date.now() + 10 * 60 * 1000,
      }),
    });
    return NextResponse.json(json);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload token failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
