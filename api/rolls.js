// Public endpoint (no auth): community-recommended perk hashes for a weapon.
// GET /api/rolls?hash=12345 -> { found, rollCount, pve: [perkHash...], pvp: [...] }
import { loadWishlist } from "./_lib/grader.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let ALIASES = {};
try {
  ALIASES = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "_lib", "aliases.json"), "utf8")
  );
} catch { /* optional */ }

export default function handler(req, res) {
  const hash = String(req.query.hash || "");
  if (!/^\d+$/.test(hash)) return res.status(400).json({ error: "hash required" });

  const wl = loadWishlist();
  let entries = wl[hash];
  let viaReissue = false;
  if (!entries) {
    for (const sib of ALIASES[hash] || []) {
      if (wl[sib]) { entries = wl[sib]; viaReissue = true; break; }
    }
  }
  if (!entries) return res.json({ found: false, rollCount: 0, pve: [], pvp: [] });

  const pve = new Set(), pvp = new Set();
  for (const e of entries) {
    for (let i = 1; i < e.length; i++) {
      if (e[0] & 1) pve.add(e[i]);
      if (e[0] & 2) pvp.add(e[i]);
    }
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ found: true, viaReissue, rollCount: entries.length, pve: [...pve], pvp: [...pvp] });
}
