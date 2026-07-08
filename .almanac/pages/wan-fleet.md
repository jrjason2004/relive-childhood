---
topics:
  - stack
  - video-gen
sources:
  - id: wan
    type: file
    path: lib/wan.ts
    note: Migrated from legacy files.
  - id: wan-tunnels
    type: file
    path: scripts/wan-tunnels.sh
    note: Migrated from legacy files.

---

# Wan fleet

Video generation runs on a self-hosted fleet of 3× AWS `g6e.2xlarge` (NVIDIA L40S, 48GB — not H100s) running ComfyUI on `:8188`, serving Wan 2.2 I2V A14B (MoE) with 4-step Lightning LoRAs and RIFE ×2 interpolation. [[lib/wan.ts]] holds the workflow: FP8 UNETLoaders, LoRA names discovered by `high_lightning`/`low_lightning` substrings, `WAN_LENGTH=33` output frames from `WAN_GEN_LENGTH=17` diffused, 16fps → ~2.06s clips. `WAN_WIDTH=480`/`WAN_HEIGHT=864` was a deliberate quality bump from the 320×576 defaults; a clip takes ~13s at this size.

**The fleet is shared with the `give-it-to-bonnie` project** (`~/give-it-to-bonnie`, client in `production/video_gen.py`, endpoints via `BONNIE_WAN_ENDPOINTS` on Render). Identical model filenames keep weights resident for both projects. Do not change anything on the boxes without coordinating; the permission classifier blocks remote writes (systemctl/reboot/rm via SSM) — ask Jason to run those.

Two ways to reach the workers:

- **Local:** SSM port-forward tunnels via [[scripts/wan-tunnels.sh]] — `localhost:9010` → `i-08888f50b23144cdf`, `9011` → `i-0634014e5e11df029`, `9013` → `i-01aa32f4dde99d1fa`. Tunnels die on Mac logout/reboot; rerun the script. `.env.local` sets `COMFY_URL` to the comma-separated localhost list.
- **Vercel:** the security group opens `:8188` to `0.0.0.0/0`, so production `COMFY_URL` points at the workers' public IPs directly. Those IPs are ephemeral (no Elastic IPs) — a stop/start changes them and Vercel's `COMFY_URL` env must be updated.

`lib/wan.ts` routes least-busy by ComfyUI `queue_remaining` with round-robin tie-break and failover, mirroring Bonnie's client conventions.

A fourth box, `i-059db1ff762123998`, is intentionally parked: disk 100% full (needs Serial Console cleanup) and only has GGUF weights, not FP8. `i-01aa32f4dde99d1fa` once dropped with SSM `TargetNotConnected`; the fix was reattaching the IAM instance profile, not a reboot.
