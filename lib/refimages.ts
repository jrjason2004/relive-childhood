// Fetch real reference photos for grounding still generation.
//
// Provider chain, first one that yields images wins:
//   1. Google Programmable Search (official, free 100 queries/day) when
//      GOOGLE_CSE_KEY + GOOGLE_CSE_CX are set
//   2. DuckDuckGo images (keyless, unofficial vqd + i.js endpoints,
//      Bing-backed index) — the free default
//   3. SerpAPI (legacy paid Google Images scrape) when SERPAPI_KEY is set
// Every provider throws or returns []; callers already treat an empty list
// as "generate ungrounded".

export type RefImage = { mimeType: string; data: string }; // data = base64

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function fetchReferenceImages(query: string, count = 3): Promise<RefImage[]> {
  const providers: Array<() => Promise<string[]>> = [];
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) {
    providers.push(() => googleCseUrls(query, count));
  }
  providers.push(() => duckDuckGoUrls(query));
  if (process.env.SERPAPI_KEY) providers.push(() => serpApiUrls(query));

  for (const provider of providers) {
    let candidates: string[] = [];
    try {
      candidates = await provider();
    } catch {
      continue;
    }
    if (candidates.length === 0) continue;
    // Download a generous batch in parallel (slow/broken URLs would otherwise
    // burn up to 8s each in sequence), then keep the first `count` successes
    // in result order.
    const batch = candidates.slice(0, Math.min(candidates.length, count * 3, 12));
    const downloaded = await Promise.all(batch.map((u) => downloadImage(u)));
    const refs = downloaded.filter((img): img is RefImage => img !== null).slice(0, count);
    if (refs.length > 0) return refs;
  }
  return [];
}

async function googleCseUrls(query: string, count: number): Promise<string[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", process.env.GOOGLE_CSE_KEY!);
  url.searchParams.set("cx", process.env.GOOGLE_CSE_CX!);
  url.searchParams.set("q", query);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", String(Math.min(count * 3, 10)));
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Google CSE ${res.status}`);
  const json = (await res.json()) as { items?: { link?: string }[] };
  return (json.items ?? []).map((r) => r.link).filter((u): u is string => Boolean(u));
}

async function duckDuckGoUrls(query: string): Promise<string[]> {
  // Step 1: any DDG search page embeds a per-query vqd token the image API
  // requires.
  const page = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) },
  );
  if (!page.ok) throw new Error(`DDG token page ${page.status}`);
  const html = await page.text();
  const vqd = html.match(/vqd=["']?([\d-]+)/)?.[1];
  if (!vqd) throw new Error("DDG vqd token not found");

  // Step 2: the JSON endpoint the DDG images tab itself calls.
  const url = new URL("https://duckduckgo.com/i.js");
  url.searchParams.set("l", "us-en");
  url.searchParams.set("o", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("vqd", vqd);
  url.searchParams.set("f", ",,,");
  url.searchParams.set("p", "1");
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA, Referer: "https://duckduckgo.com/" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DDG images ${res.status}`);
  const json = (await res.json()) as { results?: { image?: string; thumbnail?: string }[] };
  return (json.results ?? [])
    .map((r) => r.image || r.thumbnail)
    .filter((u): u is string => Boolean(u));
}

async function serpApiUrls(query: string): Promise<string[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", query);
  url.searchParams.set("ijn", "0");
  url.searchParams.set("api_key", process.env.SERPAPI_KEY!);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    images_results?: { original?: string; thumbnail?: string }[];
  };
  return (json.images_results ?? [])
    .map((r) => r.original || r.thumbnail)
    .filter((u): u is string => Boolean(u));
}

async function downloadImage(url: string): Promise<RefImage | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": UA },
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
