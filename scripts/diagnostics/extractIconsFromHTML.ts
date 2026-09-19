/**
 * Extract base64-embedded trait + aspiration icons from a "Sims 4 All Icons"
 * HTML dump and write them into public/trait-icons/<traitIdHex>.png and
 * public/aspiration-icons/<aspirationIdHex>.png — NAMED BY THE CATALOG TUNING ID
 * (the id saves store), matched via each catalog's iconInstance ResourceKey.
 * This matches the skill/career/activity convention, so the resolver is just
 * <set>-icons/<idHex>.png with no instance lookup. Icons not referenced by
 * either catalog are ignored.
 *
 * Each icon-item block in the HTML looks roughly like:
 *
 *   <div class="icon-item">
 *     <img src="data:image/png;base64,...." />
 *     <div class="icon-name">
 *       <div class="pack-icon ..." title="..."></div>
 *       <span>aspiration_admired</span>
 *     </div>
 *     <div></div>
 *     <div>2f7d0004:00000000:b6fec9aa1a0c1e69</div>
 *     <div>DST5 (No Mips) 64x64</div>
 *   </div>
 *
 * Usage:
 *   HTML="$HOME/Documents/Icons/Sims 4 All Icons.html" npx tsx scripts/diagnostics/extractIconsFromHTML.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { STOCK_TRAITS } from '../../src/data/stockTraits.js';
import { STOCK_ASPIRATIONS } from '../../src/data/stockAspirations.js';
import { STOCK_VENUE_TRAITS } from '../../src/data/stockVenueTraits.js';

const HTML_FILE = process.env.HTML || `${process.env.HOME}/Documents/Icons/Sims 4 All Icons.html`;
const TRAITS_DIR = `${process.cwd()}/public/trait-icons`;
const ASPIRATIONS_DIR = `${process.cwd()}/public/aspiration-icons`;

mkdirSync(TRAITS_DIR, { recursive: true });
mkdirSync(ASPIRATIONS_DIR, { recursive: true });

console.log(`Reading ${HTML_FILE}…`);
const html = readFileSync(HTML_FILE, 'utf8');

// Build lookup: instance hex → [{ kind, id }]. Each catalog entry is named by
// its OWN tuning id (the Record key, minus 0x); several entries may share an
// icon instance, so each still gets its own id-named file.
type Want = { kind: 'trait' | 'aspiration'; id: string };
const wanted = new Map<string, Want[]>();
const push = (inst: string, w: Want) => {
  const k = inst.toLowerCase();
  (wanted.get(k) ?? wanted.set(k, []).get(k)!).push(w);
};
for (const [id, t] of Object.entries(STOCK_TRAITS)) {
  if (t.iconInstance) push(t.iconInstance, { kind: 'trait', id: id.replace(/^0x/, '').toLowerCase() });
}
// Getaway-NPC venue traits share the /trait-icons/ folder (they appear as club
// role criteria); named by their own tuning id, same convention as CAS traits.
for (const [id, v] of Object.entries(STOCK_VENUE_TRAITS)) {
  if (v.icon) push(v.icon, { kind: 'trait', id: id.replace(/^0x/, '').toLowerCase() });
}
for (const [id, a] of Object.entries(STOCK_ASPIRATIONS)) {
  if (a.iconInstance) push(a.iconInstance, { kind: 'aspiration', id: id.replace(/^0x/, '').toLowerCase() });
}

const traitWantCount = [...wanted.values()].flat().filter((w) => w.kind === 'trait').length;
const aspWantCount = [...wanted.values()].flat().filter((w) => w.kind === 'aspiration').length;
console.log(`Need ${traitWantCount} trait + ${aspWantCount} aspiration icons (${wanted.size} distinct instances).`);

// Match the icon-item structure. Each block has the img src and a resource key
// triple (type:group:instance) elsewhere in the block. We use [\s\S] instead of
// `.` with /s flag for compatibility across Node versions.
const iconBlockRe = /<div class="icon-item">([\s\S]*?)<\/div>\s*<\/div>/g;
const imgSrcRe = /<img src="data:image\/png;base64,([^"]+)"/;
const resourceRe = /([0-9a-fA-F]{8}):([0-9a-fA-F]{8}):([0-9a-fA-F]{16})/;

let scanned = 0;
let written = 0;
let skipped = 0;
const seenInstances = new Set<string>();

for (const blockMatch of html.matchAll(iconBlockRe)) {
  scanned++;
  const block = blockMatch[1];

  const imgMatch = block.match(imgSrcRe);
  const resMatch = block.match(resourceRe);
  if (!imgMatch || !resMatch) continue;

  const instance = resMatch[3].toLowerCase();
  const wants = wanted.get(instance);
  if (!wants) { skipped++; continue; }

  const buf = Buffer.from(imgMatch[1], 'base64');
  for (const w of wants) {
    const dir = w.kind === 'trait' ? TRAITS_DIR : ASPIRATIONS_DIR;
    writeFileSync(`${dir}/${w.id}.png`, buf);
    written++;
  }
  seenInstances.add(instance);
}

console.log(`\nScanned ${scanned} icon-item blocks. Wrote ${written} id-named files. Skipped ${skipped} non-catalog.`);

// Report any catalog entries we didn't find an icon for.
const missingTraits: string[] = [];
const missingAspirations: string[] = [];
for (const t of Object.values(STOCK_TRAITS)) {
  if (t.iconInstance && !seenInstances.has(t.iconInstance.toLowerCase())) missingTraits.push(`${t.name} (${t.iconInstance})`);
}
for (const a of Object.values(STOCK_ASPIRATIONS)) {
  if (a.iconInstance && !seenInstances.has(a.iconInstance.toLowerCase())) missingAspirations.push(`${a.name} (${a.iconInstance})`);
}

if (missingTraits.length) {
  console.log(`\nTraits without an icon in the HTML (${missingTraits.length}):`);
  for (const m of missingTraits.slice(0, 20)) console.log(`  - ${m}`);
  if (missingTraits.length > 20) console.log(`  … and ${missingTraits.length - 20} more`);
}
if (missingAspirations.length) {
  console.log(`\nAspirations without an icon in the HTML (${missingAspirations.length}):`);
  for (const m of missingAspirations.slice(0, 20)) console.log(`  - ${m}`);
  if (missingAspirations.length > 20) console.log(`  … and ${missingAspirations.length - 20} more`);
}

console.log(`\nDone.`);
