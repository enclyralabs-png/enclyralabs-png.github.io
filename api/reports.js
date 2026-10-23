// GET /api/reports?start=0 — ONLY for desk.py on your Mac. Needs the header x-desk-key = DESK_KEY
// (a long random secret you set in Vercel -> Settings -> Environment Variables). Without it: 401.
import { redis, ready, LIST } from "./_store.js";

const PAGE = 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  const key = process.env.DESK_KEY;
  if (!key || req.headers["x-desk-key"] !== key) return res.status(401).json({ ok: false });
  if (!ready()) return res.status(503).json({ ok: false, error: "storage not connected" });

  const start = Math.max(0, parseInt(req.query.start || "0", 10) || 0);
  const rows = await redis(["LRANGE", LIST, String(start), String(start + PAGE - 1)]);
  const total = await redis(["LLEN", LIST]);
  return res.status(200).json({ ok: true, total, start, rows: rows.map((x) => JSON.parse(x)) });
}
