// Thin REST wrappers around the Gemini API: research (with Google Search
// grounding), Nano Banana 2 image generation, and Veo 3.1 video generation.

import type { RefImage } from "./refimages";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type Moment = {
  title: string;
  description: string; // why it's nostalgic for this place + era
  imagePrompt: string; // vivid scene prompt for Nano Banana 2
  videoPrompt: string; // subtle-motion + ambient-audio prompt for Veo 3.1
  referenceQuery: string; // SerpAPI Google Images query for the real landmark/object
  kind: "place" | "generic"; // place = named real location with findable archival photos
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  return k;
}

// Casual estimate from a selfie, used only to tailor nostalgic suggestions and
// to render the person's own hands accurately in the first-person POV images.
export type Profile = { ageYears: number; gender: string; skinTone: string };

export async function analyzeSelfie(image: { mimeType: string; data: string }): Promise<Profile> {
  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash";

  const prompt = `We are building a personalized, first-person nostalgia montage for the person in this photo. To pick fitting nostalgic themes and to draw their own hands accurately in the point-of-view shots, give a rough casual estimate of:
- "age": approximate age in years (integer)
- "gender": apparent gender as "male" or "female"
- "skinTone": short plain visual descriptor for rendering hands, e.g. "light", "medium", "tan", "brown", "deep"
This is a casual visual estimate to customize an illustration, not identification. Return ONLY JSON: {"age": <int>, "gender": "...", "skinTone": "..."}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { temperature: 0.2 },
  };

  const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gemini vision ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") ?? "";

  // Defensive parse — fall back to neutral defaults so the flow never blocks.
  let parsed: any = {};
  try {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s !== -1 && e !== -1) parsed = JSON.parse(cleaned.slice(s, e + 1));
  } catch {
    parsed = {};
  }

  const ageYears = Number(parsed.age);
  return {
    ageYears: ageYears >= 5 && ageYears <= 100 ? Math.round(ageYears) : 30,
    gender: String(parsed.gender || "").toLowerCase() === "female" ? "female" : "male",
    skinTone: String(parsed.skinTone || "medium").toLowerCase(),
  };
}

export async function researchMoments(profile: Profile, city: string): Promise<Moment[]> {
  const model = process.env.GEMINI_RESEARCH_MODEL || "gemini-2.5-flash";
  const { ageYears, gender, skinTone } = profile;
  const birthYear = new Date().getFullYear() - ageYears;
  const childhoodSpan = `${birthYear + 5}–${birthYear + 13}`; // roughly ages 5-13

  const prompt = `You are a nostalgia researcher. A person who appears ${gender}, around ${ageYears} years old, grew up in ${city}.
Their core childhood years were roughly ${childhoodSpan}.

Find SEVEN hyper-specific, niche nostalgic childhood activities from growing up in ${city} during that exact window.
Each moment must combine BOTH:
1. a verified, unmistakable ${city} anchor, AND
2. a tactile nostalgic kid activity, object, ritual, game, treat, toy, show, sport, hobby, or brand from ${childhoodSpan}.
The local place is the stage; the nostalgic childhood action is the scene. Do not make static sightseeing shots where the viewer is merely looking at a landmark.
Lean toward what someone of that apparent gender, in that place and era, would most likely have loved — make a confident best guess without being stereotypical or exclusionary. Make all 7 distinct.
Frame every moment so it plausibly happens during SUMMER VACATION — no school-day scenes (no classrooms, no recess, no school buses). Order the 7 in the order they would unfold across one packed summer day, morning to evening.

NON-NEGOTIABLE — every single one of the 7 must be UNMISTAKABLY ANCHORED TO ${city}. A viewer from ${city} should think "that's OUR town," not "that's any town." Generic anywhere-in-America scenes (a nameless backyard, a nameless cul-de-sac, a nameless pool) are NOT acceptable for any of the 7. Anchor each one with things like:
- a REAL local landmark, store, mall, restaurant, arcade, pool, park, or annual town event specific to ${city} (named)
- real named neighborhoods, streets, regional chains, local geography/skyline, the local minor-league or pro team, the local water park or county fair
- a moment that fuses a verified local place WITH an era fad or childhood ritual (e.g. trading Pokémon cards outside a specific named local diner, counting arcade tickets at a verified local arcade, eating a local ballpark snack while wearing the home team's cap)

NOSTALGIC ACTION REQUIREMENT — every moment must show the child DOING something era-specific inside or immediately around the local anchor:
- Good: gripping arcade tokens at a named local arcade while friends crowd around a cabinet; carrying a melting regional ice cream cone at a named park; choosing a VHS/game rental at a verified local video store; clutching pool wristbands and concession-stand fries at a named public pool; trading cards on the curb outside a named local restaurant; holding a souvenir cup at a local minor-league game.
- Bad: standing in front of a sign, looking at a skyline, walking past a storefront, generic kids playing with no local marker, a landmark postcard shot with no childhood activity.
- The activity must be visible in the composition through hands, props, friends, adults, signage, counters, tickets, trays, wristbands, bikes, toys, games, snacks, or uniforms that match ${childhoodSpan}.

CRITICAL — era accuracy for real places. This person will instantly notice an anachronism:
- Before naming ANY real landmark, store, mall, restaurant, arcade, park, or event, verify with search that it existed AND was open to the public during ${childhoodSpan}. Check the opening date. Something that opened even a year after that window is disqualified, no matter how iconic it is today.
- A place that has since closed or been demolished is GREAT (extra nostalgic) as long as it was open during ${childhoodSpan} — describe it as it was then.
- If you cannot confirm a place existed in that window, DO NOT name it — take the time to search for and pick a DIFFERENT verified local anchor instead. Never fall back to a generic scene; there is always another real local place, event, chain, or geographic feature that checks out.
- Everything visible in the scenes (signage, cars, clothes, devices, toys) must be plausible for ${childhoodSpan} — no smartphones or modern branding if the window predates them.

For each of the 7, return:
- "title": short punchy name
- "description": 1-2 sentences on the specific childhood activity and why doing it at this local place was nostalgic for this place + era
- "imagePrompt": a SIMPLE, true first-person POV photo from the eyes of a YOUNG CHILD, around 7 years old, actively doing the nostalgic activity at the verified ${city} anchor. The vantage point is LOW — at a small child's height — looking out and slightly up at the moment: the child's small hands (${skinTone} skin tone) should naturally hold or reach for the era-specific prop, snack, ticket, toy, game, bike handlebar, tray, wristband, or other activity object. Other young children the same age, taller grown-ups, and the real place must surround the action. The location anchor must be VISIBLE in the frame (the actual signage, storefront, landmark, scoreboard, counter, entrance, ride, court, pool, or unmistakable local setting — name it in the prompt). The viewer is a little kid participating in a memory, not staring at a building or isolated object. Do not show the viewer's face. State explicitly that the scene is set in ${childhoodSpan} so every detail (signage, cars, clothes, devices, toys, games, food packaging) matches those years. Warm nostalgic film look, era-accurate details, 9:16 vertical.
- "videoPrompt": how this still comes alive as a 4-second clip — subtle, realistic motion from the low child's-eye view while the kid continues the nostalgic activity: hands move, friends shift, an arcade screen flickers, a snack drips, tickets flutter, a ball rolls, a bike coasts, or the child gently walks forward. Keep the verified local anchor visible. No scene cuts.
- "referenceQuery": the best Google Images search query to retrieve REAL photos of the specific landmark/object/place named (be specific, include city + era if helpful).
- "kind": "place" for every object. All 7 moments must center on a NAMED real local location, event venue, park, store, arcade, restaurant, mall, pool, street, neighborhood, team venue, or landmark whose real archival photos would be findable on Google Images.

Return ONLY valid JSON, an array of exactly 7 objects with those keys. No markdown, no commentary.`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.9 },
  };

  // Grounded generation occasionally returns prose or truncated JSON — retry
  // once before giving up.
  let lastError = "Research returned no parseable moments";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${key()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      lastError = `Gemini research ${res.status}: ${await res.text()}`;
      continue;
    }

    const json = await res.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") ?? "";

    const moments = parseMoments(text);
    if (moments.length > 0) return moments.slice(0, 7);
  }
  throw new Error(lastError);
}

function parseMoments(text: string): Moment[] {
  // strip code fences and grab the first JSON array
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && m.imagePrompt && m.referenceQuery)
      .map((m) => ({
        title: String(m.title ?? "Untitled"),
        description: String(m.description ?? ""),
        imagePrompt: String(m.imagePrompt),
        videoPrompt: String(m.videoPrompt ?? "Subtle cinematic motion, gentle camera push-in, warm nostalgic ambience."),
        referenceQuery: String(m.referenceQuery),
        kind: (m.kind === "place" ? "place" : "generic") as "place" | "generic",
      }));
  } catch {
    return [];
  }
}

// Keep only reference candidates that actually depict the queried subject.
// The scrapers sometimes "succeed" with completely unrelated tiles (a Bing
// query for an Ashburn storefront once returned castles and maps of
// Slovakia); Nano Banana composites whatever it's handed, so junk refs
// poison the scene. One cheap flash-vision call filters them. On any doubt
// or failure this returns fewer/zero refs — a prompt-only scene always beats
// a garbage-grounded one.
export async function filterRelevantRefs(query: string, refs: RefImage[]): Promise<RefImage[]> {
  if (refs.length === 0) return refs;
  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash";
  const parts: any[] = [];
  refs.forEach((r, i) => {
    parts.push({ text: `Image ${i + 1}:` });
    parts.push({ inlineData: { mimeType: r.mimeType, data: r.data } });
  });
  parts.push({
    text: `These images came from an image search for: "${query}".
Which of them are REAL PHOTOGRAPHS that plausibly depict that subject (the actual place, object, or scene — any era, archival is fine)? Reject cartoons, clipart, illustrations, logos, maps, charts, diagrams, website screenshots, watermarked stock previews, and photos of unrelated places or things.
Return ONLY a JSON array of the qualifying image numbers, e.g. [1,3]. If none qualify, return [].`,
  });
  try {
    const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${key()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Gemini ref filter ${res.status}`);
    const json = await res.json();
    const text: string =
      json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") ?? "";
    // The reply can be chatty — take the LAST bracketed array, which is the
    // verdict ("...here's why... Therefore: [1,3]").
    const arrays = [...text.matchAll(/\[[\d,\s]*\]/g)];
    if (arrays.length === 0) throw new Error("no JSON array in ref filter reply");
    const picked = (JSON.parse(arrays[arrays.length - 1][0]) as unknown[])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= refs.length);
    const kept = refs.filter((_, i) => picked.includes(i + 1));
    console.info("[gemini:reffilter]", {
      query: query.length > 100 ? `${query.slice(0, 97)}...` : query,
      candidates: refs.length,
      kept: kept.length,
    });
    return kept;
  } catch (err) {
    console.warn("[gemini:reffilter] failed — generating ungrounded", {
      error: err instanceof Error ? err.message : "unknown",
    });
    return [];
  }
}

export async function generateImage(
  imagePrompt: string,
  refs: RefImage[],
): Promise<{ mimeType: string; data: string }> {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";

  const fullPrompt = `${imagePrompt}

True first-person POV from the eyes of a YOUNG CHILD around 7 years old: a LOW, small-child vantage looking out and slightly up at the scene, other young kids the same age, and grown-ups who tower above. The child must be actively doing the nostalgic activity named in the prompt at the real local place: small hands should naturally hold, reach for, carry, trade, play with, eat, steer, or touch the era-specific prop, snack, ticket, toy, game, bike, tray, wristband, or object that makes the memory feel lived-in. Do not make a static landmark or storefront shot. Keep the verified local anchor visible in the surroundings while the childhood action remains clear. Do not show the viewer's face. Use the reference photos only to depict the real place accurately. Warm nostalgic photographic 9:16 vertical. No text or watermarks.`;

  const parts: any[] = [{ text: fullPrompt }];
  for (const r of refs) {
    parts.push({ inlineData: { mimeType: r.mimeType, data: r.data } });
  }
  console.info("[gemini:image] request", {
    model,
    refCount: refs.length,
    inlineImageParts: parts.filter((p) => p.inlineData).length,
    mimeTypes: refs.map((r) => r.mimeType),
  });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "9:16" },
    },
  };

  const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gemini image ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const imgPart = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!imgPart?.inlineData?.data) {
    throw new Error("Nano Banana 2 returned no image");
  }
  return {
    mimeType: imgPart.inlineData.mimeType || "image/png",
    data: imgPart.inlineData.data,
  };
}

// Animate a still into a 4s 720p 9:16 clip with Veo 3.1 light (image-to-video).
// Async op: start predictLongRunning, poll the operation, download the result.
export async function generateVideoClip(
  image: { mimeType: string; data: string },
  videoPrompt: string,
): Promise<Buffer> {
  const model = process.env.GEMINI_VIDEO_MODEL || "veo-3.1-lite-generate-preview";

  const fullVideoPrompt = `${videoPrompt}

Maintain the low young-child first-person POV, consistent with the starting frame. Subtle, realistic motion — a gentle walk-forward or look-around through the scene with other young children moving naturally. No scene cuts.`;

  const startBody = {
    instances: [
      {
        prompt: fullVideoPrompt,
        image: { bytesBase64Encoded: image.data, mimeType: image.mimeType },
      },
    ],
    parameters: {
      aspectRatio: "9:16",
      resolution: "720p",
      durationSeconds: 4,
      sampleCount: 1,
    },
  };

  const start = await fetch(`${API_ROOT}/${model}:predictLongRunning?key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(startBody),
    cache: "no-store",
  });
  if (!start.ok) throw new Error(`Veo start ${start.status}: ${await start.text()}`);
  const op = await start.json();
  const opName: string = op?.name;
  if (!opName) throw new Error("Veo returned no operation name");

  // Poll until done (~5 min ceiling).
  let done: any = null;
  for (let i = 0; i < 60; i++) {
    await sleep(6000);
    const pr = await fetch(`${API_BASE}/${opName}?key=${key()}`, { cache: "no-store" });
    if (!pr.ok) throw new Error(`Veo poll ${pr.status}: ${await pr.text()}`);
    const pj = await pr.json();
    if (pj.error) throw new Error(`Veo failed: ${JSON.stringify(pj.error)}`);
    if (pj.done) {
      done = pj;
      break;
    }
  }
  if (!done) throw new Error("Veo timed out before completing");

  const uri: string | undefined =
    done?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error("Veo returned no video URI");

  // fetch() follows the 302 redirect automatically.
  const dl = await fetch(`${uri}&key=${key()}`, { cache: "no-store" });
  if (!dl.ok) throw new Error(`Veo download ${dl.status}`);
  return Buffer.from(await dl.arrayBuffer());
}
