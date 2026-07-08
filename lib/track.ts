// Fire-and-forget usage tracking into the Jason Stacks portfolio Supabase.
// The portfolio tracks per-project views and generations and updates live
// via Realtime on its `projects` table. The anon key is a publishable key;
// both RPCs are executable by the anon role. Tracking must never block or
// break the experience — every failure is swallowed.
const SUPABASE_URL = "https://kvpkljeammzmzzraikzx.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cGtsamVhbW16bXp6cmFpa3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTc2NjIsImV4cCI6MjA5NzI5MzY2Mn0.XjQYqClk0_aVaBm7jKhj7tzVnJ4NOKCpWtrDN0xpMRE";
const PROJECT_ID = "9510d61d-aa51-46fa-b51a-c6847d6edfcb";

export function track(
  fn: "increment_project_views" | "increment_project_generations",
): void {
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ project_id: PROJECT_ID }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* tracking is best-effort */
  }
}
