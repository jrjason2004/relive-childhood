import { NextResponse } from "next/server";
import { startFleet } from "@/lib/fleet";

export const runtime = "nodejs";

// Boot-on-entry for the Wan GPU fleet: the client fires this (fire-and-forget)
// the moment someone lands on the site, so the boxes — which stop themselves
// after 15 idle minutes — are usually warm by the time clips are requested.
export async function POST() {
  try {
    return NextResponse.json(await startFleet());
  } catch (err) {
    console.error("[warm] startFleet failed", err);
    return NextResponse.json({ running: 0, starting: 0 });
  }
}
