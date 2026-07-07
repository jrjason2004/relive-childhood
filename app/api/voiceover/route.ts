import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { generateNarrationPart, synthesizeSpeech, type Profile } from "@/lib/gemini";
import { saveVoiceover, voiceoverPath } from "@/lib/video";

export const runtime = "nodejs";
export const maxDuration = 120;

// Two-part summer-day narration that walks the film's storyboard in slide
// order, one sentence per scene. Part 1 (the opening, warm slides only) is
// requested the moment travel starts and gates the film reveal, so it's kept
// short and synthesized in one TTS call; part 2 (the researched scenes)
// continues from part 1's script and takes over when the opening ends. Each
// part is saved as WAV on the session; the script comes back so the client
// can hand part 1's text to the part 2 request.
export async function POST(req: Request) {
  try {
    const { sessionId, profile, city, scenes, part, prevScript } = await req.json();
    const p: 1 | 2 = part === 2 ? 2 : 1;
    if (!sessionId || !profile || !city) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const script = await generateNarrationPart(
      profile as Profile,
      city,
      Array.isArray(scenes) ? scenes.map(String) : [],
      p,
      typeof prevScript === "string" ? prevScript : "",
    );
    const { wav, duration } = await synthesizeSpeech(script, p === 1 ? 1 : 3);
    // Return the audio in the response body (serverless instances don't
    // share /tmp, so a follow-up GET could miss it); disk is best effort.
    await saveVoiceover(sessionId, p, wav).catch(() => {});
    return new NextResponse(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        "Cache-Control": "no-store",
        "x-vo-duration": duration.toFixed(2),
        "x-vo-script": encodeURIComponent(script),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Voiceover failed" }, { status: 500 });
  }
}

// Serve a saved voiceover part: /api/voiceover?session=X&part=1|2
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = url.searchParams.get("session");
  const part = url.searchParams.get("part") === "2" ? 2 : 1;
  if (!session) {
    return NextResponse.json({ error: "session required" }, { status: 400 });
  }
  try {
    const buf = await fs.readFile(voiceoverPath(session, part));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "Content-Length": String(buf.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Voiceover not found" }, { status: 404 });
  }
}
