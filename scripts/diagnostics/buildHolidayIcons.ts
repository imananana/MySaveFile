// Holiday-tradition icons, named by tuning-id, joined EXACTLY on the icon
// ResourceKey:
//   HolidayTraditionTuning <T n="enabled_display_icon">…:<instance>  ==  icons.html ResourceKey
// No codename guessing (the icons.html codenames differ from the tuning names) —
// a tradition gets the icon its own tuning declares, or a logged gap.
// Run: npx tsx scripts/diagnostics/buildHolidayIcons.ts
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { STOCK_TRADITIONS } from '../../src/data/stockTraditions.js';
const HTML = `${process.env.HOME}/Desktop/icons.html`;
const DIR = `${process.env.HOME}/Documents/Holiday`;
const OUT = 'public/tradition-icons';
mkdirSync(OUT, { recursive: true });

// 1. tradition tuning-id ('0x..') -> icon instance hash (lowercase), from each
//    XML's <T n="enabled_display_icon">…:<instance>. Same id derivation as
//    buildStockTraditions.ts so the keys line up with STOCK_TRADITIONS.
const idToInstance = new Map<string, string>();
for (const f of readdirSync(DIR)) {
  const m = f.match(/!0*([0-9A-Fa-f]+)\.([^.]+)\.HolidayTraditionTuning\.xml$/);
  if (!m) continue;
  if (!/^holidayTradition/i.test(m[2])) continue; // skip wedding situationActivity tunings
  const id = '0x' + m[1].toLowerCase();
  const xml = readFileSync(`${DIR}/${f}`, 'utf8');
  const ic = xml.match(/<T n="enabled_display_icon"[^>]*>\s*[0-9a-fA-F]{8}:[0-9a-fA-F]{8}:([0-9a-fA-F]{16})\s*<\/T>/);
  if (ic) idToInstance.set(id, ic[1].toLowerCase());
}

// 2. icon instance hash -> base64 PNG, from the html (each block: ResourceKey + img).
const instToB64 = new Map<string, string>();
for (const block of readFileSync(HTML, 'utf8').split('<div class="icon-item">')) {
  const key = block.match(/[0-9a-fA-F]{8}:[0-9a-fA-F]{8}:([0-9a-fA-F]{16})/);
  const img = block.match(/data:image\/png;base64,([^"]+)"/);
  if (key && img && !instToB64.has(key[1].toLowerCase())) instToB64.set(key[1].toLowerCase(), img[1]);
}

// 3. write <id>.png from the exact instance match.
let wrote = 0; const noInstance: string[] = []; const noImage: string[] = [];
for (const id of Object.keys(STOCK_TRADITIONS)) {
  const inst = idToInstance.get(id);
  if (!inst) { noInstance.push(`${id} ${STOCK_TRADITIONS[id]} (no <T n=enabled_display_icon> in tuning)`); continue; }
  const b64 = instToB64.get(inst);
  if (!b64) { noImage.push(`${id} ${STOCK_TRADITIONS[id]} (instance ${inst} not in html)`); continue; }
  writeFileSync(`${OUT}/${id.replace(/^0x/, '')}.png`, Buffer.from(b64, 'base64'));
  wrote++;
}
console.log(`html icons indexed: ${instToB64.size}; tradition tunings with icon key: ${idToInstance.size}`);
console.log(`WROTE ${wrote}/${Object.keys(STOCK_TRADITIONS).length} tradition icons (exact ResourceKey match).`);
if (noInstance.length) { console.log(`\nNo icon key in tuning (${noInstance.length}):`); noInstance.forEach(s => console.log('  ' + s)); }
if (noImage.length) { console.log(`\nIcon key not found in html (${noImage.length}):`); noImage.forEach(s => console.log('  ' + s)); }
