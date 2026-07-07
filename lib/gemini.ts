// Thin REST wrappers around the Gemini API: research (with Google Search
// grounding), Nano Banana 2 image generation, and Veo 3.1 video generation.

import type { RefImage } from "./serpapi";

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

Find SEVEN hyper-specific, niche nostalgic things from growing up in ${city} during that exact window.
Lean toward what someone of that apparent gender, in that place and era, would most likely have loved (toys, shows, games, hobbies, brands) — make a confident best guess without being stereotypical or exclusionary. Make all 7 distinct.
Frame every moment so it plausibly happens during SUMMER VACATION — no school-day scenes (no classrooms, no recess, no school buses). Order the 7 in the order they would unfold across one packed summer day, morning to evening — they become both the film's slides and the beats of its narration. Favor things like:
- a REAL local landmark, store, mall, restaurant, arcade, or annual town event specific to ${city}
- popular toys, shows, games, fads of that exact era
- a moment that fuses a local place WITH an era fad (e.g. trading Silly Bandz outside a specific local diner)

CRITICAL — era accuracy for real places. This person will instantly notice an anachronism:
- Before naming ANY real landmark, store, mall, restaurant, arcade, park, or event, verify with search that it existed AND was open to the public during ${childhoodSpan}. Check the opening date. Something that opened even a year after that window is disqualified, no matter how iconic it is today.
- A place that has since closed or been demolished is GREAT (extra nostalgic) as long as it was open during ${childhoodSpan} — describe it as it was then.
- If you cannot confirm a place existed in that window, DO NOT name it. Use a generic era-typical setting instead: a typical ${city}-area suburban house, backyard, cul-de-sac, neighborhood pool, or school gym of that era, anchored to a toy/show/fad that is definitely from ${childhoodSpan}.
- Era accuracy beats specificity: a correct generic scene always beats an iconic landmark from the wrong years. At most 2-3 of the 7 need named places; the rest can be era-perfect generic settings.
- Everything visible in the scenes (signage, cars, clothes, devices, toys) must be plausible for ${childhoodSpan} — no smartphones or modern branding if the window predates them.

For each of the 7, return:
- "title": short punchy name
- "description": 1-2 sentences on what it is and why it's nostalgic for this place + era
- "imagePrompt": a SIMPLE, true first-person POV photo from the eyes of a YOUNG CHILD, around 7 years old. The vantage point is LOW — at a small child's height — looking out and slightly up at the moment: other young children the same age, taller grown-ups, and the real place around them. The viewer is a little kid living and walking through it, not staring at an object. Their own SMALL child's hands (${skinTone} skin tone, little kid hands) may appear naturally at the edge of the frame, but keep the focus on the surroundings and the other young kids. Do not show the viewer's face. State explicitly that the scene is set in ${childhoodSpan} so every detail (signage, cars, clothes, devices) matches those years. Warm nostalgic film look, era-accurate details, 9:16 vertical.
- "videoPrompt": how this still comes alive as a 4-second clip — subtle, realistic motion from the low child's-eye view: a gentle walk-forward or look-around, other young children moving naturally. No scene cuts.
- "referenceQuery": the best Google Images search query to retrieve REAL photos of the specific landmark/object/place named (be specific, include city + era if helpful).
- "kind": "place" if the moment centers on a NAMED real location (landmark, store, mall, restaurant, arcade, park, event venue) whose real archival photos would be findable on Google Images; "generic" for era-typical scenes not tied to one named location.

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

// Summer-day narration for the voiceover, generated in two parts so the
// voice starts the moment the film reveals and still tracks every image:
// part 1 (the opening) covers the 3 era-only warm slides and needs no
// research — it's short so TTS finishes before the reveal; part 2 continues
// the same day through the 7 researched scenes, one sentence each, and is
// handed part 1's script for continuity. Both walk their scenes in exact
// slide order. One deliberately overstuffed summer-vacation day: no school,
// as many nostalgic moments and places as fit.
export async function generateNarrationPart(
  profile: Profile,
  city: string,
  scenes: string[],
  part: 1 | 2,
  prevScript = "",
): Promise<string> {
  const model = process.env.GEMINI_RESEARCH_MODEL || "gemini-2.5-flash";
  const birthYear = new Date().getFullYear() - profile.ageYears;
  const year = birthYear + 7;

  const sceneList = scenes.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const prompt =
    part === 1
      ? `Write the OPENING of a warm, soothing second-person voiceover: the start of one perfect summer-vacation day for a 7-year-old growing up in ${city} in ${year}.

These are the first scenes on screen while it plays, in this exact order:
${sceneList}

Rules:
- Open by placing us in ${city} in the summer of ${year}, woven naturally, then EXACTLY one short sentence per scene, in order — the words track the images. Do not skip or reorder.
- End with one short line that leans forward — the day is just beginning. Do NOT wrap up, do NOT mention evening or bedtime.
- Second person, present tense ("You wake up to..."). 55-75 words total.
- Concrete sensory details true to ${year}: sounds, smells, light, the toys and shows of that exact era. Nothing anachronistic. It's summer vacation — no school.
- DO NOT name any business, store, restaurant, mall or landmark.
- Gentle and nostalgic, never saccharine. No lists, no headings, no numbers, no quotes around it.
Return ONLY the script text.`
      : `The opening of a voiceover is ALREADY RECORDED — it is context only and must NOT appear in your output:
"${prevScript}"

Write ONLY the continuation: the same summer day of that 7-year-old in ${city} in ${year} moving through the scenes that follow on screen, in this exact order:
${sceneList}

Rules:
- Your script starts mid-day, picking up right where the opening left off (e.g. "Later, ..."). Do NOT repeat, rephrase or summarize ANY sentence of the opening. Do not re-say the city or the year.
- EXACTLY one short sentence per scene, in order — the words track the images. Do not skip or reorder.
- The day is deliberately packed with nostalgic moments and places — bend realism, this is a memory montage running to bedtime.
- Second person, present tense. HARD LIMIT: 90 words total — keep every sentence short and punchy.
- Concrete sensory details true to ${year}. Nothing anachronistic.
- You may name the specific places given in the scenes — but never introduce any other named business, store, restaurant, mall or landmark.
- Gentle and nostalgic, never saccharine. No lists, no headings, no numbers, no quotes around it.
- End on falling asleep, safe and happy.
Return ONLY the script text.`;

  const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // thinking off: this is creative prose, and the voiceover is latency-
      // critical (part 1 gates the film reveal).
      generationConfig: { temperature: 0.8, thinkingConfig: { thinkingBudget: 0 } },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gemini narration ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") ?? "";
  let script = text.replace(/```/g, "").trim();
  if (!script) throw new Error("Narration returned no script");
  // Guard: the model sometimes echoes the recorded opening despite the
  // prompt. If part 2 starts with it, cut everything up to its last words.
  if (part === 2 && prevScript) {
    const tail = prevScript.trim().split(/\s+/).slice(-4).join(" ").toLowerCase();
    const at = script.toLowerCase().indexOf(tail);
    if (at !== -1 && at < script.length - tail.length) {
      script = script.slice(at + tail.length).replace(/^[\s.,!?"'—–-]+/, "").trim() || script;
    }
  }
  return script;
}

// Synthesize the narration with Gemini TTS. Generation time scales with
// audio length (~43s for 60s of speech), so longer scripts are split at
// sentence boundaries into up to `maxChunks` parts synthesized in parallel
// (the opening gates the film reveal, so this wall time matters), then the
// raw PCM (L16 mono) is concatenated with a short breath of silence at each
// seam and wrapped in a WAV header so browsers and ffmpeg can both play it.
export async function synthesizeSpeech(
  script: string,
  maxChunks = 3,
): Promise<{ wav: Buffer; duration: number }> {
  const chunks = await Promise.all(splitScript(script, maxChunks).map(ttsChunk));

  const rate = chunks[0].rate;
  const parts: Buffer[] = [];
  chunks.forEach((c, i) => {
    if (i > 0) parts.push(Buffer.alloc(Math.round(rate * 0.35) * 2)); // 0.35s pause at the seam
    parts.push(c.pcm);
  });
  const pcm = Buffer.concat(parts);
  return { wav: pcmToWav(pcm, rate, 1), duration: pcm.length / (rate * 2) };
}

async function ttsChunk(text: string): Promise<{ pcm: Buffer; rate: number }> {
  const model = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
  const voice = process.env.GEMINI_TTS_VOICE || "Charon"; // deep, soothing male

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Read this in a warm, gentle, nostalgic storytelling voice, like remembering a childhood out loud. Soft and calm, but at a natural relaxed conversational pace — do not drag the words out:\n\n${text}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };

  const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!part?.inlineData?.data) throw new Error("Gemini TTS returned no audio");

  const mime: string = part.inlineData.mimeType || "audio/l16; rate=24000";
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
  return { pcm: Buffer.from(part.inlineData.data, "base64"), rate };
}

// Split into up to n roughly equal parts at sentence boundaries (fewer for
// very short scripts).
function splitScript(script: string, n: number): string[] {
  const sentences = script.match(/[^.!?]+[.!?]+["'”]?\s*/g);
  if (!sentences || sentences.length < 2) return [script];
  const target = script.length / n;
  const parts: string[] = [];
  let acc = "";
  for (const s of sentences) {
    acc += s;
    if (parts.length < n - 1 && acc.length >= target) {
      parts.push(acc.trim());
      acc = "";
    }
  }
  if (acc.trim()) parts.push(acc.trim());
  return parts;
}

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
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

export async function generateImage(
  imagePrompt: string,
  refs: RefImage[],
): Promise<{ mimeType: string; data: string }> {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";

  const fullPrompt = `${imagePrompt}

True first-person POV from the eyes of a YOUNG CHILD around 7 years old: a LOW, small-child vantage looking out and slightly up at the scene, other young kids the same age, and grown-ups who tower above. Any visible hands are a little kid's small hands and must not dominate — keep the focus on the surroundings and people. Do not show the viewer's face. Use the reference photos only to depict the real place accurately. Warm nostalgic photographic 9:16 vertical. No text or watermarks.`;

  const parts: any[] = [{ text: fullPrompt }];
  for (const r of refs) {
    parts.push({ inlineData: { mimeType: r.mimeType, data: r.data } });
  }

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
