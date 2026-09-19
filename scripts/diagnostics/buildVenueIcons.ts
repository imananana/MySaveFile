// Venue-type icons, named by the VENUE tuning id (the id stored in saves: a lot's
// venue tuning + a club hangout's f8.f3), joined EXACTLY on each VenueTuning's
// <T n="venue_icon"> ResourceKey:
//   VenueTuning <T n="venue_icon">…:<instance>  ==  icons.html block's ResourceKey
// No name/slug guessing — a venue type gets the icon its own tuning declares, or a
// gap (printed). Output: public/lot-icons/<venueIdHex>.png, so the resolver is just
// lotIconUrlById(venueId), matching skills/careers/traits/activities.
// Run: npx tsx scripts/diagnostics/buildVenueIcons.ts
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { VENUE_TUNING_MAP } from '../../src/lib/parser/lots.js';

const HOME = process.env.HOME;
const VENUEDIR = `${HOME}/Documents/Venue`;
const HTML = `${HOME}/Desktop/icons.html`;
const OUT = 'public/lot-icons';
mkdirSync(OUT, { recursive: true });

// 1. venue tuning id ('0x..') -> venue_icon instance hash (lowercase).
const idToInstance = new Map<string, string>();
const idToName = new Map<string, string>();
for (const f of readdirSync(VENUEDIR)) {
  const m = f.match(/^E6BBD7DE!([^!]+)!0*([0-9A-Fa-f]+)\.(.+)\.VenueTuning\.xml$/i);
  if (!m) continue;
  const id = '0x' + parseInt(m[2], 16).toString(16);
  idToName.set(id, m[3]);
  const xml = readFileSync(`${VENUEDIR}/${f}`, 'utf8');
  const ic = xml.match(/<T n="venue_icon"[^>]*>\s*[0-9a-fA-F]{8}:[0-9a-fA-F]{8}:([0-9a-fA-F]{16})\s*<\/T>/);
  if (ic) idToInstance.set(id, ic[1].toLowerCase());
}

// 2. icon instance hash -> base64 PNG, from the html (each block: ResourceKey + img).
const instToB64 = new Map<string, string>();
for (const block of readFileSync(HTML, 'utf8').split('<div class="icon-item">')) {
  const key = block.match(/[0-9a-fA-F]{8}:[0-9a-fA-F]{8}:([0-9a-fA-F]{16})/);
  const img = block.match(/data:image\/png;base64,([^"]+)"/);
  if (key && img && !instToB64.has(key[1].toLowerCase())) instToB64.set(key[1].toLowerCase(), img[1]);
}

// 3. write <venueId>.png for EVERY venue tuning in the export (not just the
//    VENUE_TUNING_MAP lot-type subset) so any venue id we surface — including
//    club-hangout types like Haunted House Residential that aren't lot types —
//    resolves by id. Exact venue_icon match; gaps reported.
let wrote = 0; const ids: string[] = [];
const noImage: string[] = [];
for (const [id, name] of idToName) {
  const inst = idToInstance.get(id);
  if (!inst) continue; // tuning declares no venue_icon (rare); nothing to write
  const b64 = instToB64.get(inst);
  if (!b64) { noImage.push(`${id} ${name} (instance ${inst} not in html)`); continue; }
  writeFileSync(`${OUT}/${id.replace(/^0x/, '')}.png`, Buffer.from(b64, 'base64'));
  ids.push(id.replace(/^0x/, '')); wrote++;
}

console.log(`VenueTunings: ${idToName.size}; with venue_icon: ${idToInstance.size}; html icons: ${instToB64.size}`);
console.log(`WROTE ${wrote} venue icons (exact venue_icon ResourceKey).`);
if (noImage.length) { console.log(`\nIcon not in html (${noImage.length}):`); noImage.forEach((s) => console.log('  ' + s)); }
// Report VENUE_TUNING_MAP (lot-type) coverage so we still notice display gaps.
const mapMisses = Object.entries(VENUE_TUNING_MAP).filter(([id]) => !ids.includes(id.replace(/^0x/, '')));
if (mapMisses.length) { console.log(`\nVENUE_TUNING_MAP lot types without an icon (${mapMisses.length}):`); mapMisses.forEach(([id, label]) => console.log(`  ${id} ${label}`)); }

// 4. emit the resolver, mirroring src/data/skillIcons.ts (named by tuning id).
ids.sort();
const rows: string[] = [];
for (let i = 0; i < ids.length; i += 8) rows.push('  ' + ids.slice(i, i + 8).map((x) => `'${x}'`).join(', ') + ',');
writeFileSync('src/data/venueTypeIcons.ts', `// Venue-type icon files in /public/lot-icons/ are named by the venue tuning id
// (hex, no 0x), joined EXACTLY on each VenueTuning's <T n="venue_icon"> ResourceKey
// (see scripts/diagnostics/buildVenueIcons.ts). The id is what saves store (a lot's
// venue tuning + a club hangout's f8.f3), so resolution == extraction key. Resolve
// venue-type icons by ID, never by name/slug. Venue types without a venue_icon in
// tuning (or whose texture isn't in the dump) have no file here.
export const VENUE_ICON_IDS = new Set<string>([
${rows.join('\n')}
]);

/** /lot-icons/<venueIdHex>.png for a venue tuning id, or null if we have no art. */
export function lotIconUrlById(venueId: string | null | undefined): string | null {
  if (!venueId) return null;
  const k = venueId.replace(/^0x/, '').toLowerCase();
  return VENUE_ICON_IDS.has(k) ? \`/lot-icons/\${k}.png\` : null;
}
`);
console.log(`\nwrote src/data/venueTypeIcons.ts (${ids.length} ids)`);
