// POST /api/report — the app sends ONE report here, only after the user pressed Send.
// It keeps only the fields below, cut to size. No IP is stored: the rate limit uses a hash of it that expires in 2 min.
import { createHash, randomUUID } from "crypto";
import { redis, ready, LIST } from "./_store.js";

const MAX_BYTES = 14000;         // a whole report; anything bigger is refused
const PER_MINUTE = 10;           // reports per sender per minute
const KEEP = 100000;             // newest reports kept — back them up to the SSD (desk.py) before 100k

const s = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!ready()) return res.status(503).json({ ok: false, error: "storage not connected" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false }); }
  }
  if (!body || typeof body !== "object") return res.status(400).json({ ok: false });
  if (JSON.stringify(body).length > MAX_BYTES) return res.status(413).json({ ok: false });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  const who = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  const rl = `rl:${who}:${Math.floor(Date.now() / 60000)}`;
  const n = await redis(["INCR", rl]);
  if (n === 1) await redis(["EXPIRE", rl, "120"]);
  if (n > PER_MINUTE) return res.status(429).json({ ok: false });

  const rec = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    kind: body.kind === "complaint" ? "complaint" : "failure",
    app_version: s(body.app_version, 40),
    os: s(body.os, 80),
    action: s(body.action, 60),
    reason: s(body.reason, 2000),
    steps: Array.isArray(body.steps) ? body.steps.slice(0, 20).map((x) => s(x, 60)) : [],
    prompt: s(body.prompt, 600),     // what the user asked, names already hidden by the app
    log: s(body.log, 6000),          // that prompt's log lines, names already hidden by the app
    user_text: s(body.user_text, 1000),
  };
  if (!rec.reason && !rec.user_text) return res.status(400).json({ ok: false });

  await redis(["LPUSH", LIST, JSON.stringify(rec)]);
  await redis(["LTRIM", LIST, "0", String(KEEP - 1)]);
  return res.status(200).json({ ok: true, id: rec.id });
}
