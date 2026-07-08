import { NextResponse } from "next/server";
import { generateImage, pickBestRef } from "@/lib/gemini";
import { generateVideoClip } from "@/lib/wan";
import { fetchReferenceImages } from "@/lib/refimages";
import { saveClip } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 600;

// One slide → one Wan 2.2 A14B clip, returned directly in the response body
// and saved to the session dir for the local stitch.
// Primary shape: { sessionId, index, videoPrompt, image: {data, mimeType} } —
// the client already has the Nano Banana still and Wan animates exactly it,
// so the travel-screen teaser flash and the film clip match.
// Legacy shape (imagePrompt + referenceQuery, no image) still generates the
// still server-side first.
export async function POST(req: Request) {
  try {
    const { sessionId, index, imagePrompt, videoPrompt, referenceQuery, skinTone, fallbackScene, image } =
      await req.json();
    if (!sessionId || typeof index !== "number" || !videoPrompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let still: { mimeType: string; data: string };
    if (image?.data && image?.mimeType) {
      still = { mimeType: String(image.mimeType), data: String(image.data) };
    } else {
      if (!imagePrompt) {
        return NextResponse.json({ error: "image or imagePrompt required" }, { status: 400 });
      }
      let ref = null;
      if (referenceQuery) {
        try {
          ref = await pickBestRef(referenceQuery, await fetchReferenceImages(referenceQuery, 6));
        } catch {
          // proceed without a reference rather than failing the whole clip
        }
      }
      still = await generateImage(
        imagePrompt,
        typeof skinTone === "string" && skinTone ? skinTone : "medium",
        ref,
        typeof fallbackScene === "string" ? fallbackScene : "",
      );
    }

    const clip = await generateVideoClip(still, videoPrompt);
    await saveClip(sessionId, index, clip).catch(() => {});

    return new NextResponse(new Uint8Array(clip), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(clip.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Clip generation failed" }, { status: 500 });
  }
}
