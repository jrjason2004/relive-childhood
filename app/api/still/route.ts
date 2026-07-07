import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { generateImage } from "@/lib/gemini";
import { fetchReferenceImages, type RefImage } from "@/lib/serpapi";
import { saveStill, composeRealSlide, stillPath } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 120;

// One moment → one 9:16 still, returned directly in the response body (on
// serverless, the instance that generated it may not serve the next GET, so
// the client must get the bytes here) and also saved to the session dir as
// best effort for local/legacy paths.
// mode "generated": real refs guide a Nano Banana 2 POV still.
// mode "real": the best real archival photo becomes a full-screen slide
//              (falls back to "generated" when no usable photo is found).
export async function POST(req: Request) {
  try {
    const { sessionId, index, imagePrompt, referenceQuery, mode } = await req.json();
    if (!sessionId || typeof index !== "number" || !imagePrompt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let refs: RefImage[] = [];
    if (referenceQuery) {
      try {
        refs = await fetchReferenceImages(referenceQuery, mode === "real" ? 6 : 3);
      } catch {
        // proceed without references rather than failing the whole still
      }
    }

    if (mode === "real" && refs.length > 0) {
      // Largest photo is the best print candidate (byte size ~ resolution).
      const best = [...refs].sort((a, b) => b.data.length - a.data.length)[0];
      try {
        await composeRealSlide(sessionId, index, Buffer.from(best.data, "base64"));
        const buf = await fs.readFile(stillPath(sessionId, index));
        return imageResponse(new Uint8Array(buf), "image/jpeg");
      } catch {
        // fall through to the generated path (ffmpeg is local-only anyway)
      }
    }

    // One retry: the narration reads the storyboard slide by slide, so a
    // missing still now shifts every later scene off its sentence.
    let still: Awaited<ReturnType<typeof generateImage>> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !still; attempt++) {
      try {
        still = await generateImage(imagePrompt, refs.slice(0, 3));
      } catch (err) {
        lastErr = err;
      }
    }
    if (!still) throw lastErr instanceof Error ? lastErr : new Error("Image generation failed");
    const bytes = Buffer.from(still.data, "base64");
    await saveStill(sessionId, index, bytes).catch(() => {});
    return imageResponse(new Uint8Array(bytes), still.mimeType || "image/jpeg");
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
