// Downloads the Destiny 2 manifest and writes public/db.json:
// weapon hash -> { name, icon, type, tier }  (only weapons, keeps it small)
//
// Run once before deploying (and after big game patches):
//   BUNGIE_API_KEY="your-key" node scripts/build-db.mjs

import { writeFileSync, mkdirSync } from "node:fs";

const KEY = process.env.BUNGIE_API_KEY;
if (!KEY) {
  console.error('Set your key first:  BUNGIE_API_KEY="..." node scripts/build-db.mjs');
  process.exit(1);
}

const BASE = "https://www.bungie.net";

console.log("Fetching manifest index...");
let r = await fetch(`${BASE}/Platform/Destiny2/Manifest/`, { headers: { "X-API-Key": KEY } });
const paths = (await r.json()).Response.jsonWorldComponentContentPaths.en;

console.log("Downloading item definitions (~150MB, takes a minute)...");
r = await fetch(BASE + paths.DestinyInventoryItemDefinition);
const items = await r.json();

const weapons = {};
for (const [hash, item] of Object.entries(items)) {
  if (item.itemType !== 3) continue; // weapons only
  const p = item.displayProperties || {};
  if (!p.name) continue;
  weapons[hash] = {
    name: p.name,
    icon: p.icon ? BASE + p.icon : null,
    type: item.itemTypeDisplayName || "",
    tier: item.inventory?.tierTypeName || "",
  };
}

mkdirSync("public", { recursive: true });
writeFileSync("public/db.json", JSON.stringify(weapons));
console.log(`Saved ${Object.keys(weapons).length.toLocaleString()} weapons -> public/db.json`);
