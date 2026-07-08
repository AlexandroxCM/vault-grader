// Grading engine with PvE/PvP mode support.
// wishlist.json format: { itemHash: [[tagBits, perk1, perk2, ...], ...] }
// tagBits: 1 = PvE, 2 = PvP, 3 = both/untagged.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let WISHLIST = null;

export function loadWishlist() {
  if (!WISHLIST) {
    WISHLIST = JSON.parse(readFileSync(join(here, "wishlist.json"), "utf8"));
  }
  return WISHLIST;
}

const MODE_BIT = { all: 3, pve: 1, pvp: 2 };

function gradeMode(entries, owned, bit) {
  let best = 0;
  let bestRoll = null;
  let considered = 0;
  for (const entry of entries) {
    if (!(entry[0] & bit)) continue;
    considered++;
    let hit = 0;
    for (let i = 1; i < entry.length; i++) if (owned.has(entry[i])) hit++;
    const ratio = hit / (entry.length - 1);
    if (ratio > best || bestRoll === null) {
      best = ratio;
      bestRoll = entry.slice(1);
    }
  }
  if (considered === 0) return { tier: "?", ratio: 0, rollsConsidered: 0, bestRoll: [] };

  let tier;
  if (best === 1) tier = "S";
  else if (best >= 0.75) tier = "A";
  else if (best >= 0.5) tier = "B";
  else if (best >= 0.25) tier = "C";
  else tier = "D";

  return { tier, ratio: Math.round(best * 100) / 100, rollsConsidered: considered, bestRoll };
}

// Returns grades for all three modes at once.
export function gradeRoll(itemHash, ownedPerkHashes) {
  const entries = loadWishlist()[String(itemHash)];
  const owned = new Set(ownedPerkHashes);
  if (!entries || entries.length === 0) {
    const empty = { tier: "?", ratio: 0, rollsConsidered: 0, bestRoll: [] };
    return { all: empty, pve: empty, pvp: empty };
  }
  return {
    all: gradeMode(entries, owned, MODE_BIT.all),
    pve: gradeMode(entries, owned, MODE_BIT.pve),
    pvp: gradeMode(entries, owned, MODE_BIT.pvp),
  };
}
