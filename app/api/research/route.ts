import { NextResponse } from "next/server";
import { analyzeSelfie, researchMoments, type Profile } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

// Accepts either a pre-computed profile (from /api/analyze, used by the scan
// screen) or a raw selfie image to analyze inline.
export async function POST(req: Request) {
  try {
    const { image, mimeType, city, profile } = await req.json();
    if (!city || typeof city !== "string") {
      return NextResponse.json({ error: "A city is required." }, { status: 400 });
    }

    let prof: Profile;
    if (profile && typeof profile.ageYears === "number") {
      prof = {
        ageYears: Math.round(profile.ageYears),
        gender: String(profile.gender || "male"),
        skinTone: String(profile.skinTone || "medium"),
      };
    } else if (image && mimeType) {
      prof = await analyzeSelfie({ mimeType, data: image });
    } else {
      return NextResponse.json({ error: "A selfie or profile is required." }, { status: 400 });
    }

    const moments = await researchMoments(prof, city.trim());

    const birthYear = new Date().getFullYear() - prof.ageYears;
    const decade = `${Math.floor((birthYear + 9) / 10) * 10}s`;

    return NextResponse.json({
      moments,
      profile: { ageYears: prof.ageYears, era: decade },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Research failed" }, { status: 500 });
  }
}
