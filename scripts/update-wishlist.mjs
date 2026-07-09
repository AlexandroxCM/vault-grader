// Refreshes api/_lib/wishlist.json from the community-maintained voltron.txt.
// Runs weekly via GitHub Action, or manually:  npm run wishlist
import { writeFileSync } from "node:fs";

const URL = "https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt";
console.log("Downloading community wishlist...");
const text = await (await fetch(URL)).text();

const rollPat = /^dimwishlist:item=(-?\d+)&perks=([\d,]+)/;
const rolls = new Map(); // item -> Map(perkKey -> bits)
let curBits = 3; // 1 = PvE, 2 = PvP, 3 = both/untagged

for (const raw of text.split("\n")) {
  const line = raw.trim();
  if (line.startsWith("//notes:") || line.startsWith("title:")) {
    const low = line.toLowerCase();
    curBits = ((low.includes("pve") ? 1 : 0) | (low.includes("pvp") ? 2 : 0)) || 3;
    continue;
  }
  const m = rollPat.exec(line);
  if (!m) continue;
  const item = parseInt(m[1], 10);
  if (item < 0) continue;
  const perks = m[2].split(",").filter(Boolean).map(Number).sort((a, b) => a - b);
  const key = perks.join(",");
  if (!rolls.has(item)) rolls.set(item, new Map());
  const bucket = rolls.get(item);
  bucket.set(key, (bucket.get(key) || 0) | curBits);
}

const out = {};
for (const [item, bucket] of rolls) {
  out[String(item)] = [...bucket.entries()].map(([key, bits]) => [bits, ...key.split(",").map(Number)]);
}
writeFileSync("api/_lib/wishlist.json", JSON.stringify(out));
const total = Object.values(out).reduce((n, v) => n + v.length, 0);
console.log(`Saved ${Object.keys(out).length.toLocaleString()} weapons, ${total.toLocaleString()} rolls -> api/_lib/wishlist.json`);
