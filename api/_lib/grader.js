// Grading engine — JS port of the tested Python grader.
// Loads the preprocessed community wishlist once per lambda instance.
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

export function gradeRoll(itemHash, ownedPerkHashes) {
  const wl = loadWishlist();
  const recommended = wl[String(itemHash)];
  const owned = new Set(ownedPerkHashes);

  if (!recommended || recommended.length === 0) {
    return { tier: "?", ratio: 0, rollsConsidered: 0 };
  }

  let best = 0;
  for (const roll of recommended) {
    let hit = 0;
    for (const p of roll) if (owned.has(p)) hit++;
    const ratio = hit / roll.length;
    if (ratio > best) best = ratio;
    if (best === 1) break;
  }

  let tier;
  if (best === 1) tier = "S";
  else if (best >= 0.75) tier = "A";
  else if (best >= 0.5) tier = "B";
  else if (best >= 0.25) tier = "C";
  else tier = "D";

  return { tier, ratio: Math.round(best * 100) / 100, rollsConsidered: recommended.length };
}
