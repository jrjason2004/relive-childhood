import { NextResponse } from "next/server";
import { analyzeSelfie } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fast selfie analysis for the scan screen — returns the profile so the
// research call can run later (during the time-travel screen) without
// re-analyzing the photo.
export async function POST(req: Request) {
  try {
    const { image, mimeType } = await req.json();
    if (!image || !mimeType) {
      return NextResponse.json({ error: "An image is required." }, { status: 400 });
    }
    const profile = await analyzeSelfie({ mimeType, data: image });
    return NextResponse.json({ profile });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Analysis failed" }, { status: 500 });
  }
}
