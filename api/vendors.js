// Signed-in endpoint: this week's vendor weapon stock, graded.
// GET /api/vendors -> { vendors: [{ name, items: [{ itemHash, perks, grades }] }] }
import {
  readCookies, refreshTokens, tokenCookies, getPrimaryMembership, bungieGet,
} from "./_lib/bungie.js";
import { gradeRoll } from "./_lib/grader.js";

const VENDORS = [
  { hash: 672118013, name: "Banshee-44 · Gunsmith" },
  { hash: 2190858386, name: "Xûr" },
  { hash: 765357505, name: "Saint-14 · Trials" },
  { hash: 350061650, name: "Ada-1" },
];

export default async function handler(req, res) {
  const cookies = readCookies(req);
  let access = cookies.bng_access;
  const refresh = cookies.bng_refresh;
  if (!access && refresh) {
    try {
      const tokens = await refreshTokens(refresh);
      access = tokens.access_token;
      res.setHeader("Set-Cookie", tokenCookies(tokens));
    } catch {
      return res.status(401).json({ error: "session_expired" });
    }
  }
  if (!access) return res.status(401).json({ error: "not_signed_in" });

  try {
    const { membershipType, membershipId } = await getPrimaryMembership(access);
    const profile = await bungieGet(
      `/Destiny2/${membershipType}/Profile/${membershipId}/?components=200`,
      access
    );
    const charId = Object.keys(profile.characters?.data || {})[0];
    if (!charId) return res.status(500).json({ error: "no characters on account" });

    const vendors = [];
    for (const v of VENDORS) {
      try {
        const data = await bungieGet(
          `/Destiny2/${membershipType}/Profile/${membershipId}/Character/${charId}/Vendors/${v.hash}/?components=402,305`,
          access
        );
        const sales = data.sales?.data || {};
        const sockets = data.itemComponents?.sockets?.data || {};
        const items = [];
        for (const [idx, sale] of Object.entries(sales)) {
          const s = sockets[idx]?.sockets;
          if (!s) continue; // no sockets = not a weapon/armor sale
          const perks = s.filter((x) => x.plugHash).map((x) => x.plugHash);
          items.push({ itemHash: sale.itemHash, perks, grades: gradeRoll(sale.itemHash, perks) });
        }
        if (items.length) vendors.push({ name: v.name, items });
      } catch {
        // vendor not available this week (e.g. Xûr on weekdays) — skip quietly
      }
    }
    res.setHeader("Cache-Control", "private, max-age=900");
    res.json({ vendors });
  } catch (e) {
    console.error(e);
    if (e.status === 401) return res.status(401).json({ error: "session_expired" });
    res.status(500).json({ error: e.message });
  }
}
