// Image-to-video via the self-hosted Wan 2.2 I2V A14B (MoE) warm workers —
// ComfyUI on L40S boxes (fp8 experts + 4-step Lightning LoRA resident in VRAM,
// no per-clip reload), each reached through its own SSM tunnel. COMFY_URL is a
// comma-separated list of worker URLs. The fleet is shared with the
// give-it-to-bonnie project, so clip routing follows Bonnie's video_gen.py
// conventions: pick the least-busy worker by queue_remaining (round-robin
// tie-break), skip workers that fail the initial upload, and resolve the
// Lightning LoRA filenames from each box's /object_info by the
// high_lightning / low_lightning substrings rather than hardcoding them.
// Same signature as the old lib/ltx.ts: (still + prompt) → mp4 Buffer.

import { listWorkers, startFleet } from "./fleet";

// Worker resolution: an explicit COMFY_URL (comma-separated, e.g. local SSM
// tunnels) always wins; otherwise workers are discovered live from EC2 by
// the Fleet=wan tag (public IP + token proxy) so on-demand boots and IP
// churn need no env changes.
async function getWorkers(): Promise<string[]> {
  const fixed = (process.env.COMFY_URL || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (fixed.length > 0) return fixed;
  const fleet = await listWorkers();
  return fleet.length > 0 ? fleet : ["http://localhost:8188"];
}

// Every request goes through the boxes' token-auth proxy when WAN_TOKEN is
// set (prod); locally through the tunnels the header is just ignored.
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.WAN_TOKEN;
  return token ? { ...extra, "X-Wan-Token": token } : extra;
}

let nextWorker = 0;

async function queueDepth(url: string): Promise<number> {
  try {
    const r = await fetch(`${url}/prompt`, {
      cache: "no-store",
      headers: authHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return Infinity;
    return (await r.json())?.exec_info?.queue_remaining ?? Infinity;
  } catch {
    return Infinity;
  }
}

// Workers ordered emptiest-first; unreachable ones sort last (still attempted
// as a final fallback). Ties rotate round-robin so parallel clips spread out.
async function workersByLoad(): Promise<string[]> {
  const WORKERS = await getWorkers();
  const depths = await Promise.all(WORKERS.map(queueDepth));
  const start = nextWorker++;
  return WORKERS.map((url, i) => ({
    url,
    depth: depths[i],
    order: (i - start + 2 * WORKERS.length) % WORKERS.length,
  }))
    .sort((a, b) => a.depth - b.depth || a.order - b.order)
    .map((w) => w.url);
}

const loraCache = new Map<string, { high: string; low: string }>();

async function discoverLoras(url: string): Promise<{ high: string; low: string }> {
  const cached = loraCache.get(url);
  if (cached) return cached;
  let high = "wan22_i2v_high_lightning.safetensors";
  let low = "wan22_i2v_low_lightning.safetensors";
  try {
    const r = await fetch(`${url}/object_info/LoraLoaderModelOnly`, {
      cache: "no-store",
      headers: authHeaders(),
    });
    const names: string[] =
      (await r.json())?.LoraLoaderModelOnly?.input?.required?.lora_name?.[0] ?? [];
    high = names.find((n) => n.includes("high_lightning")) ?? high;
    low = names.find((n) => n.includes("low_lightning")) ?? low;
    loraCache.set(url, { high, low });
  } catch {
    // fall back to the defaults without caching, so we retry discovery later
  }
  return { high, low };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wan's temporal VAE compresses by 4, so a generated length must be 4*K + 1.
// We diffuse GEN_LENGTH frames then RIFE-interpolate ×INTERP up to OUT_LENGTH —
// generating fewer frames roughly halves sample+decode (the dominant cost), and
// RIFE fills the in-betweens far cheaper than diffusion. 41→×2→81 ≈ 5s @ 16fps.
const OUT_LENGTH = Number(process.env.WAN_LENGTH ?? 81); // final frame count
const GEN_LENGTH = Number(process.env.WAN_GEN_LENGTH ?? 41); // frames actually diffused
const INTERP = Math.max(1, Math.round((OUT_LENGTH - 1) / (GEN_LENGTH - 1))); // RIFE multiplier
const FPS = Number(process.env.WAN_FPS ?? 16);
const WIDTH = Number(process.env.WAN_WIDTH ?? 320); // 9:16 vertical, /16; soft "memory" look
const HEIGHT = Number(process.env.WAN_HEIGHT ?? 576);
const STEPS = Number(process.env.WAN_STEPS ?? 4); // 4-step Lightning
const BOUNDARY = Number(process.env.WAN_BOUNDARY ?? 2); // high→low expert switch

const NEG =
  "blurry, distorted, watermark, text, low quality, jpeg artifacts, deformed, static, oversaturated, music, singing";

// ComfyUI API-format graph. Node ids are arbitrary strings; links are [id, slot].
function buildWorkflow(opts: {
  prompt: string;
  imageName: string;
  seed: number;
  loras: { high: string; low: string };
}): Record<string, any> {
  const { prompt, imageName, seed, loras } = opts;
  return {
    // H100 (80GB): fp8 scaled UNets via UNETLoader — faster + higher quality than the
    // L40S-era Q6_K GGUF, and uses the H100's native FP8 cores. Same models Bonnie uses.
    "10": { class_type: "UNETLoader", inputs: { unet_name: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", weight_dtype: "fp8_e4m3fn" } },
    "11": { class_type: "UNETLoader", inputs: { unet_name: "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", weight_dtype: "fp8_e4m3fn" } },
    "12": {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["10", 0], lora_name: loras.high, strength_model: 1.0 },
    },
    "13": {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["11", 0], lora_name: loras.low, strength_model: 1.0 },
    },
    "20": {
      class_type: "CLIPLoader",
      inputs: { clip_name: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", type: "wan" },
    },
    "21": { class_type: "CLIPTextEncode", inputs: { clip: ["20", 0], text: prompt } },
    "22": { class_type: "CLIPTextEncode", inputs: { clip: ["20", 0], text: NEG } },
    "30": { class_type: "VAELoader", inputs: { vae_name: "wan_2.1_vae.safetensors" } },
    "31": { class_type: "LoadImage", inputs: { image: imageName } },
    "40": {
      class_type: "WanImageToVideo",
      inputs: {
        positive: ["21", 0],
        negative: ["22", 0],
        vae: ["30", 0],
        start_image: ["31", 0],
        width: WIDTH,
        height: HEIGHT,
        length: GEN_LENGTH,
        batch_size: 1,
      },
    },
    // High-noise expert: steps 0..BOUNDARY, keeps leftover noise for the low pass.
    "50": {
      class_type: "KSamplerAdvanced",
      inputs: {
        model: ["12", 0],
        add_noise: "enable",
        noise_seed: seed,
        steps: STEPS,
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "simple",
        positive: ["40", 0],
        negative: ["40", 1],
        latent_image: ["40", 2],
        start_at_step: 0,
        end_at_step: BOUNDARY,
        return_with_leftover_noise: "enable",
      },
    },
    // Low-noise expert: steps BOUNDARY..end, finishes the denoise.
    "51": {
      class_type: "KSamplerAdvanced",
      inputs: {
        model: ["13", 0],
        add_noise: "disable",
        noise_seed: seed,
        steps: STEPS,
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "simple",
        positive: ["40", 0],
        negative: ["40", 1],
        latent_image: ["50", 0],
        start_at_step: BOUNDARY,
        end_at_step: 10000,
        return_with_leftover_noise: "disable",
      },
    },
    "60": { class_type: "VAEDecode", inputs: { samples: ["51", 0], vae: ["30", 0] } },
    // RIFE interpolation: GEN_LENGTH → OUT_LENGTH (cheap vs. diffusing the extra frames).
    "65": {
      class_type: "RIFE VFI",
      inputs: {
        frames: ["60", 0],
        ckpt_name: "rife49.pth",
        clear_cache_after_n_frames: 10,
        multiplier: INTERP,
        fast_mode: true,
        ensemble: false,
        scale_factor: 1.0,
        dtype: "float16",
        torch_compile: false,
        batch_size: 4,
      },
    },
    "70": {
      class_type: "VHS_VideoCombine",
      inputs: {
        images: ["65", 0],
        frame_rate: FPS,
        loop_count: 0,
        filename_prefix: "wan_relive",
        format: "video/h264-mp4",
        pingpong: false,
        save_output: true,
      },
    },
  };
}

export async function generateVideoClip(
  image: { mimeType: string; data: string },
  videoPrompt: string,
): Promise<Buffer> {
  const fullPrompt = `${videoPrompt}

Maintain the low young-child first-person POV, consistent with the starting frame. Subtle, realistic motion — a gentle walk-forward or look-around through the scene with other young children moving naturally. No scene cuts.`;

  // 1. Upload the start frame to the least-busy worker's input dir, with
  //    failover: an unreachable worker (dead tunnel, box down) is skipped.
  // Cold fleet: boot-on-entry may still be bringing the boxes up (instance
  // start + ComfyUI ≈ 2-4 min). Kick the fleet and wait for a reachable
  // worker before giving up, instead of failing the whole scene.
  const bootDeadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < bootDeadline) {
    const ws = await getWorkers();
    const depths = await Promise.all(ws.map(queueDepth));
    if (depths.some((d) => Number.isFinite(d))) break;
    await startFleet().catch(() => {});
    await sleep(10_000);
  }

  const ext = image.mimeType.includes("jpeg") ? "jpg" : "png";
  const filename = `relive_start_${Date.now()}_${Math.floor(seedFrom(image.data))}.${ext}`;
  let COMFY = "";
  let upRes: Response | null = null;
  let lastErr: unknown = null;
  for (const candidate of await workersByLoad()) {
    COMFY = candidate;
    const up = new FormData();
    up.set("image", new Blob([Buffer.from(image.data, "base64")], { type: image.mimeType }), filename);
    up.set("overwrite", "true");
    try {
      upRes = await fetch(`${COMFY}/upload/image`, {
        method: "POST",
        headers: authHeaders(),
        body: up,
      });
      break;
    } catch (e) {
      lastErr = e;
      upRes = null;
    }
  }
  if (!upRes) throw new Error(`All Wan workers unreachable: ${lastErr}`);
  if (!upRes.ok) throw new Error(`Comfy upload ${upRes.status}: ${await upRes.text()}`);
  const uploaded = await upRes.json();
  const imageName = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;

  // 2. Queue the prompt.
  const seed = Math.floor(seedFrom(image.data + videoPrompt)) % 2_147_483_647;
  const loras = await discoverLoras(COMFY);
  const workflow = buildWorkflow({ prompt: fullPrompt, imageName, seed, loras });
  const queue = await fetch(`${COMFY}/prompt`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!queue.ok) throw new Error(`Comfy queue ${queue.status}: ${await queue.text()}`);
  const promptId: string = (await queue.json()).prompt_id;
  if (!promptId) throw new Error("Comfy returned no prompt_id");

  // 3. Poll history until the job produces a video (warm worker still loads on
  //    the very first job after a (re)start, so allow generous headroom).
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const hRes = await fetch(`${COMFY}/history/${promptId}`, {
      cache: "no-store",
      headers: authHeaders(),
    });
    if (!hRes.ok) continue;
    const hist = await hRes.json();
    const entry = hist[promptId];
    if (!entry) continue;
    const status = entry.status?.status_str;
    if (status === "error") throw new Error(`Comfy job error: ${JSON.stringify(entry.status)}`);
    const out = findVideoOutput(entry.outputs);
    if (out) {
      const q = new URLSearchParams({ filename: out.filename, subfolder: out.subfolder || "", type: out.type || "output" });
      const dl = await fetch(`${COMFY}/view?${q}`, { cache: "no-store", headers: authHeaders() });
      if (!dl.ok) throw new Error(`Comfy view ${dl.status}`);
      return Buffer.from(await dl.arrayBuffer());
    }
  }
  throw new Error(`Comfy job ${promptId} timed out`);
}

function findVideoOutput(outputs: any): { filename: string; subfolder: string; type: string } | null {
  if (!outputs) return null;
  for (const nodeId of Object.keys(outputs)) {
    const node = outputs[nodeId];
    // VHS_VideoCombine reports under "gifs" even for mp4.
    const arr = node.gifs || node.videos || node.images;
    if (Array.isArray(arr)) {
      const vid = arr.find((a: any) => /\.(mp4|webm)$/i.test(a.filename));
      if (vid) return vid;
    }
  }
  return null;
}

// Tiny deterministic hash → stable per-clip seed/filename without Math.random.
function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 97) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
