// GET  /api/version — the app asks on every launch: {"ok":true,"version":"1.1.0","url":"https://www.enclyralabs.com"}
//      (version null = nothing released yet). Nothing about the asker is read or stored.
// POST /api/version — ONLY desk.py on your Mac (header x-desk-key = DESK_KEY): {"version":"1.1.0","url":"..."}
import { redis, ready } from "./_store.js";

const KEY = "enclyra:latest";
const DEFAULT_URL = "https://www.enclyralabs.com";
const VER = /^\d{1,4}(\.\d{1,4}){0,3}$/;

export default async function handler(req, res) {
  if (!ready()) return res.status(503).json({ ok: false, error: "storage not connected" });

  if (req.method === "GET") {
    let rec = null;
    try { rec = JSON.parse((await redis(["GET", KEY])) || "null"); } catch { rec = null; }
    // the CDN answers repeat asks for 10 min, so launches don't eat the free storage quota
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({ ok: true, version: rec?.version || null, url: rec?.url || DEFAULT_URL });
  }

  if (req.method === "POST") {
    const key = String(process.env.DESK_KEY || "").trim();
    if (!key || String(req.headers["x-desk-key"] || "").trim() !== key) return res.status(401).json({ ok: false });
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false }); }
    }
    const version = String(body?.version || "").trim();
    const url = String(body?.url || DEFAULT_URL).trim();
    if (!VER.test(version) || !/^https:\/\/[^\s]{3,200}$/.test(url)) return res.status(400).json({ ok: false, error: "bad version or url" });
    await redis(["SET", KEY, JSON.stringify({ version, url, ts: new Date().toISOString() })]);
    return res.status(200).json({ ok: true, version, url });
  }

  return res.status(405).json({ ok: false });
}
