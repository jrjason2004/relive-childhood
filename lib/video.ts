// Per-session clip storage (in the OS temp dir) + ffmpeg stitching.

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { trackForSession } from "@/lib/music";

// The clips' own audio is muted; stitched films use background music only.
const BG_MUSIC_VOLUME = Number(process.env.BG_MUSIC_VOLUME ?? 1.0);
const HYBRID_MUSIC = path.join(process.cwd(), "public", "music", "childhood-1.mp3");
const HYBRID_SCENE_SECONDS = 2.0;

function safeId(sessionId: string): string {
  const clean = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!clean) throw new Error("Invalid session id");
  return clean;
}

export function sessionDir(sessionId: string): string {
  return path.join(os.tmpdir(), "relive-childhood", safeId(sessionId));
}

export function clipPath(sessionId: string, index: number): string {
  return path.join(sessionDir(sessionId), `clip-${index}.mp4`);
}

export function finalPath(sessionId: string): string {
  return path.join(sessionDir(sessionId), "final.mp4");
}

export function stillPath(sessionId: string, index: number): string {
  return path.join(sessionDir(sessionId), `still-${index}.jpg`);
}

export async function saveClip(sessionId: string, index: number, data: Buffer): Promise<void> {
  await fs.mkdir(sessionDir(sessionId), { recursive: true });
  await fs.writeFile(clipPath(sessionId, index), data);
}

export async function saveStill(sessionId: string, index: number, data: Buffer): Promise<void> {
  await fs.mkdir(sessionDir(sessionId), { recursive: true });
  await fs.writeFile(stillPath(sessionId, index), data);
}

// Compose a real archival photo into a full-screen 1080x1920 slide: the photo
// contain-scaled to fill as much of the frame as possible, with a blurred
// cover-crop of itself filling any letterbox (portrait photos end up truly
// full-bleed; landscape photos span the full width with blurred fill above
// and below). The output is a normal 9:16 still, so the slideshow and
// stitcher treat it like any other slide.
export async function composeRealSlide(
  sessionId: string,
  index: number,
  photo: Buffer,
): Promise<void> {
  const dir = sessionDir(sessionId);
  await fs.mkdir(dir, { recursive: true });
  const src = path.join(dir, `real-${index}-src`);
  await fs.writeFile(src, photo);

  await runFfmpeg([
    "-y",
    "-i", src,
    "-filter_complex",
    [
      "[0:v]split=2[bg][fg]",
      "[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2[b]",
      "[fg]scale=1080:1920:force_original_aspect_ratio=decrease[f]",
      "[b][f]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[out]",
    ].join(";"),
    "-map", "[out]",
    "-frames:v", "1",
    "-q:v", "2",
    stillPath(sessionId, index),
  ]);
  await fs.unlink(src).catch(() => {});
}

// Render the stills into a Ken Burns film: each still becomes a zoompan
// segment (direction alternates by position), segments are joined with 0.5s
// crossfades, and the session track plays underneath.
export async function stitchStills(sessionId: string, indices: number[]): Promise<string> {
  const out = finalPath(sessionId);
  const FADE = 0.5; // crossfade duration
  const FPS = 30;

  const music = await trackForSession(sessionId);
  const hasMusic = music !== null && (await fileExists(music));

  const SEG = 6.0;
  const frames = Math.round(SEG * FPS);

  const args: string[] = ["-y"];
  for (const i of indices) args.push("-i", stillPath(sessionId, i));
  if (hasMusic) args.push("-stream_loop", "-1", "-i", music!);

  // Upscale before zoompan for smooth sub-pixel motion.
  const kens = [
    `zoompan=z='1.03+0.13*on/${frames - 1}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'`, // zoom in
    `zoompan=z='1.16-0.13*on/${frames - 1}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'`, // zoom out
    `zoompan=z='1.12':x='(iw-iw/zoom)*on/${frames - 1}':y='(ih-ih/zoom)/2'`, // pan right
    `zoompan=z='1.12':x='(iw-iw/zoom)*(1-on/${frames - 1})':y='(ih-ih/zoom)/2'`, // pan left
  ];

  const parts: string[] = [];
  indices.forEach((_, k) => {
    // 1.5x intermediate upscale: enough headroom for smooth sub-pixel motion
    // without the encode cost of a full 4K zoompan.
    parts.push(
      `[${k}:v]scale=1620:2880:force_original_aspect_ratio=increase,crop=1620:2880,` +
        `${kens[k % kens.length]}:d=${frames}:s=1080x1920:fps=${FPS},format=yuv420p,setsar=1[v${k}]`,
    );
  });

  let vout = "[v0]";
  for (let k = 1; k < indices.length; k++) {
    const offset = (SEG - FADE) * k;
    const label = k === indices.length - 1 ? "[vout]" : `[x${k}]`;
    parts.push(`${vout}[v${k}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}${label}`);
    vout = label;
  }
  if (indices.length === 1) {
    parts.push(`[v0]copy[vout]`);
    vout = "[vout]";
  }

  const musicIn = indices.length;
  if (hasMusic) {
    parts.push(`[${musicIn}:a]volume=${BG_MUSIC_VOLUME}[aout]`);
  }

  if (hasMusic) {
    args.push(
      "-filter_complex", parts.join(";"),
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac",
      "-shortest", "-movflags", "+faststart",
      out,
    );
  } else {
    args.push(
      "-filter_complex", parts.join(";"),
      "-map", "[vout]", "-an",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      out,
    );
  }

  await runFfmpeg(args);
  return out;
}

// Render the shareable film: each scene's Wan clip runs for its 2s segment
// and scenes join with HARD CUTS (no crossfade — deliberate, TikTok-style),
// with the POV line burned in on top. Seven scenes render to exactly 14
// seconds. (A Ken Burns pass over the still remains as a per-scene fallback
// for the legacy path, but video-only sessions never hit it.)
export async function stitchHybrid(
  sessionId: string,
  indices: number[],
  povPng: Buffer | null,
): Promise<string> {
  const out = finalPath(sessionId);
  const FPS = 30;

  const n = indices.length;
  const totalSeconds = n * HYBRID_SCENE_SECONDS;
  const SEG = HYBRID_SCENE_SECONDS;
  const frames = Math.round(SEG * FPS);

  const kens = [
    `zoompan=z='1.03+0.13*on/${frames - 1}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'`,
    `zoompan=z='1.16-0.13*on/${frames - 1}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'`,
    `zoompan=z='1.12':x='(iw-iw/zoom)*on/${frames - 1}':y='(ih-ih/zoom)/2'`,
    `zoompan=z='1.12':x='(iw-iw/zoom)*(1-on/${frames - 1})':y='(ih-ih/zoom)/2'`,
  ];

  const args: string[] = ["-y"];
  const parts: string[] = [];
  let inputIdx = 0;
  for (let k = 0; k < n; k++) {
    const clip = clipPath(sessionId, indices[k]);
    if (await fileExists(clip)) {
      // Loop the ~2s clip to fill its segment, cover-crop to 720x1280 —
      // 1.5x the 480x864 source keeps it crisp on phones without ballooning
      // the file the way a 1080p upscale of diffusion footage does.
      args.push("-stream_loop", "-1", "-i", clip);
      parts.push(
        `[${inputIdx}:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,` +
          `fps=${FPS},trim=duration=${SEG.toFixed(2)},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[v${k}]`,
      );
    } else {
      args.push("-i", stillPath(sessionId, indices[k]));
      parts.push(
        `[${inputIdx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
          `${kens[k % kens.length]}:d=${frames}:s=720x1280:fps=${FPS},format=yuv420p,setsar=1[v${k}]`,
      );
    }
    inputIdx++;
  }

  let vout = "[v0]";
  if (n > 1) {
    const labels = Array.from({ length: n }, (_, k) => `[v${k}]`).join("");
    parts.push(`${labels}concat=n=${n}:v=1:a=0[xout]`);
    vout = "[xout]";
  }

  // TikTok-style POV line, burned in near the top. The client renders it to
  // a transparent 1080-wide PNG (this ffmpeg build has no drawtext filter,
  // and canvas text matches the live overlay exactly).
  let povPath: string | null = null;
  if (povPng && povPng.length > 0) {
    povPath = path.join(sessionDir(sessionId), "pov.png");
    await fs.writeFile(povPath, povPng);
    args.push("-loop", "1", "-i", povPath);
    // The client renders the PNG at 1080 wide; scale it to the 720 canvas.
    parts.push(
      `[${inputIdx}:v]scale=720:-1[pov]`,
      `${vout}[pov]overlay=(W-w)/2:H*0.11:format=auto[vtxt]`,
    );
    vout = "[vtxt]";
    inputIdx++;
  }

  if (!(await fileExists(HYBRID_MUSIC))) {
    throw new Error("Missing public/music/childhood-1.mp3");
  }
  args.push("-t", totalSeconds.toFixed(2), "-i", HYBRID_MUSIC);
  parts.push(
    `[${inputIdx}:a]atrim=0:${totalSeconds.toFixed(2)},asetpts=PTS-STARTPTS,volume=${BG_MUSIC_VOLUME}[aout]`,
  );

  args.push("-filter_complex", parts.join(";"), "-map", vout, "-map", "[aout]", "-c:a", "aac");
  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-shortest", "-movflags", "+faststart",
    out,
  );

  await runFfmpeg(args);
  return out;
}

// Concatenate the given clip indices (in order) into one MP4 and mix the
// background music under the clips' own ambient audio. Re-encodes so the joins
// are clean even if individual clips differ slightly.
export async function stitchClips(sessionId: string, indices: number[]): Promise<string> {
  const dir = sessionDir(sessionId);
  const out = finalPath(sessionId);

  const listFile = path.join(dir, "concat.txt");
  const listBody = indices.map((i) => `file '${clipPath(sessionId, i)}'`).join("\n");
  await fs.writeFile(listFile, listBody);

  const music = await trackForSession(sessionId);
  const hasMusic = music !== null && (await fileExists(music));

  if (!hasMusic) {
    // No music available — render the concatenated clips with no audio at all.
    await runFfmpeg([
      "-y",
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-an",
      "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      out,
    ]);
    return out;
  }

  // Input 0: concatenated clips (video only — clip audio is dropped).
  // Input 1: looping background music, trimmed to the video length.
  await runFfmpeg([
    "-y",
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-stream_loop", "-1", "-i", music!,
    "-filter_complex", `[1:a]volume=${BG_MUSIC_VOLUME}[aout]`,
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-shortest", "-movflags", "+faststart",
    out,
  ]);
  return out;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Prefer the bundled static binary (present on Vercel, where there is no
// system ffmpeg); fall back to a PATH ffmpeg locally if the package is absent.
const FFMPEG_BIN: string = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require("ffmpeg-static") as string) || "ffmpeg";
  } catch {
    return "ffmpeg";
  }
})();

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}
