// GET  /api/version — the app asks on every launch: {"ok":true,"version":"1.1.0","url":"...","notes":"what's new"}
//      (version null = nothing released yet). The automatic check carries ?id=<random install number>: it is
//      counted into today's set (Redis HyperLogLog, kept 40 days) — no IP, nothing else about the asker is stored.
// GET  /api/version?stats=1 — ONLY desk.py (x-desk-key): {"ok":true,"active":{"today":n,"7d":n,"30d":n}}
// POST /api/version — ONLY desk.py on your Mac (header x-desk-key = DESK_KEY): {"version":"1.1.0","url":"..."}
import { redis, ready } from "./_store.js";

const KEY = "enclyra:latest";
const DEFAULT_URL = "https://www.enclyralabs.com";
const VER = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const ID = /^[0-9a-f]{32}$/;
const dayKey = (n) => "enclyra:act:" + new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const deskOk = (req) => {
  const key = String(process.env.DESK_KEY || "").trim();
  return key && String(req.headers["x-desk-key"] || "").trim() === key;
};

export default async function handler(req, res) {
  if (!ready()) return res.status(503).json({ ok: false, error: "storage not connected" });

  if (req.method === "GET" && req.query?.stats) {
    if (!deskOk(req)) return res.status(401).json({ ok: false });
    res.setHeader("Cache-Control", "no-store");
    const keys = (n) => Array.from({ length: n }, (_, i) => dayKey(i));
    const [today, d7, d30] = await Promise.all([1, 7, 30].map((n) => redis(["PFCOUNT", ...keys(n)])));
    return res.status(200).json({ ok: true, active: { today, "7d": d7, "30d": d30 } });
  }

  if (req.method === "GET") {
    const id = String(req.query?.id || "");
    if (ID.test(id)) {
      try {
        await redis(["PFADD", dayKey(0), id]);
        await redis(["EXPIRE", dayKey(0), "3456000"]);
      } catch { /* counting never blocks the answer */ }
    }
    let rec = null;
    try { rec = JSON.parse((await redis(["GET", KEY])) || "null"); } catch { rec = null; }
    // the CDN answers repeat asks for 10 min, so launches don't eat the free storage quota
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({ ok: true, version: rec?.version || null, url: rec?.url || DEFAULT_URL,
                                  notes: rec?.notes || "" });
  }

  if (req.method === "POST") {
    if (!deskOk(req)) return res.status(401).json({ ok: false });
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false }); }
    }
    const version = String(body?.version || "").trim();
    const url = String(body?.url || DEFAULT_URL).trim();
    const notes = String(body?.notes || "").replace(/\s+/g, " ").trim().slice(0, 200);   // what's new, one line
    if (!VER.test(version) || !/^https:\/\/[^\s]{3,200}$/.test(url)) return res.status(400).json({ ok: false, error: "bad version or url" });
    await redis(["SET", KEY, JSON.stringify({ version, url, notes, ts: new Date().toISOString() })]);
    return res.status(200).json({ ok: true, version, url, notes });
  }

  return res.status(405).json({ ok: false });
}
