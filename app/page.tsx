"use client";

// Reverie — cinematic flow from the Claude Design handoff
// (handoff/childhood-memory-reliving-website/project/Reverie.dc.html), wired
// to the real pipeline: scan → Gemini age estimate, city → research, time
// travel → the tear-off-calendar rewind over the live camera (the session
// music starts here and runs continuously), film → 7 scenes, every one a
// researched, location-specific moment (no generic era filler): Nano Banana
// still → Wan 2.2 clip, and the still is never shown — the film is
// video-only. The reveal deliberately waits until EVERY clip has generated
// (the calendar show + rotating personalized loading lines carry the whole
// wait), then the film plays start-to-finish as one continuous piece: each
// 2s scene hard-cuts to the next, no crossfades, no mid-film loops or waits.
// A TikTok-style "POV: Growing up in {year} {city}." line sits on the film, burned
// into the shareable mp4 (ffmpeg stitch: clips + hard cuts + music + POV
// text), offered via the share sheet after the first full pass. The film
// screen itself never shows progress popups. Set NEXT_PUBLIC_USE_WAN=1 for
// the legacy pure-clip path.

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

const CONCURRENCY = 7;
const CHILD_AGE = 7; // matches the POV age in the image/video prompts
const USE_WAN = process.env.NEXT_PUBLIC_USE_WAN === "1"; // motion clips instead of stills
const SLIDE_MS = 2000; // 7 slides × 2s = a 14s pass
const TRAVEL_LOAD_MS = 80000;
const SANS = "var(--font-sans), sans-serif";
const SERIF = "var(--font-serif), serif";

// Travel tunnel: real pop-culture photos (2 per year, last ~80 years, from
// public/polaroids/) fly past as polaroids, matched to the year the rewind
// is passing through. Drawn entirely on one canvas — no per-frame React.
type PolaroidEntry = { y: number; l: string; f: string };
type RecorderChoice = { mimeType: string; ext: "mp4" | "webm"; fileType: string };

function inverseSmootherStep(v: number): number {
  let lo = 0;
  let hi = 1;
  const target = Math.max(0, Math.min(1, v));
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const eased = mid * mid * mid * (mid * (mid * 6 - 15) + 10);
    if (eased < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function rewindTimeForDateMs(startTime: number, targetTime: number, dateTime: number): number {
  const span = Math.max(1, startTime - targetTime);
  const easedAtDate = Math.max(0, Math.min(1, (startTime - dateTime) / span));
  return inverseSmootherStep(easedAtDate) * TRAVEL_LOAD_MS;
}

function yearWindowMs(year: number, startTime: number, targetTime: number) {
  const startYear = new Date(startTime).getFullYear();
  const targetYear = new Date(targetTime).getFullYear();
  const start =
    year >= startYear
      ? 0
      : rewindTimeForDateMs(startTime, targetTime, new Date(year + 1, 0, 1).getTime());
  const end =
    year <= targetYear
      ? TRAVEL_LOAD_MS
      : rewindTimeForDateMs(startTime, targetTime, new Date(year, 0, 1).getTime());
  return { start, end: Math.max(start + 1, end) };
}

function flashFractions(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0.55];
  if (count === 2) return [0.4, 0.8];
  return Array.from({ length: count }, (_, i) => 0.25 + (0.65 * i) / Math.max(1, count - 1));
}

function pickRecorder(): RecorderChoice | null {
  if (typeof MediaRecorder === "undefined") return null;
  const choices: RecorderChoice[] = [
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4", fileType: "video/mp4" },
    { mimeType: "video/mp4", ext: "mp4", fileType: "video/mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", ext: "webm", fileType: "video/webm" },
    { mimeType: "video/webm;codecs=vp8,opus", ext: "webm", fileType: "video/webm" },
    { mimeType: "video/webm", ext: "webm", fileType: "video/webm" },
  ];
  return choices.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ?? null;
}

function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number) {
  const vw = video.videoWidth || w;
  const vh = video.videoHeight || h;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawPovText(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  if (!text) return;
  ctx.save();
  ctx.font = "800 43px -apple-system, 'Helvetica Neue', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.fillStyle = "#fff";
  ctx.strokeText(text, w / 2, h * 0.11 + 42, w - 40);
  ctx.fillText(text, w / 2, h * 0.11 + 42, w - 40);
  ctx.restore();
}

async function loadVideoForRender(blob: Blob, urls: string[]): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  const v = document.createElement("video");
  v.src = url;
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    const done = () => resolve();
    v.addEventListener("loadedmetadata", done, { once: true });
    v.addEventListener("error", () => reject(new Error("Clip could not be loaded")), { once: true });
  });
  return v;
}

async function seekStart(v: HTMLVideoElement) {
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    window.setTimeout(done, 350);
    try {
      v.currentTime = 0;
    } catch {
      done();
    }
  });
}

async function drawSegment(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  povText: string,
) {
  await seekStart(video);
  await video.play().catch(() => {});
  const started = performance.now();
  await new Promise<void>((resolve) => {
    const draw = () => {
      const elapsed = performance.now() - started;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawCover(ctx, video, canvas.width, canvas.height);
      drawPovText(ctx, povText, canvas.width, canvas.height);
      if (elapsed >= SLIDE_MS) {
        video.pause();
        resolve();
      } else {
        requestAnimationFrame(draw);
      }
    };
    draw();
  });
}

async function renderFilmInBrowser(
  clips: Blob[],
  povText: string,
  musicUrl: string,
): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const choice = pickRecorder();
  if (!choice) throw new Error("No browser video recorder");

  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  const captureStream = canvas.captureStream?.bind(canvas);
  if (!ctx || !captureStream) throw new Error("No canvas recorder");

  const stream = captureStream(30);
  let audioCtx: AudioContext | null = null;
  let audioSrc: AudioBufferSourceNode | null = null;
  try {
    audioCtx = new AudioContext();
    const music = await fetch(musicUrl).then((r) => r.arrayBuffer());
    const audio = await audioCtx.decodeAudioData(music.slice(0));
    const dest = audioCtx.createMediaStreamDestination();
    audioSrc = audioCtx.createBufferSource();
    audioSrc.buffer = audio;
    audioSrc.connect(dest);
    dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    await audioCtx.resume().catch(() => {});
  } catch {
    audioCtx?.close().catch(() => {});
    audioCtx = null;
    audioSrc = null;
  }

  const tempUrls: string[] = [];
  const videos = await Promise.all(clips.map((clip) => loadVideoForRender(clip, tempUrls)));
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: choice.mimeType,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 128_000,
  });
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("Browser recording failed"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: choice.fileType }));
  });

  recorder.start(250);
  try {
    audioSrc?.start();
  } catch {
    audioSrc = null;
  }
  let renderError: unknown = null;
  try {
    for (const video of videos) {
      await drawSegment(ctx, canvas, video, povText);
    }
  } catch (err) {
    renderError = err;
  } finally {
    try {
      audioSrc?.stop();
    } catch {}
    videos.forEach((video) => video.pause());
    stream.getTracks().forEach((track) => track.stop());
    tempUrls.forEach((url) => URL.revokeObjectURL(url));
    audioCtx?.close().catch(() => {});
    if (recorder.state !== "inactive") recorder.stop();
  }
  const blob = await done;
  if (renderError) throw renderError;
  return { blob, ext: choice.ext };
}

// The POV line as a transparent 1080-wide PNG data URL for the ffmpeg
// overlay — same TikTok look as the live element (bold white, thick black
// stroke).
function renderPovPng(text: string): string {
  try {
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 160;
    const x = c.getContext("2d");
    if (!x) return "";
    x.font = "800 64px -apple-system, 'Helvetica Neue', Arial, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.lineJoin = "round";
    x.lineWidth = 14;
    x.strokeStyle = "rgba(0,0,0,0.9)";
    x.strokeText(text, 540, 80, 1020);
    x.fillStyle = "#fff";
    x.fillText(text, 540, 80, 1020);
    return c.toDataURL("image/png");
  } catch {
    return "";
  }
}

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

  // ---- film (live player: scenes play in index/story order; the film is
  // video-only, so a scene enters the playlist only when its Wan clip lands)
  const [playlist, setPlaylist] = useState<
    Array<{ idx: number; url: string; video?: string }>
  >([]);
  const [videoCount, setVideoCount] = useState(0); // finished Wan clips
  // travel: memories currently flying past (several concurrent for a fluid feel)
  const [flyMems, setFlyMems] = useState<
    Array<{ id: number; src: string; dx: number; dy: number }>
  >([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [genDone, setGenDone] = useState(false);
  const [liveDone, setLiveDone] = useState(false);
  const [videoUrl, setVideoUrl] = useState(""); // stitched shareable mp4 (blob URL)
  const [showShare, setShowShare] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const [toast, setToast] = useState("");
  const [muted, setMuted] = useState(false);

  const mirrorRef = useRef<HTMLVideoElement>(null);
  const filmRef = useRef<HTMLVideoElement>(null);
  const clipRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const musicRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobUrlsRef = useRef<string[]>([]); // object URLs to revoke on restart
  const clipBlobsRef = useRef<Record<number, Blob>>({}); // browser-held Wan clips for share export
  const finalBlobRef = useRef<Blob | null>(null); // stitched mp4 for Web Share
  const finalFileExtRef = useRef<"mp4" | "webm">("mp4");
  const videoElsRef = useRef<Record<number, HTMLVideoElement | null>>({}); // slide clips
  const travelT0Ref = useRef(0); // when travel began (loading lines + reveal cap)
  // Travel show: the polaroid memory tunnel, drawn on one canvas.
  const tunnelRef = useRef<HTMLCanvasElement | null>(null);
  const warpSpeedRef = useRef(0); // eased travel progress, read by the tunnel rAF loop
  const travelProgressRef = useRef(0); // raw progress, read by the memory-photo scheduler
  const travelFromTimeRef = useRef(Date.now()); // fixed "today" for the rewind timeline
  const curYearRef = useRef(new Date().getFullYear()); // year the rewind is passing
  const povYearRef = useRef(0); // the childhood year the journey lands on
  const flyIdRef = useRef(0); // increments per flying memory
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    // Every scene is location-specific, so nothing can render until the user
    // names their hometown — the session just gets its id here.
    if (!sessionRef.current) {
      sessionRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now());
    }
    setTimeout(() => {
      if (runRef.current === run) setLocked(true);
    }, 350);
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

  // Generate one scene. Default path: Nano Banana still → Wan clip; the film
  // is video-only, so nothing joins the playlist until the clip exists.
  // Returns its index once the scene is playable, or null on failure.
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
      if (USE_WAN) {
        // Wan clips are served by a follow-up GET (local-only path).
        await r.json().catch(() => ({}));
        const apiUrl = `/api/video?session=${encodeURIComponent(sessionId)}&clip=${i}`;
        let url = apiUrl;
        try {
          const blob = await (await fetch(apiUrl)).blob();
          clipBlobsRef.current[i] = blob;
          url = URL.createObjectURL(blob);
          blobUrlsRef.current.push(url);
        } catch {}
        if (runRef.current !== run) return null;
        // Insert in index order so the live pass follows the storyboard order
        // (a late slide slots into place, not onto the end).
        setPlaylist((prev) =>
          [...prev, { idx: i, url }].sort((a, b) => a.idx - b.idx),
        );
        return i;
      }
      // The still comes back in the POST body (serverless instances don't
      // share disk). It is never shown — it exists to hand Wan the exact
      // frame to animate.
      const blob = await r.blob();
      return (await animateSlide(run, sessionId, i, blob, spec.videoPrompt)) ? i : null;
    } catch {
      return null;
    }
  }

  // Animate one scene's still into a Wan 2.2 clip, routed least-busy across
  // the fleet by the server. The film is video-only: the scene joins the
  // playlist only here, once it moves; on failure it simply never exists.
  async function animateSlide(
    run: number,
    sessionId: string,
    i: number,
    still: Blob,
    videoPrompt: string,
  ): Promise<boolean> {
    try {
      const buf = new Uint8Array(await still.arrayBuffer());
      let bin = "";
      for (let o = 0; o < buf.length; o += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(o, o + 0x8000));
      }
      const r = await fetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          index: i,
          videoPrompt,
          image: { data: btoa(bin), mimeType: still.type || "image/jpeg" },
        }),
      });
      if (!r.ok) return false;
      const blob = await r.blob();
      if (runRef.current !== run) return false;
      clipBlobsRef.current[i] = blob;
      const url = URL.createObjectURL(blob);
      blobUrlsRef.current.push(url);
      setPlaylist((prev) =>
        [...prev, { idx: i, url, video: url }].sort((a, b) => a.idx - b.idx),
      );
      setVideoCount((c) => c + 1);
      return true;
    } catch {
      return false;
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
    // continuously through travel and the film.
    const m = musicRef.current;
    if (m) {
      m.src = `/api/music?session=${encodeURIComponent(sessionId)}`;
      m.volume = 1;
      m.play().catch(() => {});
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

    // Progress creeps to 97% over ~80s — research + stills + all seven Wan
    // clips take a while, and the reveal deliberately waits for every clip so
    // the film plays through as one continuous piece. The arrival ramp (armed
    // by the effect below once generation is done) accelerates it to 100% and
    // the veil reveals the film. The displayed date rewinds on an ease-in
    // curve of this progress, so it starts slow and speeds up.
    const t0 = Date.now();
    travelT0Ref.current = t0;
    travelFromTimeRef.current = t0;
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
        setTravelP((p) => Math.max(p, Math.min(97, ((Date.now() - t0) / TRAVEL_LOAD_MS) * 100)));
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

  function setFinalShareBlob(blob: Blob, ext: "mp4" | "webm" = "mp4") {
    finalBlobRef.current = blob;
    finalFileExtRef.current = ext;
    const url = URL.createObjectURL(blob);
    blobUrlsRef.current.push(url);
    setVideoUrl(url);
    setShareFailed(false);
  }

  async function renderShareFilm(
    run: number,
    sessionId: string,
    indices: number[],
    povImage: string,
    povText: string,
  ): Promise<boolean> {
    const clips = indices.map((index) => clipBlobsRef.current[index]);
    if (clips.some((clip) => !clip)) return false;
    const readyClips = clips as Blob[];

    try {
      const form = new FormData();
      form.set("sessionId", sessionId);
      form.set("indices", JSON.stringify(indices));
      form.set("mode", "hybrid");
      form.set("povImage", povImage);
      indices.forEach((index, k) => {
        form.append(`clip-${index}`, readyClips[k], `clip-${index}.mp4`);
      });
      const sr = await fetch("/api/stitch", { method: "POST", body: form });
      const sd = await sr.json().catch(() => ({}));
      if (!sr.ok) throw new Error(sd.error || "Stitch failed");
      const blob = await fetch(sd.videoUrl).then((r) => {
        if (!r.ok) throw new Error("Rendered film missing");
        return r.blob();
      });
      if (runRef.current !== run) return false;
      setFinalShareBlob(blob, "mp4");
      return true;
    } catch {}

    try {
      const rendered = await renderFilmInBrowser(
        readyClips,
        povText,
        `/api/music?session=${encodeURIComponent(sessionId)}`,
      );
      if (runRef.current !== run) return false;
      setFinalShareBlob(rendered.blob, rendered.ext);
      return true;
    } catch {
      if (runRef.current === run) setShareFailed(true);
      return false;
    }
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
      // All seven scenes come from research — every one anchored to the
      // hometown, no generic era-only filler.
      const queue = moments.slice(0, 7);
      setTotal(queue.length);

      const tasks = queue.map((m, j) => () =>
        buildSlide(run, sessionId, j, {
          imagePrompt: m.imagePrompt,
          videoPrompt: m.videoPrompt,
          referenceQuery: m.referenceQuery,
          mode: "generated" as const,
        }),
      );

      const poolResults = await runPool(tasks, CONCURRENCY);
      if (runRef.current !== run) return;
      setGenDone(true);

      const ok = poolResults
        .filter((x): x is number => x !== null)
        .sort((a, b) => a - b);
      if (ok.length === 0) throw new Error("The film couldn't be developed");

      // Every index in `ok` has a rendered Wan clip (buildSlide resolves only
      // after the clip lands), so the stitched mp4 is video-only too.
      const birthYear = new Date().getFullYear() - prof.ageYears;
      const povCity = cityName.split(",")[0].trim();
      const povText = `POV: Growing up in ${birthYear + 7} ${povCity.charAt(0).toUpperCase() + povCity.slice(1)}.`;
      // Render the POV line to a transparent PNG for the stitch overlay —
      // canvas text matches the live overlay exactly, and the local ffmpeg
      // build has no drawtext filter.
      const povImage = renderPovPng(povText);

      // A share-render failure only affects exporting — the live film keeps
      // playing, so it must never surface as a full-screen error.
      await renderShareFilm(run, sessionId, ok, povImage, povText);
    } catch (err: any) {
      if (runRef.current === run) setError(err?.message ?? "Something went wrong");
    }
  }

  // The arrival arms only when the WHOLE film is generated (genDone: every
  // scene's clip has settled), so the reveal plays start-to-finish as one
  // continuous video with zero mid-film waits — the calendar show carries the
  // entire generation. The countdown then accelerates to 100% and reveals.
  useEffect(() => {
    if (screen !== "travel" || playlist.length === 0 || arrivalRef.current) return;
    if (!USE_WAN && !genDone) return;
    arrivalRef.current = {
      from: travelP,
      t0: Date.now(),
      rampMs: travelP < 15 ? 6000 : 3500,
    };
  }, [screen, playlist.length, travelP, genDone]);

  // ================= live player driver =================

  useEffect(() => {
    if (screen !== "film") return;
    if (cursor < playlist.length) return;
    if (genDone && playlist.length > 0) {
      if (!liveDone) {
        setLiveDone(true);
        setShowShare(true); // first full playthrough done — offer the share sheet
      }
      musicRef.current?.pause();
      const lastVideo = USE_WAN
        ? clipRefs.current[playlist.length - 1]
        : videoElsRef.current[playlist[playlist.length - 1]?.idx];
      lastVideo?.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, playlist.length, cursor, genDone, liveDone]);

  // The stitched file is for sharing only. The live film holds on its ended
  // frame instead of swapping to an autoplaying background mp4.
  const finalMode = false;

  // Slideshow driver: advance every two seconds while the next slide exists.
  // If generation falls behind, the current scene keeps drifting until the
  // next index appears.
  useEffect(() => {
    if (USE_WAN || screen !== "film") return;
    if (cursor >= playlist.length) return; // holding on the last slide or looping
    const n = genDone ? playlist.length : Math.max(total, playlist.length, 1);
    const timer = setTimeout(() => {
      setCursor((c) => Math.min(c + 1, n));
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [screen, cursor, playlist.length, genDone, total]);

  // Slide clips: restart the shown scene's loop from its first frame and
  // pause the rest (seven looping videos would decode for nothing).
  useEffect(() => {
    if (USE_WAN || screen !== "film") return;
    if (cursor >= playlist.length && genDone) {
      playlist.forEach((p, i) => {
        const v = videoElsRef.current[p.idx];
        if (!v || i === playlist.length - 1) return;
        v.pause();
      });
      videoElsRef.current[playlist[playlist.length - 1]?.idx]?.pause();
      return;
    }
    const shown = playlist.length > 0 ? Math.min(cursor, playlist.length - 1) : -1;
    playlist.forEach((p, i) => {
      const v = videoElsRef.current[p.idx];
      if (!v) return;
      if (i === shown) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
    });
  }, [screen, cursor, playlist]);

  // Scenes hard-cut between each other — no crossfade.
  const shownIdx = playlist.length > 0 ? Math.min(cursor, playlist.length - 1) : -1;

  // Wan mode: start the current clip. The next clip is mounted early as a
  // hidden, fully-buffered <video>; when the cursor reaches it, autoPlay has
  // already fired on mount, so we kick playback here instead.
  useEffect(() => {
    if (!USE_WAN || screen !== "film" || finalMode) return;
    const v = clipRefs.current[cursor];
    if (v && v.paused && !v.ended) v.play().catch(() => {});
  }, [screen, cursor, playlist, finalMode]);

  // Browsers suspend background media when the page is hidden (phone locks,
  // app switch). Resume the music and (Wan mode) the current video when visible
  // again.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (screen === "travel" || (screen === "film" && !liveDone)) {
        const m = musicRef.current;
        if (m && m.paused && m.src) m.play().catch(() => {});
      }
      if (screen !== "film") return;
      if (USE_WAN && !liveDone) {
        const v = finalMode ? filmRef.current : clipRefs.current[cursor];
        if (v && v.paused && !v.ended) v.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [screen, cursor, finalMode]);

  // ================= menu actions =================

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }

  // iPhone: Web Share sheet with the mp4 file (Save Video → camera roll).
  // Desktop / no Web Share: plain download.
  async function shareFilm() {
    if (!videoUrl) {
      showToast("Still developing — one moment");
      return;
    }
    const blob = finalBlobRef.current;
    if (blob && typeof navigator.share === "function") {
      const file = new File([blob], `relive-childhood.${finalFileExtRef.current}`, {
        type: blob.type || (finalFileExtRef.current === "mp4" ? "video/mp4" : "video/webm"),
      });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Relive Childhood" });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return; // user closed the share sheet
        }
      }
    }
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `relive-childhood.${finalFileExtRef.current}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("Saved your film");
  }

  function watchAgain() {
    setShowShare(false);
    setLiveDone(false);
    setCursor(0);
    const m = musicRef.current;
    if (m) {
      m.currentTime = 0;
      m.play().catch(() => {});
    }
    const final = filmRef.current;
    if (final) {
      final.currentTime = 0;
      final.play().catch(() => {});
    }
    Object.values(videoElsRef.current).forEach((v) => {
      if (!v) return;
      v.pause();
      v.currentTime = 0;
    });
    clipRefs.current.forEach((v) => {
      if (!v) return;
      v.pause();
      v.currentTime = 0;
    });
  }

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      if (musicRef.current) musicRef.current.muted = next;
      return next;
    });
  }

  function restart() {
    runRef.current++;
    clearTimers();
    stopCam();
    musicRef.current?.pause();
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];
    clipBlobsRef.current = {};
    finalBlobRef.current = null;
    finalFileExtRef.current = "mp4";
    videoElsRef.current = {};
    warpSpeedRef.current = 0;
    curYearRef.current = new Date().getFullYear();
    clipRefs.current = [];
    arrivalRef.current = null;
    revealFiredRef.current = false;
    sessionRef.current = "";
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
    setVideoCount(0);
    setFlyMems([]);
    setShowShare(false);
    setShareFailed(false);
    setToast("");
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
  const travelFromTime = travelFromTimeRef.current || Date.now();
  const targetTime = new Date(fromYear - yearsBack, 5, 15).getTime();
  const curDate = new Date(travelFromTime - (travelFromTime - targetTime) * eased);
  const curYear = curDate.getFullYear();
  const curMonth = curDate.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  warpSpeedRef.current = eased; // the tunnel canvas reads this every frame
  travelProgressRef.current = travelP; // the photo scheduler reads this without React ticks
  curYearRef.current = curYear; // ...and matches polaroids to this year
  const cityTrim = city.trim();
  const cityValid = Boolean(cityTrim);
  const showMirror = screen === "scan" || screen === "city" || screen === "travel";

  // TikTok-style overlay: "POV: Growing up in 2007 Brambleton." — city as
  // typed (before any comma), the childhood year the countdown lands on.
  const povCityRaw = cityTrim.split(",")[0].trim();
  const povCity = povCityRaw ? povCityRaw.charAt(0).toUpperCase() + povCityRaw.slice(1) : "";
  const povYear = fromYear - yearsBack;
  povYearRef.current = povYear; // tunnel polaroids never go past this year
  const povLine = povCity ? `POV: Growing up in ${povYear} ${povCity}.` : "";

  // The time tunnel: light streaks racing outward past the camera, speed
  // tied to the eased rewind progress. Pure lines on one canvas — the
  // cheapest possible per-frame work.
  useEffect(() => {
    if (screen !== "travel") return;
    const canvas = tunnelRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const cx = w / 2;
    const cy = h * 0.44;
    const maxR = Math.hypot(cx, cy) + 40;
    const stars = Array.from({ length: 90 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: Math.pow(Math.random(), 0.6) * maxR,
      w: 0.4 + Math.random() * 1.2,
    }));
    let raf = 0;
    const step = () => {
      ctx.clearRect(0, 0, w, h);
      const sp = 0.16 + warpSpeedRef.current * 1.2;
      for (const s of stars) {
        const v = (0.35 + s.r * 0.012) * sp * 6;
        const r2 = s.r + v;
        const alpha = Math.min(0.55, 0.12 + (s.r / maxR) * 0.45) * Math.min(1, sp * 2);
        ctx.strokeStyle = `rgba(240, 214, 180, ${alpha})`;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(s.a) * s.r, cy + Math.sin(s.a) * s.r);
        ctx.lineTo(cx + Math.cos(s.a) * r2, cy + Math.sin(s.a) * r2);
        ctx.stroke();
        if (r2 > maxR) {
          s.r = Math.random() * 30;
          s.a = Math.random() * Math.PI * 2;
        } else {
          s.r = r2;
        }
      }
      raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  // Memories flying by: real photos from the years the rewind is passing
  // fly outward past the camera. Each year gets its photos spaced across the
  // displayed year, so the first slow years breathe before flashes appear and
  // later years naturally tighten as the rewind accelerates.
  useEffect(() => {
    if (screen !== "travel") return;
    let manifest: PolaroidEntry[] = [];
    const byYear = new Map<number, number[]>();
    const cache = new Map<string, HTMLImageElement>();
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let activeYear = Number.NaN;
    let shownSlots = 0;
    // The image currently being waited on — kept stable across ticks so a
    // slow-loading photo isn't abandoned for a new pick every tick (that was
    // firing dozens of parallel fetches with almost none completing in time).
    let pending: { idx: number; img: HTMLImageElement; year: number } | null = null;
    const preload = (idx: number) => {
      const src = `/polaroids/${manifest[idx].f}`;
      let im = cache.get(src);
      if (!im) {
        im = new Image();
        im.src = src;
        cache.set(src, im);
      }
      return im;
    };
    const warmYear = (year: number) => {
      [year + 1, year, year - 1].forEach((y) => byYear.get(y)?.forEach(preload));
    };
    fetch("/polaroids/manifest.json")
      .then((r) => r.json())
      .then((m: PolaroidEntry[]) => {
        if (!alive) return;
        manifest = m;
        m.forEach((e, i) => {
          const list = byYear.get(e.y) ?? [];
          list.push(i);
          byYear.set(e.y, list);
        });
        // Warm a few years around the start of the journey so the first
        // flights don't stall on a cold fetch.
        warmYear(curYearRef.current);
      })
      .catch(() => {});

    const schedule = () => {
      if (!alive) return;
      let delay = pending ? 120 : 450;
      const entries = byYear.get(curYearRef.current) ?? [];
      if (!pending && entries.length > 0 && shownSlots < entries.length) {
        const targetTime = new Date(fromYear - yearsBack, 5, 15).getTime();
        const win = yearWindowMs(curYearRef.current, travelFromTimeRef.current, targetTime);
        const fractions = flashFractions(entries.length);
        const virtualNow = (travelProgressRef.current / 100) * TRAVEL_LOAD_MS;
        const dueAt = win.start + (win.end - win.start) * fractions[shownSlots];
        delay = Math.max(90, Math.min(600, dueAt - virtualNow));
      }
      timer = setTimeout(tick, delay);
    };
    const tick = () => {
      if (!alive || manifest.length === 0) return schedule();
      const year = curYearRef.current;
      if (year !== activeYear) {
        activeYear = year;
        shownSlots = 0;
        pending = null;
        warmYear(year);
      }
      const entries = byYear.get(year) ?? [];
      if (entries.length === 0) return schedule();
      const targetTime = new Date(fromYear - yearsBack, 5, 15).getTime();
      const win = yearWindowMs(year, travelFromTimeRef.current, targetTime);
      const fractions = flashFractions(entries.length);
      const virtualNow = (travelProgressRef.current / 100) * TRAVEL_LOAD_MS;
      const yearDuration = win.end - win.start;
      const due = shownSlots < entries.length && virtualNow >= win.start + yearDuration * fractions[shownSlots];
      if (!pending && due) {
        const idx = entries[shownSlots];
        pending = { idx, img: preload(idx), year };
      }
      if (!pending) return schedule();
      const p = pending!;
      if (p.year !== year) {
        pending = null;
        return schedule();
      }
      if (!(p.img.complete && p.img.naturalWidth > 0)) return schedule(); // keep waiting on the same image
      const a = Math.random() * Math.PI * 2;
      setFlyMems((fm) => [
        ...fm.slice(-3),
        { id: flyIdRef.current++, src: p.img.src, dx: Math.cos(a), dy: Math.sin(a) * 0.65 },
      ]);
      shownSlots++;
      pending = null;
      schedule();
    };
    schedule();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      setFlyMems([]);
    };
  }, [screen]);

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
            {/* the time tunnel: light streaks racing past the camera */}
            <canvas
              ref={tunnelRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                zIndex: 0,
                pointerEvents: "none",
              }}
            />

            {/* memories flying by: real photos of the years being passed fly
                outward past the camera, several overlapping for a fluid,
                continuous feel (like the warp lines, not discrete cards) */}
            {flyMems.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.src}
                alt=""
                onAnimationEnd={() => setFlyMems((fm) => fm.filter((x) => x.id !== m.id))}
                style={
                  {
                    position: "absolute",
                    top: "44%",
                    left: "50%",
                    width: "58%",
                    aspectRatio: "1",
                    objectFit: "cover",
                    borderRadius: 8,
                    zIndex: 1,
                    pointerEvents: "none",
                    ["--dx" as string]: m.dx,
                    ["--dy" as string]: m.dy,
                    animation: "rcMemFly 2.2s cubic-bezier(0.22,0.6,0.36,1) both",
                    boxShadow: "0 0 70px rgba(255,235,205,0.22)",
                  } as React.CSSProperties
                }
              />
            ))}

            {/* brightening wash as the arrival nears (bleeds into the veil) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 50% 42%, rgba(255,248,238,0.9), rgba(255,248,238,0) 72%)",
                opacity: Math.max(0, (travelP - 55) / 45) * 0.5,
                transition: "opacity 0.4s linear",
                zIndex: 3,
                pointerEvents: "none",
              }}
            />

            {/* month above the giant year — the only other text on this
                screen, loading is the show */}
            <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
              <div
                style={{
                  fontWeight: 600,
                  letterSpacing: "0.34em",
                  fontSize: 14,
                  color: "rgba(255,255,255,0.6)",
                  textShadow: "0 0 20px rgba(255,235,205,0.35)",
                }}
              >
                {curMonth}
              </div>
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 148,
                  lineHeight: 1,
                  color: "#fff",
                  letterSpacing: -4,
                  marginTop: 4,
                  fontVariantNumeric: "tabular-nums",
                  textShadow: "0 0 60px rgba(255,235,205,0.55), 0 2px 24px rgba(0,0,0,0.6)",
                }}
              >
                {curYear}
              </div>
            </div>
          </div>
        )}

        {/* ================= result / film ================= */}
        {screen === "film" && (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#000" }}>
            {!USE_WAN ? (
              // Every scene's clip is fully generated before the reveal, so
              // this plays start-to-finish like one continuous video: each
              // clip runs once for its 2s scene, hard cut to the next.
              playlist.map((p, i) => {
                const isShown = i === shownIdx;
                return (
                  <video
                    key={p.video}
                    ref={(el) => {
                      videoElsRef.current[p.idx] = el;
                    }}
                    src={p.video}
                    muted
                    playsInline
                    autoPlay={isShown}
                    style={{
                      ...FULL_BLEED,
                      zIndex: isShown ? 2 : 0,
                      opacity: isShown ? 1 : 0,
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
                    muted
                    playsInline
                    onEnded={() => {
                      filmRef.current?.pause();
                      musicRef.current?.pause();
                    }}
                    style={{ ...FULL_BLEED, zIndex: 3 }}
                  />
                )}
              </>
            )}

            {/* TikTok-style POV line — also burned into the shared mp4 */}
            {povLine && (
              <div
                style={{
                  position: "absolute",
                  top: "11%",
                  left: 0,
                  right: 0,
                  zIndex: 5,
                  textAlign: "center",
                  pointerEvents: "none",
                  fontFamily: SANS,
                  fontWeight: 800,
                  fontSize: 27,
                  letterSpacing: 0.2,
                  color: "#fff",
                  textShadow:
                    "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 0 #000, 0 6px 22px rgba(0,0,0,0.55)",
                  animation: "rcRise 0.9s ease both",
                }}
              >
                {povLine}
              </div>
            )}

            {/* mute + share + start-over buttons */}
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
                right: 124,
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
            <button
              onClick={() => setShowShare(true)}
              aria-label="Share"
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
              <ShareIcon />
            </button>

            {/* No progress/waiting pills on the film — the only transient
                pill is share feedback */}
            {toast && <Pill text={toast} />}

            {/* share sheet — pops up after the first full playthrough */}
            {showShare && (
              <div
                onClick={() => setShowShare(false)}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 8,
                  background: "rgba(5,4,9,0.5)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  animation: "rcFade 0.25s ease both",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    margin: "0 14px 18px",
                    borderRadius: 28,
                    padding: "28px 22px 12px",
                    textAlign: "center",
                    background: "rgba(24,18,30,0.82)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    boxShadow:
                      "0 24px 60px -16px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.08)",
                    animation: "rcSheet 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
                  }}
                >
                  <div style={{ fontFamily: SERIF, fontSize: 30, color: "#faf5ee" }}>
                    Share your <span style={{ fontStyle: "italic", color: "#f0c79b" }}>memory</span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontWeight: 300,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      color: "rgba(255,255,255,0.55)",
                    }}
                  >
                    {videoUrl
                      ? "Save it to your camera roll or send it to someone who was there."
                      : shareFailed
                        ? "The share export couldn't finish here. You can still watch the film again."
                        : "Your film is still developing — the button lights up when it's ready."}
                  </div>
                  <button
                    onClick={shareFilm}
                    style={{
                      marginTop: 20,
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      padding: 17,
                      borderRadius: 100,
                      fontFamily: SANS,
                      fontWeight: 600,
                      fontSize: 15,
                      color: "#171019",
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 9,
                      opacity: videoUrl ? 1 : 0.5,
                      boxShadow: "0 14px 40px -12px rgba(255,255,255,0.35)",
                    }}
                  >
                    <ShareIcon size={17} />
                    Share film
                  </button>
                  <button
                    onClick={watchAgain}
                    style={{
                      marginTop: 10,
                      width: "100%",
                      border: "1px solid rgba(255,255,255,0.2)",
                      cursor: "pointer",
                      padding: 15,
                      borderRadius: 100,
                      fontFamily: SANS,
                      fontWeight: 500,
                      fontSize: 14.5,
                      color: "#faf5ee",
                      background: "rgba(255,255,255,0.06)",
                    }}
                  >
                    Watch again
                  </button>
                  <button
                    onClick={restart}
                    style={{
                      marginTop: 4,
                      width: "100%",
                      border: "none",
                      cursor: "pointer",
                      padding: 12,
                      background: "transparent",
                      color: "rgba(255,255,255,0.45)",
                      fontFamily: SANS,
                      fontWeight: 500,
                      fontSize: 13,
                    }}
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}
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

function Pill({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 40,
        transform: "translateX(-50%)",
        zIndex: 6,
        padding: "12px 22px",
        borderRadius: 100,
        background: "rgba(24,18,30,0.72)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        color: "#faf5ee",
        fontFamily: SANS,
        fontWeight: 500,
        fontSize: 14,
        whiteSpace: "nowrap",
        boxShadow: "0 14px 34px -12px rgba(0,0,0,0.5)",
        animation: "rcFade 0.3s ease both",
      }}
    >
      {text}
    </div>
  );
}

// iOS-style share glyph: arrow rising out of a tray.
function ShareIcon({ size = 18 }: { size?: number }) {
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
      <path d="M12 3v12" />
      <path d="M8 6.5 12 3l4 3.5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
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
