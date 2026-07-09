import {
  readCookies,
  refreshTokens,
  tokenCookies,
  getPrimaryMembership,
  getProfile,
} from "./_lib/bungie.js";
import { gradeRoll } from "./_lib/grader.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Reissue aliases: same weapon name, different item hash across seasons.
let ALIASES = {};
try {
  ALIASES = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "_lib", "aliases.json"), "utf8")
  );
} catch { /* file optional — grading still works without reissue fallback */ }

function gradeWithAliases(itemHash, perks) {
  let g = gradeRoll(itemHash, perks);
  if (g.all.rollsConsidered > 0) return g;
  // Exact hash unrated: try other versions of the same weapon.
  for (const sib of ALIASES[String(itemHash)] || []) {
    const g2 = gradeRoll(sib, perks);
    if (
      g2.all.rollsConsidered > 0 &&
      (g.all.rollsConsidered === 0 || g2.all.ratio > g.all.ratio)
    ) {
      g = { ...g2, viaReissue: true };
    }
  }
  return g;
}

export default async function handler(req, res) {
  const cookies = readCookies(req);
  let access = cookies.bng_access;
  const refresh = cookies.bng_refresh;

  // Access token expired but refresh token alive? Refresh silently.
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
    const profile = await getProfile(access, membershipType, membershipId);

    // Gather every instanced item: vault + each character's inventory + equipped.
    const items = [];
    const push = (list) => {
      for (const it of list || []) if (it.itemInstanceId) items.push(it);
    };
    push(profile.profileInventory?.data?.items);
    for (const inv of Object.values(profile.characterInventories?.data || {})) push(inv.items);
    for (const eq of Object.values(profile.characterEquipment?.data || {})) push(eq.items);

    const socketData = profile.itemComponents?.sockets?.data || {};

    const graded = [];
    for (const it of items) {
      const sockets = socketData[it.itemInstanceId]?.sockets;
      if (!sockets) continue; // no sockets = not a weapon/armor, skip
      const perks = sockets.filter((s) => s.plugHash).map((s) => s.plugHash);
      graded.push({
        itemHash: it.itemHash,
        instanceId: it.itemInstanceId,
        perks,
        grades: gradeWithAliases(it.itemHash, perks), // { all, pve, pvp, viaReissue? }
      });
    }

    res.json({ count: graded.length, items: graded });
  } catch (e) {
    console.error(e);
    if (e.status === 401) return res.status(401).json({ error: "session_expired" });
    res.status(500).json({ error: e.message });
  }
}
