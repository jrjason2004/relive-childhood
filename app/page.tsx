"use client";

// Reverie — cinematic flow from the Claude Design handoff
// (handoff/childhood-memory-reliving-website/project/Reverie.dc.html), wired
// to the real pipeline: scan → Gemini age estimate (the warm slides start
// rendering here), city → research, time travel → an accelerating date rewind
// over the live camera with finished memories popping up as polaroids (the
// session music starts here and runs continuously), film → a live
// index-order Ken Burns slideshow of ~10 high-quality stills (3 era-only
// warm slides + 7 researched moments) while a generated packed-summer-day
// voiceover reads the same storyboard in slide order over the ducked music.
// The narration comes in two parts so it speaks from the very first frame:
// the opening (warm slides, built during travel — the reveal waits for it)
// and the continuation (researched scenes, takes over when the opening
// ends). This is a pure LIVE experience: it loops forever, there is no
// shareable file, and the film NEVER shows progress/waiting popups — it must
// always feel live. Set NEXT_PUBLIC_USE_WAN=1 to switch the film back to
// Wan 2.2 motion clips (that legacy path still stitches an mp4).

import { useEffect, useRef, useState } from "react";

type Moment = {
  title: string;
  description: string;
  imagePrompt: string;
  videoPrompt: string;
  referenceQuery: string;
  kind?: "place" | "generic";
};

type Profile = { ageYears: number; gender: string; skinTone: string };

type SlideSpec = {
  imagePrompt: string;
  videoPrompt: string; // only used when USE_WAN
  referenceQuery?: string;
  mode?: "generated" | "real"; // real = archival-photo keepsake slide
};

// Landmark-free scenes for the warm clip (index 0), which starts rendering
// while the user is still typing their hometown — the era does the nostalgia
// work, so no location research is needed.
const WARM_SCENES: Array<{ image: string; video: string }> = [
  {
    image:
      "A quiet suburban cul-de-sac at golden hour: kids the same age ride bikes in loose circles, chalk drawings cover the driveway, a neighbor waters the lawn.",
    video:
      "Gentle walk forward at a small child's height as the kids on bikes loop past; warm low evening light; subtle handheld sway. No scene cuts.",
  },
  {
    image:
      "A summer backyard: kids run shrieking through a lawn sprinkler, towels thrown over plastic chairs, popsicles melting fast in small hands.",
    video:
      "Slow look around from a small child's height as kids dart through the sprinkler arc; water catches the sun; subtle handheld sway. No scene cuts.",
  },
  {
    image:
      "A Saturday-morning living room: cartoons glow on the family TV, cereal bowls on the carpet, siblings sprawled in pajamas among scattered toys.",
    video:
      "Gentle push-in at a small child's height toward the glowing TV as a sibling laughs and reaches into a cereal bowl; soft morning light. No scene cuts.",
  },
  {
    image:
      "A neighborhood park playground on a summer afternoon: kids swarm the jungle gym and swings, sneakers kicking up wood chips, a kickball game starting on the grass.",
    video:
      "Slow look around from a small child's height as kids race past toward the swings; bright midday sun; subtle handheld sway. No scene cuts.",
  },
  {
    image:
      "An ice cream truck stopped on a summer street: kids crowd around clutching coins and crumpled dollar bills, studying the faded picture menu on the truck's side.",
    video:
      "Gentle walk forward at a small child's height joining the crowd of kids at the truck window; heat shimmer off the asphalt; subtle handheld sway. No scene cuts.",
  },
];

const CONCURRENCY = 7;
const CHILD_AGE = 7; // matches the POV age in the image/video prompts
const USE_WAN = process.env.NEXT_PUBLIC_USE_WAN === "1"; // motion clips instead of stills
const WARM_COUNT = 3; // era-only slides that start rendering at the age reveal
const SLIDE_MS = 6000; // per slide; a 10-slide pass ≈ the ~60s voiceover
// Tiny silent WAV: unlocks the voiceover <audio> inside the tap gesture so
// the narration can start programmatically once it's generated.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
const KEN_ANIMS = ["rcKenA", "rcKenB", "rcKenC", "rcKenD"];
const SANS = "var(--font-sans), sans-serif";
const SERIF = "var(--font-serif), serif";

// Where travel polaroids land (deterministic, clear of the countdown text).
const POLAROID_SPOTS: Array<{
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
  rot: number;
}> = [
  { left: "7%", top: "8%", rot: -7 },
  { right: "6%", top: "16%", rot: 6 },
  { left: "10%", bottom: "11%", rot: -4 },
  { right: "9%", bottom: "16%", rot: 8 },
  { left: "38%", top: "5%", rot: 3 },
];

// Run async tasks with bounded concurrency, preserving result order.
async function runPool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// Deterministic sparkle field for the time-travel overlay (stable across
// renders and across server/client).
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  left: `${((i * 37 + 13) % 92) + 4}%`,
  top: `${((i * 53 + 29) % 84) + 8}%`,
  size: 2.5 + (i % 3) * 1.5,
  delay: `${(i % 7) * 0.45}s`,
  blink: `${2 + (i % 5) * 0.5}s`,
  float: `${3.5 + (i % 4) * 0.9}s`,
}));

const FULL_BLEED: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

export default function Home() {
  // ---- flow
  const [screen, setScreen] = useState<"scan" | "city" | "travel" | "film">("scan");
  const [camDenied, setCamDenied] = useState(false);
  const [scanP, setScanP] = useState(0);
  const [locked, setLocked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [city, setCityText] = useState("");
  const [travelP, setTravelP] = useState(0);
  const [veil, setVeil] = useState(0);
  const [veilSlow, setVeilSlow] = useState(false);
  const [error, setError] = useState("");

  // ---- film (live player: slides play in index/story order — the narration
  // follows the same order, so the words track what's on screen)
  const [playlist, setPlaylist] = useState<Array<{ idx: number; url: string }>>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [genDone, setGenDone] = useState(false);
  const [liveDone, setLiveDone] = useState(false);
  const [videoUrl, setVideoUrl] = useState(""); // Wan mode only: stitched mp4 (blob URL)
  const [vo1Url, setVo1Url] = useState(""); // narration part 1: the opening (blob URL)
  const [vo2Url, setVo2Url] = useState(""); // narration part 2: researched scenes (blob URL)
  const [voEndedTick, setVoEndedTick] = useState(0); // re-runs effects when a part ends
  const [muted, setMuted] = useState(false);

  const mirrorRef = useRef<HTMLVideoElement>(null);
  const filmRef = useRef<HTMLVideoElement>(null);
  const clipRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const musicRef = useRef<HTMLAudioElement>(null);
  const voRef = useRef<HTMLAudioElement>(null);
  const voStartedRef = useRef(false); // narration has begun at least once
  const voPartRef = useRef<0 | 1 | 2>(0); // which narration part is loaded
  const voDursRef = useRef<[number, number]>([0, 0]); // part durations (s); pace the slides
  const vo1BuildRef = useRef<Promise<string> | null>(null); // resolves part 1's script
  const vo1SettledRef = useRef(false); // part 1 finished building (or failed) — unblocks the reveal
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobUrlsRef = useRef<string[]>([]); // object URLs to revoke on restart
  const warmRef = useRef<Promise<Array<number | null>> | null>(null); // warm slides (first indices)
  const warmScenesRef = useRef<string[]>([]); // scene texts, reused by the narration
  const arrivalRef = useRef<{ from: number; t0: number; rampMs: number } | null>(null);
  const revealFiredRef = useRef(false);
  const sessionRef = useRef("");
  const runRef = useRef(0); // increments on Start over; stale async work checks it
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const travelTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fromYear = new Date().getFullYear();
  const startAge = profile?.ageYears ?? 30;
  const yearsBack = Math.max(1, startAge - CHILD_AGE);

  // ================= camera + scan =================

  async function startCam(): Promise<boolean> {
    if (streamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCamDenied(false);
      const v = mirrorRef.current;
      if (v) {
        v.srcObject = stream;
        v.play?.().catch(() => {});
      }
      return true;
    } catch {
      setCamDenied(true);
      return false;
    }
  }

  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function clearTimers() {
    if (scanTimer.current) clearInterval(scanTimer.current);
    if (travelTimer.current) clearInterval(travelTimer.current);
    scanTimer.current = null;
    travelTimer.current = null;
  }

  async function captureSelfie(): Promise<{ data: string; mimeType: string } | null> {
    const ok = await startCam();
    if (!ok) return null;
    const v = mirrorRef.current;
    if (!v) return null;
    await new Promise<void>((res) => {
      if (v.readyState >= 2) res();
      else v.addEventListener("loadeddata", () => res(), { once: true });
    });
    await new Promise((r) => setTimeout(r, 700)); // let exposure settle
    const c = document.createElement("canvas");
    const w = 640;
    c.width = w;
    c.height = Math.round((w * v.videoHeight) / Math.max(1, v.videoWidth)) || 480;
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", 0.9).split(",")[1], mimeType: "image/jpeg" };
  }

  async function analyze(img: { data: string; mimeType: string }): Promise<Profile> {
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: img.data, mimeType: img.mimeType }),
      });
      const d = await r.json();
      if (r.ok && d.profile) return d.profile;
    } catch {}
    return { ageYears: 30, gender: "male", skinTone: "medium" };
  }

  function finishScan(run: number, prof: Profile) {
    if (runRef.current !== run) return;
    setProfile(prof);
    setScanP(100);
    // The session starts the moment the profile exists, so the warm slide —
    // a generic, era-only scene with no landmarks — renders while the user is
    // still looking at the age reveal and typing their hometown.
    if (!sessionRef.current) {
      const sessionId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now());
      sessionRef.current = sessionId;
      startWarmSlide(run, sessionId, prof);
    }
    setTimeout(() => {
      if (runRef.current === run) setLocked(true);
    }, 350);
  }

  function startWarmSlide(run: number, sessionId: string, prof: Profile) {
    const birthYear = new Date().getFullYear() - prof.ageYears;
    const span = `${birthYear + 5}–${birthYear + 13}`;
    const decade = `${Math.floor((birthYear + 9) / 10) * 10}s`;
    // Several era-only scenes fire immediately, in parallel — no research, no
    // reference-photo fetch (the era lives in the prompt), so the first
    // memories exist before the user finishes typing their hometown.
    const scenes = [...WARM_SCENES]
      .sort(() => Math.random() - 0.5)
      .slice(0, USE_WAN ? 1 : WARM_COUNT);
    warmScenesRef.current = scenes.map((s) => s.image);
    warmRef.current = Promise.all(
      scenes.map((scene, k) =>
        buildSlide(run, sessionId, k, {
          imagePrompt: `${scene.image} The scene is set explicitly in ${span} (${decade}): clothes, hairstyles, toys, cars and houses all match those years. A generic anywhere-in-America setting — absolutely no recognizable landmarks, store names or signage. The viewer's own small child's hands (${prof.skinTone} skin tone) may appear naturally at the edge of the frame.`,
          videoPrompt: scene.video,
          mode: "generated",
        }),
      ),
    );
  }

  function beginScan(run: number) {
    setScanP(0);
    setLocked(false);
    const t0 = Date.now();
    let analyzed = false;
    scanTimer.current = setInterval(() => {
      if (runRef.current !== run) {
        if (scanTimer.current) clearInterval(scanTimer.current);
        return;
      }
      if (analyzed) {
        if (scanTimer.current) clearInterval(scanTimer.current);
        return;
      }
      // creep to 90% while the real analysis runs; finishScan snaps to 100
      setScanP(Math.min(90, ((Date.now() - t0) / 4000) * 100));
    }, 40);

    (async () => {
      const img = await captureSelfie();
      if (!img) return; // camera denied — upload fallback takes over
      const prof = await analyze(img);
      analyzed = true;
      finishScan(run, prof);
    })();
  }

  // Upload fallback when the camera is unavailable.
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = await new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ data: String(reader.result).split(",")[1], mimeType: file.type || "image/jpeg" });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }).catch(() => null as any);
    if (!img) return;
    const run = runRef.current;
    const prof = await analyze(img);
    finishScan(run, prof);
  }

  useEffect(() => {
    const run = runRef.current;
    beginScan(run);
    return () => {
      clearTimers();
      stopCam();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= city → travel + real pipeline =================

  // Generate one slide (a still by default; a Wan clip when USE_WAN) and, on
  // success, prefetch it into a blob and append it to the live playlist.
  // Returns its index, or null on failure.
  async function buildSlide(
    run: number,
    sessionId: string,
    i: number,
    spec: SlideSpec,
  ): Promise<number | null> {
    try {
      const r = await fetch(USE_WAN ? "/api/clip" : "/api/still", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          USE_WAN
            ? {
                sessionId,
                index: i,
                imagePrompt: spec.imagePrompt,
                videoPrompt: spec.videoPrompt,
                referenceQuery: spec.referenceQuery,
              }
            : {
                sessionId,
                index: i,
                imagePrompt: spec.imagePrompt,
                referenceQuery: spec.referenceQuery,
                mode: spec.mode ?? "generated",
              },
        ),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Slide failed");
      }
      if (runRef.current !== run) return null;
      let url: string;
      if (USE_WAN) {
        // Wan clips are served by a follow-up GET (local-only path).
        await r.json().catch(() => ({}));
        const apiUrl = `/api/video?session=${encodeURIComponent(sessionId)}&clip=${i}`;
        url = apiUrl;
        try {
          const blob = await (await fetch(apiUrl)).blob();
          url = URL.createObjectURL(blob);
          blobUrlsRef.current.push(url);
        } catch {}
      } else {
        // The still comes back in the POST body (serverless instances don't
        // share disk) — straight into a blob so display is instant.
        const blob = await r.blob();
        url = URL.createObjectURL(blob);
        blobUrlsRef.current.push(url);
      }
      if (runRef.current !== run) return null;
      // Insert in index order so the live pass matches the narration's
      // storyboard order (a late slide slots into place, not onto the end).
      setPlaylist((prev) =>
        [...prev, { idx: i, url }].sort((a, b) => a.idx - b.idx),
      );
      return i;
    } catch {
      return null;
    }
  }

  // Generate one narration part and prefetch it to a blob. Part 1 (the
  // opening over the warm slides) fires at "Take me back" and gates the film
  // reveal so the voice starts on the very first frame; part 2 continues the
  // day through the researched scenes and takes over when part 1 ends.
  // Returns the script (part 2 needs part 1's for continuity); failure is
  // silent — the film plays with music alone.
  async function buildVoiceover(
    run: number,
    sessionId: string,
    prof: Profile,
    cityName: string,
    scenes: string[],
    part: 1 | 2,
    prevScript = "",
  ): Promise<string> {
    try {
      const r = await fetch("/api/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          profile: prof,
          city: cityName,
          scenes,
          part,
          prevScript,
        }),
      });
      if (!r.ok) return "";
      if (runRef.current !== run) return "";
      // The WAV rides in the response body; duration + script in headers
      // (serverless instances don't share disk, so no follow-up GET).
      const duration = Number(r.headers.get("x-vo-duration"));
      if (duration > 0) voDursRef.current[part - 1] = duration;
      let script = "";
      try {
        script = decodeURIComponent(r.headers.get("x-vo-script") ?? "");
      } catch {}
      const blob = await r.blob();
      if (runRef.current !== run) return "";
      const url = URL.createObjectURL(blob);
      blobUrlsRef.current.push(url);
      (part === 1 ? setVo1Url : setVo2Url)(url);
      return script;
    } catch {
      return ""; // no narration for this part
    } finally {
      if (part === 1) vo1SettledRef.current = true;
    }
  }

  function toCity() {
    if (!profile) return;
    setScreen("city");
  }

  function toTravel() {
    if (!city.trim() || !profile || !sessionRef.current) return;
    const run = runRef.current;
    const sessionId = sessionRef.current;

    // The session's track starts here, inside the tap gesture, and plays
    // continuously through travel and the film (the ~9-minute tracks cover
    // the whole experience). The voiceover element is unlocked with a silent
    // blip so the narration can start programmatically once it's generated.
    const m = musicRef.current;
    if (m) {
      m.src = `/api/music?session=${encodeURIComponent(sessionId)}`;
      m.volume = 1;
      m.play().catch(() => {});
    }
    const vo = voRef.current;
    if (vo) {
      vo.src = SILENT_WAV;
      vo.play().catch(() => {});
    }

    // The opening narration needs no research — it covers the warm slides —
    // so it starts building right now and the reveal waits for it: the film
    // opens with the voice already on slide 0.
    if (!USE_WAN) {
      vo1BuildRef.current = buildVoiceover(
        run,
        sessionId,
        profile,
        city.trim(),
        warmScenesRef.current,
        1,
      );
    }

    clearTimers();
    // The camera stays on: the travel screen paints its magic over the live
    // mirror. It's stopped when the film reveals.
    setScreen("travel");
    setTravelP(0);
    setVeil(0);
    setVeilSlow(false);
    arrivalRef.current = null;
    revealFiredRef.current = false;

    // Progress creeps to 97% over ~40s until the first clip is ready; then
    // the arrival ramp (armed by the effect below) accelerates it to 100%
    // and the veil reveals the film. The displayed date rewinds on an
    // ease-in curve of this progress, so it starts slow and speeds up.
    const t0 = Date.now();
    travelTimer.current = setInterval(() => {
      if (runRef.current !== run) {
        if (travelTimer.current) clearInterval(travelTimer.current);
        return;
      }
      const a = arrivalRef.current;
      if (a) {
        const q = Math.min(1, (Date.now() - a.t0) / a.rampMs);
        setTravelP(a.from + (100 - a.from) * q);
        if (q >= 1 && !revealFiredRef.current) {
          revealFiredRef.current = true;
          reveal(run);
        }
      } else {
        setTravelP((p) => Math.max(p, Math.min(97, ((Date.now() - t0) / 40000) * 100)));
      }
    }, 40);

    runPipeline(run, sessionId, profile, city.trim());
  }

  // Countdown complete: white veil in → film screen → veil out.
  function reveal(run: number) {
    if (travelTimer.current) clearInterval(travelTimer.current);
    setTravelP(100);
    setVeil(1);
    setTimeout(() => {
      if (runRef.current !== run) return;
      stopCam();
      setScreen("film");
      setVeilSlow(true);
      // The music has been playing since travel began — just make sure it
      // survived (some browsers reject the first play() while loading).
      musicRef.current?.play().catch(() => {});
      setTimeout(() => {
        if (runRef.current === run) setVeil(0);
      }, 260);
    }, 700);
  }

  async function runPipeline(run: number, sessionId: string, prof: Profile, cityName: string) {
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: prof, city: cityName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      if (runRef.current !== run) return;

      const moments: Moment[] = data.moments ?? [];
      // The warm slides (first indices) have been rendering since the age
      // reveal. Stills mode: every researched moment becomes a generated POV
      // slide — 3 warm + 7 researched ≈ 10 slides. Wan mode keeps the old
      // 1 warm + 4 clips. The voiceover narrates this exact storyboard in
      // slide order, so it can only start once the research is back.
      const warm = warmRef.current;
      const warmCount = warm ? (USE_WAN ? 1 : WARM_COUNT) : 0;
      const queue = USE_WAN ? moments.slice(0, 5 - warmCount) : moments.slice(0, 7);
      setTotal(warmCount + queue.length);

      if (!USE_WAN) {
        // Part 2 continues from part 1's script through the researched
        // scenes; the live player hands over to it when the opening ends.
        (async () => {
          const s1 = vo1BuildRef.current ? await vo1BuildRef.current : "";
          if (runRef.current !== run) return;
          buildVoiceover(
            run,
            sessionId,
            prof,
            cityName,
            queue.map((m) => `${m.title}: ${m.description}`),
            2,
            s1,
          );
        })();
      }

      const tasks = queue.map((m, j) => () =>
        buildSlide(run, sessionId, warmCount + j, {
          imagePrompt: m.imagePrompt,
          videoPrompt: m.videoPrompt,
          referenceQuery: m.referenceQuery,
          mode: "generated" as const,
        }),
      );

      const poolPromise = runPool(tasks, CONCURRENCY);
      const [warmResults, poolResults] = await Promise.all([
        warm ?? Promise.resolve<Array<number | null>>([]),
        poolPromise,
      ]);
      if (runRef.current !== run) return;
      setGenDone(true);

      const ok = [...warmResults, ...poolResults]
        .filter((x): x is number => x !== null)
        .sort((a, b) => a - b);
      if (ok.length === 0) throw new Error("The film couldn't be developed");

      // Stills mode is a pure live experience — nothing to render. Wan mode
      // still stitches its clips into an mp4 for the seamless-loop swap.
      if (USE_WAN) {
        const sr = await fetch("/api/stitch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, indices: ok, mode: "clips" }),
        });
        const sd = await sr.json();
        if (!sr.ok) throw new Error(sd.error || "Stitch failed");
        if (runRef.current !== run) return;
        // Blob playback avoids a network hiccup on the live → final swap.
        let finalUrl: string = sd.videoUrl;
        try {
          const blob = await (await fetch(sd.videoUrl)).blob();
          finalUrl = URL.createObjectURL(blob);
          blobUrlsRef.current.push(finalUrl);
        } catch {}
        if (runRef.current !== run) return;
        setVideoUrl(finalUrl);
      }
    } catch (err: any) {
      if (runRef.current === run) setError(err?.message ?? "Something went wrong");
    }
  }

  // First available clip arms the arrival: the countdown accelerates from
  // wherever it is to 100% over a few seconds, then reveal() fires. If the
  // warm clip finished while the user was still typing, this arms immediately
  // on entering travel — a slightly longer ramp keeps it cinematic.
  useEffect(() => {
    if (screen !== "travel" || playlist.length === 0 || arrivalRef.current) return;
    // The reveal also waits for the opening narration (or its failure) so
    // the voice starts speaking on the very first frame of the film.
    if (!USE_WAN && !vo1Url && !vo1SettledRef.current) return;
    arrivalRef.current = {
      from: travelP,
      t0: Date.now(),
      rampMs: travelP < 15 ? 6000 : 3500,
    };
  }, [screen, playlist.length, travelP, vo1Url]);

  // ================= live player driver =================

  useEffect(() => {
    if (screen !== "film") return;
    if (cursor < playlist.length) return;
    if (genDone && playlist.length > 0) {
      if (!liveDone) setLiveDone(true);
      if (!USE_WAN) {
        // The slideshow loops forever. The music keeps playing straight
        // through; the narration (re)starts in sync with the new pass — it
        // reads the storyboard in slide order, so it only ever begins at a
        // pass boundary. If the slides finished a beat before the voice
        // (they pace to it, but never drift more than a slide), the last
        // slide just keeps drifting until the narration lands its final
        // line, then the new pass and the narration start together.
        const vo = voRef.current;
        if (vo && voStartedRef.current && !vo.ended && !vo.paused) {
          return; // let the narration finish; its ended event re-runs this
        }
        setCursor(0);
        if (vo && vo1Url && (!voStartedRef.current || vo.ended)) startVoiceover(1);
      }
    }
    // While the next slide renders, the current one just keeps drifting —
    // never a waiting popup; it has to feel live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, playlist, cursor, genDone, liveDone, vo1Url, voEndedTick]);

  // Music sits under the narration while it speaks (volume is a no-op on iOS,
  // where the mix just plays at full — acceptable).
  function duckMusic(duck: boolean) {
    const m = musicRef.current;
    if (m) m.volume = duck ? 0.35 : 1;
  }

  // (Re)start a narration part from its top: each part tracks its slides one
  // sentence per scene, so it always begins aligned.
  function startVoiceover(part: 1 | 2) {
    const url = part === 1 ? vo1Url : vo2Url;
    const vo = voRef.current;
    if (!vo || !url) return;
    voStartedRef.current = true;
    voPartRef.current = part;
    if (vo.src !== url) vo.src = url;
    vo.currentTime = 0;
    vo.muted = muted;
    duckMusic(true);
    vo.play().catch(() => {});
  }

  // The reveal waits for the opening, so this normally fires on the film's
  // very first frame; the cursor guard covers the fallback where the opening
  // arrives late (it then joins mid-pass only if the pass just began).
  useEffect(() => {
    if (USE_WAN || screen !== "film" || !vo1Url || voStartedRef.current) return;
    if (cursor <= 1) startVoiceover(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, vo1Url, cursor]);

  // Hand over from the opening to part 2: the moment part 1 has ended and
  // part 2 exists (either order), the continuation starts and the slide
  // clock walks the researched scenes. Between parts the music swells back.
  useEffect(() => {
    if (USE_WAN || screen !== "film" || !vo2Url) return;
    const vo = voRef.current;
    if (voPartRef.current === 1 && vo && vo.ended) startVoiceover(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, vo2Url, voEndedTick]);

  const finalMode = liveDone && Boolean(videoUrl); // Wan mode only: swap to the mp4

  // Slideshow driver: advance while the next slide exists. Once a narration
  // part is playing it becomes the clock — part 1 spans the warm slides,
  // part 2 the researched ones, each scene owning an equal share of its
  // part — slides flip at those boundaries, and after any hiccup (audio
  // suspension, timer throttling) the cursor snaps forward onto the scene
  // the voice is actually on, so words and images can't drift apart.
  useEffect(() => {
    if (USE_WAN || screen !== "film") return;
    if (cursor >= playlist.length) return; // holding on the last slide or looping
    const n = genDone ? playlist.length : Math.max(total, playlist.length, 1);
    const part = voPartRef.current;
    const dur = part > 0 ? voDursRef.current[part - 1] : 0;
    const base = part === 2 ? Math.min(WARM_COUNT, n - 1) : 0;
    const span = part === 2 ? Math.max(n - WARM_COUNT, 1) : Math.min(WARM_COUNT, n);
    const voLive = () => {
      const v = voRef.current;
      return Boolean(v && voStartedRef.current && !v.paused && !v.ended && dur > 0);
    };
    const seg = voLive() ? Math.max(2, dur / span) : SLIDE_MS / 1000;
    let delay = seg * 1000;
    if (voLive()) {
      const t = voRef.current!.currentTime;
      delay = Math.max(250, (Math.floor(t / seg) + 1) * seg * 1000 - t * 1000);
    }
    const timer = setTimeout(() => {
      if (voLive()) {
        const target = Math.min(base + Math.floor(voRef.current!.currentTime / seg), n - 1);
        setCursor((c) => (target > c ? target : c + 1));
      } else {
        setCursor((c) => c + 1);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [screen, cursor, playlist.length, genDone, total]);

  // Crossfade bookkeeping: the previous slide stays fully visible underneath
  // while the new one fades in on top (no dip to black).
  const shownIdx = playlist.length > 0 ? Math.min(cursor, playlist.length - 1) : -1;
  const prevShownRef = useRef(-1);
  const [prevIdx, setPrevIdx] = useState(-1);
  useEffect(() => {
    if (shownIdx !== prevShownRef.current) {
      setPrevIdx(prevShownRef.current);
      prevShownRef.current = shownIdx;
    }
  }, [shownIdx]);

  // Wan mode: start the current clip. The next clip is mounted early as a
  // hidden, fully-buffered <video>; when the cursor reaches it, autoPlay has
  // already fired on mount, so we kick playback here instead.
  useEffect(() => {
    if (!USE_WAN || screen !== "film" || finalMode) return;
    const v = clipRefs.current[cursor];
    if (v && v.paused && !v.ended) v.play().catch(() => {});
  }, [screen, cursor, playlist, finalMode]);

  // Browsers suspend background media when the page is hidden (phone locks,
  // app switch). Resume the music, narration, and (Wan mode) the current
  // video when visible again — the slide driver then resnaps to the voice.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (screen === "travel" || screen === "film") {
        const m = musicRef.current;
        if (m && m.paused && m.src) m.play().catch(() => {});
      }
      if (screen !== "film") return;
      const vo = voRef.current;
      if (vo && voStartedRef.current && vo.paused && !vo.ended) vo.play().catch(() => {});
      if (USE_WAN) {
        const v = finalMode ? filmRef.current : clipRefs.current[cursor];
        if (v && v.paused && !v.ended) v.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [screen, cursor, finalMode]);

  // ================= menu actions =================

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      if (musicRef.current) musicRef.current.muted = next;
      if (voRef.current) voRef.current.muted = next;
      return next;
    });
  }

  function restart() {
    runRef.current++;
    clearTimers();
    stopCam();
    musicRef.current?.pause();
    const vo = voRef.current;
    if (vo) {
      vo.pause();
      vo.removeAttribute("src");
    }
    voStartedRef.current = false;
    voPartRef.current = 0;
    voDursRef.current = [0, 0];
    vo1BuildRef.current = null;
    vo1SettledRef.current = false;
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];
    clipRefs.current = [];
    warmRef.current = null;
    warmScenesRef.current = [];
    arrivalRef.current = null;
    revealFiredRef.current = false;
    sessionRef.current = "";
    prevShownRef.current = -1;
    setPrevIdx(-1);
    setScreen("scan");
    setCamDenied(false);
    setScanP(0);
    setLocked(false);
    setProfile(null);
    setCityText("");
    setTravelP(0);
    setVeil(0);
    setVeilSlow(false);
    setError("");
    setPlaylist([]);
    setTotal(0);
    setCursor(0);
    setGenDone(false);
    setLiveDone(false);
    setVideoUrl("");
    setVo1Url("");
    setVo2Url("");
    beginScan(runRef.current);
  }

  // ================= derived display values =================

  const scanning = screen === "scan" && !locked;
  const scanStatus = scanP < 34 ? "Locating face" : scanP < 70 ? "Mapping features" : "Estimating age";

  // Date rewind: quintic ease-in-out of the travel progress. Days flip slowly
  // at first, then the rewind accelerates through the years and settles onto
  // mid-June of the childhood year as it arrives.
  const tp = travelP / 100;
  const eased = tp * tp * tp * (tp * (tp * 6 - 15) + 10);
  const targetTime = new Date(fromYear - yearsBack, 5, 15).getTime();
  const curDate = new Date(Date.now() - (Date.now() - targetTime) * eased);
  const curYear = curDate.getFullYear();
  const curMonthDay = curDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const travelStatus = travelP < 92 ? "Rewinding" : "Arriving";
  const cityTrim = city.trim();
  const cityLabel = cityTrim ? cityTrim.charAt(0).toUpperCase() + cityTrim.slice(1) : "your hometown";
  const cityValid = Boolean(cityTrim);
  const showMirror = screen === "scan" || screen === "city" || screen === "travel";

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SANS,
        background: "#050409",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(460px, 100vw)",
          height: "min(940px, 100vh)",
          overflow: "hidden",
          background: "#0b0910",
        }}
      >
        <audio ref={musicRef} loop preload="auto" />
        <audio
          ref={voRef}
          preload="auto"
          onEnded={() => {
            duckMusic(false);
            setVoEndedTick((t) => t + 1);
          }}
        />
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} hidden />

        {/* ============ persistent live mirror (scan + city) ============ */}
        {showMirror && (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(120% 90% at 50% 38%, #2a2536 0%, #141019 60%, #0a070f 100%)",
                overflow: "hidden",
              }}
            >
              <video
                ref={mirrorRef}
                autoPlay
                muted
                playsInline
                style={{ ...FULL_BLEED, transform: "scaleX(-1)", opacity: 0.94 }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(120% 90% at 50% 40%, transparent 40%, rgba(5,4,9,0.82) 100%)",
                pointerEvents: "none",
              }}
            />
          </div>
        )}

        {/* ================= scan / viewfinder ================= */}
        {screen === "scan" && (
          <div style={{ position: "absolute", inset: 0 }}>
            {camDenied && !locked && (
              <div
                style={{
                  position: "absolute",
                  top: "38%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontWeight: 500,
                    letterSpacing: "0.14em",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.5)",
                    textTransform: "uppercase",
                  }}
                >
                  Camera unavailable
                </div>
                <div
                  style={{
                    margin: "8px auto 0",
                    fontWeight: 300,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.4)",
                    maxWidth: "24ch",
                  }}
                >
                  Allow camera access to look into the mirror.
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{
                    marginTop: 18,
                    border: "1px solid rgba(255,255,255,0.25)",
                    cursor: "pointer",
                    padding: "10px 22px",
                    borderRadius: 100,
                    fontFamily: SANS,
                    fontWeight: 500,
                    fontSize: 13,
                    color: "#faf5ee",
                    background: "rgba(255,255,255,0.08)",
                  }}
                >
                  Upload a photo instead
                </button>
              </div>
            )}

            {/* reticle */}
            <div
              style={{
                position: "absolute",
                top: "24%",
                left: "50%",
                transform: "translateX(-50%)",
                width: 230,
                height: 300,
                pointerEvents: "none",
                animation: "rcRetic 2.4s ease-in-out infinite",
              }}
            >
              {(
                [
                  { top: 0, left: 0, borderTop: true, borderLeft: true, radius: "borderTopLeftRadius" },
                  { top: 0, right: 0, borderTop: true, borderRight: true, radius: "borderTopRightRadius" },
                  { bottom: 0, left: 0, borderBottom: true, borderLeft: true, radius: "borderBottomLeftRadius" },
                  { bottom: 0, right: 0, borderBottom: true, borderRight: true, radius: "borderBottomRightRadius" },
                ] as any[]
              ).map((c, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    ...(c.top !== undefined ? { top: c.top } : { bottom: c.bottom }),
                    ...(c.left !== undefined ? { left: c.left } : { right: c.right }),
                    width: 34,
                    height: 34,
                    ...(c.borderTop ? { borderTop: "2px solid rgba(255,255,255,0.9)" } : {}),
                    ...(c.borderBottom ? { borderBottom: "2px solid rgba(255,255,255,0.9)" } : {}),
                    ...(c.borderLeft ? { borderLeft: "2px solid rgba(255,255,255,0.9)" } : {}),
                    ...(c.borderRight ? { borderRight: "2px solid rgba(255,255,255,0.9)" } : {}),
                    [c.radius]: 6,
                  }}
                />
              ))}
              {[
                { top: "33%", left: "28%", delay: "0s" },
                { top: "33%", right: "28%", delay: "0.3s" },
                { top: "52%", left: "50%", delay: "0.6s" },
                { top: "68%", left: "38%", delay: "0.9s" },
                { top: "68%", right: "38%", delay: "1.2s" },
              ].map((d, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: d.top,
                    ...(d.left ? { left: d.left } : { right: d.right }),
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 0 8px #fff",
                    animation: `rcBlink 1.6s ease-in-out infinite ${d.delay}`,
                  }}
                />
              ))}
            </div>

            {/* scan line */}
            {scanning && !camDenied && (
              <div
                style={{
                  position: "absolute",
                  left: "calc(50% - 130px)",
                  width: 260,
                  height: 2,
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)",
                  boxShadow: "0 0 18px rgba(255,255,255,0.7)",
                  animation: "rcScan 1.8s ease-in-out infinite alternate",
                }}
              />
            )}

            {/* top HUD */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                padding: "26px 26px 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#ff5b5b",
                    boxShadow: "0 0 10px #ff5b5b",
                    animation: "rcRetic 1.4s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    fontWeight: 600,
                    letterSpacing: "0.34em",
                    fontSize: 11,
                    color: "#fff",
                    textTransform: "uppercase",
                  }}
                >
                  Relive Childhood
                </span>
              </div>
              <span
                style={{
                  fontWeight: 400,
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                FRONT&nbsp;CAM
              </span>
            </div>

            {/* bottom readout */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "0 30px 46px",
                textAlign: "center",
              }}
            >
              {scanning && !camDenied && (
                <div style={{ animation: "rcFade 0.5s ease both" }}>
                  <div
                    style={{
                      fontWeight: 500,
                      letterSpacing: "0.28em",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.7)",
                      textTransform: "uppercase",
                    }}
                  >
                    {scanStatus}
                  </div>
                  <div
                    style={{
                      margin: "16px auto 0",
                      width: 180,
                      height: 2,
                      borderRadius: 2,
                      background: "rgba(255,255,255,0.18)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${scanP}%`,
                        background: "#fff",
                        transition: "width 0.1s linear",
                      }}
                    />
                  </div>
                </div>
              )}

              {locked && (
                <div style={{ animation: "rcRise 0.7s ease both" }}>
                  <div
                    style={{
                      fontWeight: 500,
                      letterSpacing: "0.28em",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.6)",
                      textTransform: "uppercase",
                    }}
                  >
                    Estimated age
                  </div>
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: 88,
                      lineHeight: 0.95,
                      color: "#fff",
                      margin: "6px 0 2px",
                      letterSpacing: -1,
                    }}
                  >
                    {startAge}
                  </div>
                  <div
                    style={{
                      fontWeight: 300,
                      fontSize: 14,
                      color: "rgba(255,255,255,0.62)",
                      marginBottom: 26,
                    }}
                  >
                    Let&apos;s take you back to your childhood.
                  </div>
                  <button
                    onClick={toCity}
                    style={{
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      padding: 18,
                      borderRadius: 100,
                      fontFamily: SANS,
                      fontWeight: 600,
                      fontSize: 15,
                      color: "#171019",
                      background: "#fff",
                      boxShadow: "0 14px 40px -12px rgba(255,255,255,0.4)",
                    }}
                  >
                    Return to childhood&nbsp;&nbsp;→
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= city (mirror morphs to memory) ================= */}
        {screen === "city" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 4,
              display: "flex",
              flexDirection: "column",
              padding: "64px 38px 46px",
              background:
                "radial-gradient(120% 95% at 50% 62%, rgba(28,20,34,0.24), rgba(7,5,13,0.74))",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              animation: "rcMorphIn 1.1s ease both",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-8%",
                left: "50%",
                width: "130%",
                height: "56%",
                background:
                  "radial-gradient(closest-side, rgba(240,190,140,0.24), transparent 72%)",
                pointerEvents: "none",
                animation: "rcMemGlow 5.5s ease-in-out infinite",
              }}
            />
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <div style={{ fontFamily: SERIF, fontSize: 48, lineHeight: 1.04, color: "#faf5ee" }}>
                Where did you <span style={{ fontStyle: "italic", color: "#f0c79b" }}>grow up?</span>
              </div>
              <input
                className="rc-input"
                value={city}
                onChange={(e) => setCityText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") toTravel();
                }}
                placeholder="e.g. Atlanta, Georgia"
                autoFocus
                style={{
                  marginTop: 34,
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.28)",
                  outline: "none",
                  fontFamily: SERIF,
                  fontSize: 32,
                  color: "#faf5ee",
                  padding: "8px 2px 14px",
                  caretColor: "#f0c79b",
                }}
              />
            </div>
            <button
              onClick={toTravel}
              style={{
                width: "100%",
                border: "none",
                cursor: cityValid ? "pointer" : "default",
                padding: 18,
                borderRadius: 100,
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: 15,
                color: "#171019",
                background: "#fff",
                boxShadow: "0 14px 40px -12px rgba(255,255,255,0.35)",
                opacity: cityValid ? 1 : 0.35,
                pointerEvents: cityValid ? "auto" : "none",
                transition: "opacity 0.3s ease",
              }}
            >
              Take me back&nbsp;&nbsp;→
            </button>
          </div>
        )}

        {/* ============ time travel (magic over the live mirror) ============ */}
        {screen === "travel" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 4,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background:
                "radial-gradient(120% 95% at 50% 44%, rgba(18,12,24,0.30) 0%, rgba(7,5,12,0.80) 100%)",
              animation: "rcFade 0.8s ease both",
            }}
          >
            {/* spinning golden rays */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 980,
                height: 980,
                transform: "translate(-50%, -50%)",
                background:
                  "conic-gradient(from 0deg, rgba(240,199,155,0) 0deg, rgba(240,199,155,0.22) 8deg, rgba(240,199,155,0) 16deg, rgba(240,199,155,0) 20deg, rgba(240,199,155,0.17) 28deg, rgba(240,199,155,0) 36deg)",
                mixBlendMode: "screen",
                animation: "rcSpin 22s linear infinite",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 700,
                height: 700,
                transform: "translate(-50%, -50%)",
                background:
                  "conic-gradient(from 90deg, rgba(240,199,155,0) 0deg, rgba(240,199,155,0.14) 10deg, rgba(240,199,155,0) 22deg, rgba(240,199,155,0) 40deg, rgba(240,199,155,0.11) 50deg, rgba(240,199,155,0) 62deg)",
                mixBlendMode: "screen",
                animation: "rcSpinR 14s linear infinite",
                pointerEvents: "none",
              }}
            />
            {/* pulsing core glow */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 560,
                height: 560,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(240,199,155,0.30), rgba(240,199,155,0) 62%)",
                mixBlendMode: "screen",
                animation: "rcRayPulse 3.2s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
            {/* orbiting rings */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 340,
                height: 340,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                border: "1px solid rgba(240,199,155,0.26)",
                animation: "rcSpin 16s linear infinite",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 470,
                height: 470,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                border: "1px dashed rgba(240,199,155,0.18)",
                animation: "rcSpinR 24s linear infinite",
                pointerEvents: "none",
              }}
            />
            {/* drifting sparkles */}
            {SPARKS.map((s, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: s.left,
                  top: s.top,
                  animation: `rcFloat ${s.float} ease-in-out infinite ${s.delay}`,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    width: s.size,
                    height: s.size,
                    borderRadius: "50%",
                    background: "#ffe9c8",
                    boxShadow:
                      "0 0 10px rgba(255,225,180,0.9), 0 0 22px rgba(240,199,155,0.5)",
                    animation: `rcBlink ${s.blink} ease-in-out infinite ${s.delay}`,
                  }}
                />
              </div>
            ))}
            {/* brightening wash as the arrival nears (bleeds into the veil) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 50% 46%, rgba(255,248,238,0.9), rgba(255,248,238,0) 72%)",
                opacity: Math.max(0, (travelP - 55) / 45) * 0.5,
                transition: "opacity 0.4s linear",
                pointerEvents: "none",
              }}
            />

            {/* memories surfacing mid-journey: finished slides pop in as
                floating polaroids around the countdown (stills mode only) */}
            {!USE_WAN &&
              playlist.slice(0, POLAROID_SPOTS.length).map(({ url }, i) => {
              const s = POLAROID_SPOTS[i];
              return (
                <div
                  key={url}
                  style={{
                    position: "absolute",
                    left: s.left,
                    right: s.right,
                    top: s.top,
                    bottom: s.bottom,
                    transform: `rotate(${s.rot}deg)`,
                    zIndex: 1,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      animation: "rcPolaroidIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both",
                    }}
                  >
                    <div
                      style={{
                        animation: `rcFloat ${4 + i * 0.8}s ease-in-out infinite ${i * 0.5}s`,
                        padding: "7px 7px 22px",
                        background: "#faf5ee",
                        borderRadius: 3,
                        boxShadow: "0 18px 44px -12px rgba(0,0,0,0.6)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        style={{
                          width: 92,
                          height: 122,
                          objectFit: "cover",
                          display: "block",
                          borderRadius: 2,
                          background: "#241c2e",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <div style={{ position: "relative", textAlign: "center", zIndex: 2 }}>
              <div
                style={{
                  fontWeight: 500,
                  letterSpacing: "0.34em",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.55)",
                  textTransform: "uppercase",
                }}
              >
                {travelStatus}
              </div>
              <div
                style={{
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontSize: 27,
                  color: "#f0c79b",
                  marginTop: 18,
                  fontVariantNumeric: "tabular-nums",
                  textShadow: "0 0 24px rgba(240,199,155,0.4)",
                }}
              >
                {curMonthDay}
              </div>
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 124,
                  lineHeight: 0.94,
                  color: "#fff",
                  letterSpacing: -2,
                  margin: "4px 0 8px",
                  fontVariantNumeric: "tabular-nums",
                  textShadow: "0 0 46px rgba(255,235,205,0.4)",
                }}
              >
                {curYear}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 14,
                  fontWeight: 400,
                  fontSize: 16,
                  color: "rgba(255,255,255,0.66)",
                }}
              >
                <span>{cityLabel}</span>
              </div>
            </div>
          </div>
        )}

        {/* ================= result / film ================= */}
        {screen === "film" && (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#000" }}>
            {!USE_WAN ? (
              // Ken Burns slideshow: every slide stays mounted; the current
              // one fades in over the previous (no dip to black) and gets a
              // fresh, endlessly drifting Ken Burns run while it's showing —
              // during waits it never freezes.
              playlist.map(({ url }, i) => {
                const isShown = i === shownIdx;
                const isPrev = i === prevIdx && prevIdx !== shownIdx;
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt=""
                    style={{
                      ...FULL_BLEED,
                      zIndex: isShown ? 2 : isPrev ? 1 : 0,
                      opacity: isShown || isPrev ? 1 : 0,
                      transition: "opacity 0.45s ease",
                      animation: isShown
                        ? `${KEN_ANIMS[i % KEN_ANIMS.length]} 7s ease-in-out infinite alternate, rcFade 0.45s ease both`
                        : "none",
                    }}
                  />
                );
              })
            ) : (
              <>
                {/* Wan mode: live clip stack, double-buffered from blob URLs. */}
                {playlist.map(({ url }, i) => {
                  if (i < cursor - 1 || i > cursor + 1) return null;
                  const isCur = i === cursor && !finalMode;
                  return (
                    <video
                      key={url}
                      ref={(el) => {
                        clipRefs.current[i] = el;
                      }}
                      src={url}
                      muted
                      playsInline
                      preload="auto"
                      autoPlay={isCur}
                      onEnded={isCur ? () => setCursor((c) => c + 1) : undefined}
                      style={{
                        ...FULL_BLEED,
                        zIndex: i === cursor ? 2 : i === cursor - 1 ? 1 : 0,
                        opacity: i === cursor + 1 ? 0 : 1,
                      }}
                    />
                  );
                })}
                {finalMode && (
                  <video
                    ref={filmRef}
                    key="final"
                    src={videoUrl}
                    autoPlay
                    muted
                    playsInline
                    onEnded={() => {
                      const v = filmRef.current;
                      if (v) {
                        v.currentTime = 0;
                        v.play().catch(() => {});
                      }
                      const m = musicRef.current;
                      if (m) {
                        m.currentTime = 0;
                        m.play().catch(() => {});
                      }
                    }}
                    style={{ ...FULL_BLEED, zIndex: 3 }}
                  />
                )}
              </>
            )}

            {/* mute + share buttons */}
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              style={{
                position: "absolute",
                top: 22,
                right: 72,
                zIndex: 6,
                width: 44,
                height: 44,
                border: "none",
                cursor: "pointer",
                borderRadius: "50%",
                background: "rgba(20,16,26,0.32)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: muted ? "rgba(255,255,255,0.55)" : "#fff",
              }}
            >
              <SoundIcon muted={muted} />
            </button>
            <button
              onClick={restart}
              aria-label="Start over"
              style={{
                position: "absolute",
                top: 22,
                right: 20,
                zIndex: 6,
                width: 44,
                height: 44,
                border: "none",
                cursor: "pointer",
                borderRadius: "50%",
                background: "rgba(20,16,26,0.32)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <RestartIcon />
            </button>

            {/* No progress/waiting pills or popups here, ever — the film is
                a live experience and must always feel live. */}
          </div>
        )}

        {/* ============ white veil (travel → film) ============ */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 15,
            background: "#ffffff",
            opacity: veil,
            pointerEvents: "none",
            transition: veilSlow ? "opacity 1.7s ease" : "opacity 0.6s ease",
          }}
        />

        {/* film grain */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            pointerEvents: "none",
            opacity: 0.07,
            mixBlendMode: "soft-light",
            backgroundImage:
              "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')",
          }}
        />

        {/* error pill (any screen) */}
        {error && (
          <button
            onClick={restart}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 40,
              transform: "translateX(-50%)",
              zIndex: 30,
              padding: "12px 22px",
              borderRadius: 100,
              border: "none",
              cursor: "pointer",
              background: "rgba(24,18,30,0.85)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              color: "#f2b8b8",
              fontFamily: SANS,
              fontWeight: 500,
              fontSize: 13.5,
              boxShadow: "0 14px 34px -12px rgba(0,0,0,0.5)",
              maxWidth: "86%",
            }}
          >
            {error} — tap to start over
          </button>
        )}
      </div>
    </div>
  );
}

// Speaker glyph; a slash replaces the sound waves when muted.
function SoundIcon({ muted, size = 18 }: { muted: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="m15 9 6 6M21 9l-6 6" />
      ) : (
        <>
          <path d="M14.5 9.5a4 4 0 0 1 0 5" />
          <path d="M17 7a7.5 7.5 0 0 1 0 10" />
        </>
      )}
    </svg>
  );
}

// Circular-arrow glyph for starting the experience over.
function RestartIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 3.5v4.6h4.6" />
    </svg>
  );
}
