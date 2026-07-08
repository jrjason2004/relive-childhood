import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { generateImage, filterRelevantRefs } from "@/lib/gemini";
import { fetchReferenceImages, type RefImage } from "@/lib/refimages";
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
        // Fetch a wider batch, then keep only candidates a vision check
        // confirms actually depict the queried subject — scrapers sometimes
        // return confident garbage (unrelated clipart, maps, wrong places),
        // and junk refs poison the generated scene. Zero refs beats bad refs.
        const candidates = await fetchReferenceImages(referenceQuery, 6);
        refs = (await filterRelevantRefs(referenceQuery, candidates)).slice(
          0,
          mode === "real" ? 6 : 3,
        );
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

    // One retry: a missing still would shift every later storyboard scene.
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
    const res = imageResponse(new Uint8Array(bytes), still.mimeType || "image/jpeg");
    // how many real reference photos grounded this still (0 = ungrounded)
    res.headers.set("x-ref-count", String(refs.length));
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
