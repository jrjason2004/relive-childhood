// Image-to-video via the self-hosted LTX-2.3 Pro fleet (4× L40S on AWS),
// reached through the local dispatcher at http://localhost:8000. Same shape as
// gemini.ts's generateVideoClip: (still + prompt) → finished mp4 Buffer.

const DISPATCH = process.env.LTX_DISPATCH_URL || "http://localhost:8000";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// LTX requires num_frames === 8*K + 1. 4s @ 24fps → 97.
function frameCount(durSeconds: number, fps: number): number {
  const n = Math.max(9, Math.round(durSeconds * fps));
  return 8 * Math.round((n - 1) / 8) + 1;
}

export async function generateVideoClip(
  image: { mimeType: string; data: string },
  videoPrompt: string,
): Promise<Buffer> {
  const fps = 24;
  // 9:16 vertical to match the Nano Banana stills (Veo path was 720p 9:16).
  const width = Number(process.env.LTX_WIDTH ?? 704);
  const height = Number(process.env.LTX_HEIGHT ?? 1280);
  const durSeconds = Number(process.env.LTX_DURATION_S ?? 4);

  const fullVideoPrompt = `${videoPrompt}

Maintain the low young-child first-person POV, consistent with the starting frame. Subtle, realistic motion — a gentle walk-forward or look-around through the scene with other young children moving naturally. No scene cuts.`;

  const form = new FormData();
  form.set("prompt", fullVideoPrompt);
  form.set("negative_prompt", "blurry, distorted, watermark, text, music, singing");
  form.set("width", String(width));
  form.set("height", String(height));
  form.set("num_frames", String(frameCount(durSeconds, fps)));
  form.set("frame_rate", String(fps));
  form.set("steps", String(process.env.LTX_STEPS ?? 30));
  form.set("cfg", String(process.env.LTX_CFG ?? 2.5));
  form.set("stg", String(process.env.LTX_STG ?? 1.0));
  form.set("seed", String(process.env.LTX_SEED ?? 0));
  form.set("start_strength", "1.0");
  form.set("end_strength", "1.0");

  const startBlob = new Blob([Buffer.from(image.data, "base64")], { type: image.mimeType });
  form.set("start_image", startBlob, "start.png");

  const submit = await fetch(`${DISPATCH}/generate`, { method: "POST", body: form, cache: "no-store" });
  if (!submit.ok) throw new Error(`LTX submit ${submit.status}: ${await submit.text()}`);
  const jobId: string | undefined = (await submit.json())?.job_id;
  if (!jobId) throw new Error("LTX returned no job_id");

  // Cold-loads the 22B model per clip (~6–12 min). Poll up to ~45 min.
  const deadline = Date.now() + 45 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(10000);
    const pr = await fetch(`${DISPATCH}/jobs/${jobId}`, { cache: "no-store" });
    if (!pr.ok) throw new Error(`LTX poll ${pr.status}: ${await pr.text()}`);
    const pj = await pr.json();
    if (pj.status === "done") {
      const dl = await fetch(`${DISPATCH}/jobs/${jobId}/video`, { cache: "no-store" });
      if (!dl.ok) throw new Error(`LTX download ${dl.status}`);
      return Buffer.from(await dl.arrayBuffer());
    }
    if (pj.status === "error" || pj.status === "cancelled") {
      throw new Error(`LTX job ${jobId} ${pj.status}: ${pj.error ?? ""}`);
    }
  }
  throw new Error(`LTX job ${jobId} timed out`);
}
