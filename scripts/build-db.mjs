// Downloads the Destiny 2 manifest and writes:
//   public/db.json     weapon hash -> { name, icon, type, tier, stats }
//   public/perkdb.json perk hash   -> [name, icon]
//
// Run before deploying (and after big game patches):
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

console.log("Downloading stat definitions...");
r = await fetch(BASE + paths.DestinyStatDefinition);
const statDefs = await r.json();

console.log("Downloading plug set definitions (perk pools)...");
r = await fetch(BASE + paths.DestinyPlugSetDefinition);
const plugSets = await r.json();

console.log("Downloading item definitions (~150MB, takes a minute)...");
r = await fetch(BASE + paths.DestinyInventoryItemDefinition);
const items = await r.json();

// Resolve a weapon's socket entries into perk columns: each column is the
// list of perk hashes that can roll there (random pool preferred, else fixed).
function perkColumns(item) {
  const cols = [];
  for (const entry of item.sockets?.socketEntries || []) {
    const setHash = entry.randomizedPlugSetHash || entry.reusablePlugSetHash;
    if (!setHash) continue;
    const plugs = plugSets[setHash]?.reusablePlugItems || [];
    const hashes = [...new Set(plugs.map((p) => p.plugItemHash))];
    if (hashes.length) cols.push(hashes);
  }
  return cols;
}

// Stats shown as 0-100 bars vs raw numbers (RPM, magazine, charge time...)
const NUMERIC_STATS = new Set([
  "Rounds Per Minute", "Magazine", "Charge Time", "Draw Time", "Ammo Capacity",
]);

// Weapon-perk plug categories (keeps perkdb small: no shaders/trackers/mods)
const PERK_CATEGORY = /(barrels|magazines|frames|origins|intrinsics|grips|stocks|scopes|batteries|arrows|bowstrings|launchers|blades|guards|tubes|hafts|magazines_gl)/;

const weapons = {};
const perkdb = {};

for (const [hash, item] of Object.entries(items)) {
  const p = item.displayProperties || {};

  if (item.itemType === 3 && p.name) {
    const stats = [];
    for (const [statHash, s] of Object.entries(item.stats?.stats || {})) {
      const name = statDefs[statHash]?.displayProperties?.name;
      if (!name || s.value === 0) continue;
      stats.push([name, s.value, NUMERIC_STATS.has(name) ? 0 : 1]); // [name, value, isBar]
    }
    weapons[hash] = {
      name: p.name,
      icon: p.icon ? BASE + p.icon : null,
      type: item.itemTypeDisplayName || "",
      tier: item.inventory?.tierTypeName || "",
      stats,
      cols: perkColumns(item),
    };
  } else if (item.plug && PERK_CATEGORY.test(item.plug.plugCategoryIdentifier || "") && p.name) {
    perkdb[hash] = [p.name, p.icon ? BASE + p.icon : null];
  }
}

mkdirSync("public", { recursive: true });
writeFileSync("public/db.json", JSON.stringify(weapons));
writeFileSync("public/perkdb.json", JSON.stringify(perkdb));
console.log(`Saved ${Object.keys(weapons).length.toLocaleString()} weapons -> public/db.json`);
console.log(`Saved ${Object.keys(perkdb).length.toLocaleString()} perks   -> public/perkdb.json`);
