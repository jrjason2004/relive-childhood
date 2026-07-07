// Fetch real reference images from Google Images via SerpAPI.

export type RefImage = { mimeType: string; data: string }; // data = base64

export async function fetchReferenceImages(query: string, count = 3): Promise<RefImage[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("SERPAPI_KEY is not set");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", query);
  url.searchParams.set("ijn", "0");
  url.searchParams.set("api_key", key);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    images_results?: { original?: string; thumbnail?: string }[];
  };

  const candidates = (json.images_results ?? [])
    .map((r) => r.original || r.thumbnail)
    .filter((u): u is string => Boolean(u));

  // Download a generous batch in parallel (slow/broken URLs would otherwise
  // burn up to 8s each in sequence), then keep the first `count` successes
  // in result order.
  const batch = candidates.slice(0, Math.min(candidates.length, count * 3, 12));
  const downloaded = await Promise.all(batch.map((u) => downloadImage(u)));
  return downloaded.filter((img): img is RefImage => img !== null).slice(0, count);
}

async function downloadImage(url: string): Promise<RefImage | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (relive-childhood reference fetcher)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "image/jpeg";
    // Nano Banana only accepts raster formats — skip SVG and anything else.
    const SUPPORTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    if (!SUPPORTED.includes(mimeType)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 8_000_000) return null;
    return { mimeType, data: buf.toString("base64") };
  } catch {
    return null;
  }
}
