// Discovery + on-demand boot of the shared Wan GPU fleet: EC2 instances
// tagged Fleet=wan (shared with the give-it-to-bonnie project). Workers are
// addressed by public IP through the token-auth proxy on :8443 — ComfyUI's
// own port stays closed to the internet. Each box stops itself after 15 idle
// minutes (on-box systemd timer), and /api/warm calls startFleet() to boot
// them back the moment a user enters the experience, so a session's clips
// land on freshly started boxes instead of a 24/7 bill.
import {
  EC2Client,
  DescribeInstancesCommand,
  StartInstancesCommand,
} from "@aws-sdk/client-ec2";

const REGION = process.env.FLEET_AWS_REGION || "us-east-1";
const PROXY_PORT = 8443;

let client: EC2Client | null = null;
function ec2(): EC2Client | null {
  const accessKeyId = process.env.FLEET_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.FLEET_AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null; // fleet not configured
  client ??= new EC2Client({ region: REGION, credentials: { accessKeyId, secretAccessKey } });
  return client;
}

type FleetInstance = { id: string; state: string; publicIp: string | undefined };

async function describeFleet(): Promise<FleetInstance[]> {
  const c = ec2();
  if (!c) return [];
  const res = await c.send(
    new DescribeInstancesCommand({ Filters: [{ Name: "tag:Fleet", Values: ["wan"] }] }),
  );
  return (res.Reservations ?? []).flatMap((r) =>
    (r.Instances ?? []).map((i) => ({
      id: i.InstanceId ?? "",
      state: i.State?.Name ?? "unknown",
      publicIp: i.PublicIpAddress,
    })),
  );
}

// Public IPs change on every stop/start, so worker URLs are resolved live
// (with a short cache) rather than pinned in COMFY_URL.
let workerCache: { at: number; urls: string[] } | null = null;

export async function listWorkers(): Promise<string[]> {
  if (workerCache && Date.now() - workerCache.at < 30_000) return workerCache.urls;
  try {
    const urls = (await describeFleet())
      .filter((i) => i.state === "running" && i.publicIp)
      .map((i) => `http://${i.publicIp}:${PROXY_PORT}`);
    workerCache = { at: Date.now(), urls };
    return urls;
  } catch (e) {
    console.error("[fleet] describe failed", e);
    return workerCache?.urls ?? [];
  }
}

export async function startFleet(): Promise<{ running: number; starting: number }> {
  const c = ec2();
  if (!c) return { running: 0, starting: 0 };
  const fleet = await describeFleet();
  const stopped = fleet.filter((i) => i.state === "stopped").map((i) => i.id);
  // Start one at a time: g6e capacity is not guaranteed, and a single
  // InsufficientInstanceCapacity must not mask boxes that CAN start (or the
  // running count of boxes already up).
  let starting = 0;
  for (const id of stopped) {
    try {
      await c.send(new StartInstancesCommand({ InstanceIds: [id] }));
      starting++;
      workerCache = null; // running set is about to change
      console.log("[fleet] starting", id);
    } catch (e) {
      console.error("[fleet] start failed", id, e);
    }
  }
  return {
    running: fleet.filter((i) => i.state === "running").length,
    starting: starting + fleet.filter((i) => i.state === "pending").length,
  };
}
