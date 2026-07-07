import { promises as fs } from "fs";
import { clipPath, finalPath } from "@/lib/video";

export const runtime = "nodejs";

// ?session=X            → the final stitched film
// ?session=X&clip=N     → an individual clip (used by the live player)
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const session = params.get("session");
  if (!session) return new Response("missing session", { status: 400 });

  const clip = params.get("clip");
  let file: string;
  if (clip === null) {
    file = finalPath(session);
  } else {
    const index = Number(clip);
    if (!Number.isInteger(index) || index < 0) {
      return new Response("bad clip index", { status: 400 });
    }
    file = clipPath(session, index);
  }

  try {
    const buf = await fs.readFile(file);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
