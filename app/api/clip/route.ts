import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { generateVideoClip } from "@/lib/wan";
import { fetchReferenceImages } from "@/lib/serpapi";
import { saveClip } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 3000;

// One moment → real refs → Nano Banana 2 still → Wan 2.2 A14B clip → saved to session.
export async function POST(req: Request) {
  try {
    const { sessionId, index, imagePrompt, videoPrompt, referenceQuery } = await req.json();
    if (!sessionId || typeof index !== "number" || !imagePrompt || !videoPrompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let refs: Awaited<ReturnType<typeof fetchReferenceImages>> = [];
    let refCount = 0;
    if (referenceQuery) {
      try {
        refs = await fetchReferenceImages(referenceQuery, 3);
        refCount = refs.length;
      } catch {
        // proceed without references rather than failing the whole clip
      }
    }

    const still = await generateImage(imagePrompt, refs);
    const clip = await generateVideoClip(still, videoPrompt);
    await saveClip(sessionId, index, clip);

    return NextResponse.json({
      index,
      refCount,
      poster: `data:${still.mimeType};base64,${still.data}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Clip generation failed" }, { status: 500 });
  }
}
