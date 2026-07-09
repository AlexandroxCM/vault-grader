// Builds the app's databases from the Bungie manifest + DIM's season map.
//   public/db.json          weapon hash -> full display + filter metadata
//   public/perkdb.json      perk hash -> [name, icon]
//   api/_lib/aliases.json   weapon hash -> other hashes with same name (reissues)
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
const j = async (url, opts) => (await fetch(url, opts)).json();

console.log("Fetching manifest index...");
const paths = (await j(`${BASE}/Platform/Destiny2/Manifest/`, { headers: { "X-API-Key": KEY } }))
  .Response.jsonWorldComponentContentPaths.en;

console.log("Downloading stat definitions...");
const statDefs = await j(BASE + paths.DestinyStatDefinition);
console.log("Downloading plug set definitions...");
const plugSets = await j(BASE + paths.DestinyPlugSetDefinition);
console.log("Downloading collectible definitions (source strings)...");
const collectibles = await j(BASE + paths.DestinyCollectibleDefinition);
console.log("Downloading DIM watermark -> season map...");
const watermarkToSeason = await j(
  "https://raw.githubusercontent.com/DestinyItemManager/d2-additional-info/master/output/watermark-to-season.json"
);
console.log("Downloading item definitions (~150MB, takes a minute)...");
const items = await j(BASE + paths.DestinyInventoryItemDefinition);

const NUMERIC_STATS = new Set([
  "Rounds Per Minute", "Magazine", "Charge Time", "Draw Time", "Ammo Capacity",
]);
const PERK_CATEGORY = /(barrels|magazines|frames|origins|intrinsics|grips|stocks|scopes|batteries|arrows|bowstrings|launchers|blades|guards|tubes|hafts|magazines_gl)/;
const SLOTS = { 1498876634: "Kinetic", 2465295065: "Energy", 953998645: "Power" };
const ELEMENTS = { 1: "Kinetic", 2: "Arc", 3: "Solar", 4: "Void", 6: "Stasis", 7: "Strand" };
const AMMO = { 1: "Primary", 2: "Special", 3: "Heavy" };
const BREAKERS = { 1: "Shield-Piercing", 2: "Disruption", 3: "Stagger" };

const sourceByItem = {};
for (const c of Object.values(collectibles)) {
  if (c.itemHash && c.sourceString) sourceByItem[c.itemHash] = c.sourceString;
}

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

function seasonOf(item) {
  const marks = [
    item.iconWatermark,
    item.iconWatermarkShelved,
    ...(item.quality?.displayVersionWatermarkIcons || []),
  ].filter(Boolean);
  for (const m of marks) if (watermarkToSeason[m]) return watermarkToSeason[m];
  return null;
}

const weapons = {};
const perkdb = {};

for (const [hash, item] of Object.entries(items)) {
  const p = item.displayProperties || {};

  if (item.itemType === 3 && p.name) {
    const stats = [];
    for (const [statHash, s] of Object.entries(item.stats?.stats || {})) {
      const name = statDefs[statHash]?.displayProperties?.name;
      if (!name || s.value === 0) continue;
      stats.push([name, s.value, NUMERIC_STATS.has(name) ? 0 : 1]);
    }
    const foundryTrait = (item.traitIds || []).find((t) => t.startsWith("foundry."));
    weapons[hash] = {
      name: p.name,
      icon: p.icon ? BASE + p.icon : null,
      type: item.itemTypeDisplayName || "",
      tier: item.inventory?.tierTypeName || "",
      stats,
      cols: perkColumns(item),
      season: seasonOf(item),
      elem: ELEMENTS[item.defaultDamageType] || null,
      slot: SLOTS[item.equippingBlock?.equipmentSlotTypeHash] || null,
      ammo: AMMO[item.equippingBlock?.ammoType] || null,
      breaker: BREAKERS[item.breakerType] || null,
      foundry: foundryTrait ? foundryTrait.replace("foundry.", "") : null,
      src: sourceByItem[hash] || null,
      flavor: item.flavorText || null,
    };
  } else if (item.plug && PERK_CATEGORY.test(item.plug.plugCategoryIdentifier || "") && p.name) {
    perkdb[hash] = [p.name, p.icon ? BASE + p.icon : null];
  }
}

// Reissue aliases
const byName = {};
for (const [hash, w] of Object.entries(weapons)) (byName[w.name.toLowerCase()] ||= []).push(hash);
const aliases = {};
for (const hashes of Object.values(byName)) {
  if (hashes.length < 2) continue;
  for (const h of hashes) aliases[h] = hashes.filter((x) => x !== h);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/db.json", JSON.stringify(weapons));
writeFileSync("public/perkdb.json", JSON.stringify(perkdb));
writeFileSync("api/_lib/aliases.json", JSON.stringify(aliases));
console.log(`Saved ${Object.keys(weapons).length.toLocaleString()} weapons -> public/db.json`);
console.log(`Saved ${Object.keys(perkdb).length.toLocaleString()} perks   -> public/perkdb.json`);
console.log(`Saved reissue aliases for ${Object.keys(aliases).length.toLocaleString()} versions -> api/_lib/aliases.json`);
