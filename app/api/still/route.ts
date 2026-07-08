import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { generateImage, pickBestRef } from "@/lib/gemini";
import { fetchReferenceImages, type RefImage } from "@/lib/refimages";
import { saveStill, composeRealSlide, stillPath } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 120;

// One moment → one 9:16 still, returned directly in the response body (on
// serverless, the instance that generated it may not serve the next GET, so
// the client must get the bytes here) and also saved to the session dir as
// best effort for local/legacy paths.
// The client sends a short activity clause (imagePrompt), the reference
// query, the child's skin tone, and a fallback scene phrase. We pick the
// single best real photo of the place and hand Nano Banana a one-line POV
// prompt with that photo as "the attached scene".
export async function POST(req: Request) {
  try {
    const { sessionId, index, imagePrompt, referenceQuery, skinTone, fallbackScene, mode } =
      await req.json();
    if (!sessionId || typeof index !== "number" || !imagePrompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let ref: RefImage | null = null;
    if (referenceQuery) {
      try {
        // Fetch a batch, then let a vision check pick the ONE clearest real
        // photo of the place from the right era — scrapers return a mix of
        // photos, graphics, maps, and wrong places. Null beats a bad ref.
        const candidates = await fetchReferenceImages(referenceQuery, 6);
        ref = await pickBestRef(referenceQuery, candidates);
      } catch {
        // proceed without a reference rather than failing the whole still
      }
    }

    if (mode === "real" && ref) {
      try {
        await composeRealSlide(sessionId, index, Buffer.from(ref.data, "base64"));
        const buf = await fs.readFile(stillPath(sessionId, index));
        return imageResponse(new Uint8Array(buf), "image/jpeg");
      } catch {
        // fall through to the generated path (ffmpeg is local-only anyway)
      }
    }

    const tone = typeof skinTone === "string" && skinTone ? skinTone : "medium";
    const scene = typeof fallbackScene === "string" ? fallbackScene : "";
    // One retry: a missing still would shift every later storyboard scene.
    let still: Awaited<ReturnType<typeof generateImage>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !still; attempt++) {
      try {
        still = await generateImage(imagePrompt, tone, ref, scene);
      } catch (err) {
        lastErr = err;
      }
    }
    if (!still) throw lastErr instanceof Error ? lastErr : new Error("Image generation failed");
    const bytes = Buffer.from(still.data, "base64");
    await saveStill(sessionId, index, bytes).catch(() => {});
    const res = imageResponse(new Uint8Array(bytes), still.mimeType || "image/jpeg");
    // 1 = a real photo grounded the scene, 0 = generated from the prompt only
    res.headers.set("x-ref-count", ref ? "1" : "0");
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Still generation failed" }, { status: 500 });
  }
}

function imageResponse(bytes: Uint8Array<ArrayBuffer>, mimeType: string): NextResponse {
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}

// Serve a saved still: /api/still?session=X&idx=N
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = url.searchParams.get("session");
  const idx = url.searchParams.get("idx");
  if (!session || idx === null) {
    return NextResponse.json({ error: "session and idx required" }, { status: 400 });
  }
  const n = Number(idx);
  if (!Number.isInteger(n) || n < 0) {
    return NextResponse.json({ error: "invalid idx" }, { status: 400 });
  }
  try {
    const buf = await fs.readFile(stillPath(session, n));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "Content-Length": String(buf.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Still not found" }, { status: 404 });
  }
}
