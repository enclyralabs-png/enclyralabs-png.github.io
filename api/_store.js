// The one place that talks to storage (Upstash Redis, free tier, connected in Vercel -> Storage).
// Vercel puts the keys in the env when you connect it; nothing secret lives in this file.
// Files starting with "_" inside api/ are not web routes.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const LIST = "enclyra:reports";
export const ready = () => Boolean(URL_ && TOKEN);

export async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`store ${r.status}`);
  return (await r.json()).result;
}
