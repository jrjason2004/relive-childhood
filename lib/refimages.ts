// Fetch real reference photos for grounding still generation.
//
// Provider chain, first one that yields images wins:
//   1. DuckDuckGo images (keyless, unofficial vqd + i.js endpoints,
//      Bing-backed index) — the default
//   2. Bing Images HTML scrape (keyless fallback when DDG is blocked)
//   3. Google Programmable Search (official, free 100 queries/day) when
//      GOOGLE_CSE_KEY + GOOGLE_CSE_CX are set
//   4. SerpAPI (legacy paid Google Images scrape) when SERPAPI_KEY is set
// Every provider throws or returns []; callers already treat an empty list
// as "generate ungrounded".

export type RefImage = { mimeType: string; data: string }; // data = base64

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function fetchReferenceImages(query: string, count = 3): Promise<RefImage[]> {
  const providers: Array<{ name: string; urls: () => Promise<string[]> }> = [
    { name: "duckduckgo", urls: () => duckDuckGoUrls(query) },
  ];
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) {
    providers.push({ name: "google_cse", urls: () => googleCseUrls(query, count) });
  }
  if (process.env.SERPAPI_KEY) providers.push({ name: "serpapi", urls: () => serpApiUrls(query) });
  // Scraped Bing is the LAST resort: to server-side fetches it serves a
  // degraded anti-bot page whose tiles are unrelated to the query (verified:
  // a Blockbuster query returned beauty-site images; an Ashburn query
  // returned Slovakia). Anything it yields must pass the vision relevance
  // filter before grounding a scene.
  providers.push({ name: "bing", urls: () => bingImageUrls(query) });

  for (const provider of providers) {
    let candidates: string[] = [];
    try {
      candidates = await provider.urls();
    } catch (err) {
      console.warn("[refimages] provider_failed", {
        provider: provider.name,
        query: queryPreview(query),
        error: err instanceof Error ? err.message : "unknown error",
      });
      continue;
    }
    if (candidates.length === 0) continue;
    // Download a generous batch in parallel (slow/broken URLs would otherwise
    // burn up to 8s each in sequence), then keep the first `count` successes
    // in result order.
    const batch = candidates.slice(0, Math.min(candidates.length, count * 3, 12));
    const downloaded = await Promise.all(batch.map((u) => downloadImage(u)));
    const refs = downloaded.filter((img): img is RefImage => img !== null).slice(0, count);
    console.info("[refimages] provider_result", {
      provider: provider.name,
      query: queryPreview(query),
      candidates: candidates.length,
      batch: batch.length,
      refs: refs.length,
      mimeTypes: refs.map((r) => r.mimeType),
    });
    if (refs.length > 0) return refs;
  }
  console.warn("[refimages] no_refs", { query: queryPreview(query), requested: count });
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

async function bingImageUrls(query: string): Promise<string[]> {
  const url = new URL("https://www.bing.com/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("form", "HDRSC2");
  url.searchParams.set("first", "1");

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Bing images ${res.status}`);
  const html = await res.text();
  const urls: string[] = [];
  for (const match of html.matchAll(/m=(["'])(.*?)\1/g)) {
    const raw = decodeHtml(match[2]);
    if (!raw.includes("murl")) continue;
    try {
      const item = JSON.parse(raw) as { murl?: unknown };
      if (typeof item.murl === "string" && item.murl.startsWith("http")) {
        urls.push(item.murl);
      }
    } catch {
      // Other `m` attributes are not image metadata.
    }
  }
  return [...new Set(urls)];
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

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function queryPreview(query: string): string {
  return query.length > 160 ? `${query.slice(0, 157)}...` : query;
}
