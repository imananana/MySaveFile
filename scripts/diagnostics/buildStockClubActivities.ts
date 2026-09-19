/* Build src/data/stockClubActivities.ts (club interaction-group id -> name) from
 * the ~/Documents/Club export, and validate against f10 (club rule) instances
 * used across saves. Run: npx tsx scripts/diagnostics/buildStockClubActivities.ts */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint } from '../../src/lib/parser/protobuf.js';

const CDIR = `${process.env.HOME}/Documents/Club`;
const catalog: Record<string, string> = {};
const iconCatalog: Record<string, string> = {}; // id -> category_icon ResourceKey instance (lowercase 16-hex)
const categoryCatalog: Record<string, string> = {}; // id -> tuning category enum (HOBBIES, FOOD_AND_DRINK, …)
let nameless = 0;
for (const f of readdirSync(CDIR).filter((x) => x.endsWith('.ClubInteractionGroupTuning.xml'))) {
  const m = f.match(/!0*([0-9A-Fa-f]+)\.([^.]+)\.ClubInteractionGroupTuning/);
  if (!m) continue;
  const id = '0x' + m[1].toLowerCase();
  const xml = readFileSync(`${CDIR}/${f}`, 'utf8');
  const dn = xml.match(/<T n="name">\s*0x[0-9A-Fa-f]+<!--(.*?)-->/);
  if (dn) catalog[id] = dn[1].trim();
  else { catalog[id] = `?(${m[2]})`; nameless++; }
  // Each rule activity carries its UI icon as a ResourceKey (type 2f7d0004).
  // 47 internal groups (mostly DynastyValue_*) have none — they never render in
  // the club Rules picker, so they simply get no icon (not a guess).
  const im = xml.match(/<T n="category_icon"[^>]*>2f7d0004:0{8}:([0-9a-fA-F]{16})</);
  if (im) iconCatalog[id] = im[1].toLowerCase();
  // Pie-menu category — the same grouping the in-game club Rules picker uses
  // (Food & Drink, Hobbies, Social, …). Only icon-bearing activities are real
  // picker entries, so we only keep categories for those.
  const cm = xml.match(/<E n="category">([^<]+)</);
  if (cm && im) categoryCatalog[id] = cm[1].trim();
}

// collect f10 instances across saves: club f10 = { f1:flag, f2:{ f1,f2,f3:instance } }
const observed = new Map<string, number>(); // instance -> count
const SDIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
function blobOf(p: string): Uint8Array | null { try { const b = readFileSync(p); const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); let bl: Uint8Array | null = null; for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; } return bl; } catch { return null; } }
function readMsg(buf: Uint8Array): Map<number, { v?: bigint; sub?: Uint8Array }[]> {
  const out = new Map<number, { v?: bigint; sub?: Uint8Array }[]>(); let p = 0;
  while (p < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, p); } catch { break; } if (fn === 0) break; p = at;
    if (wire === 0) { const [v, n] = readVarint(buf, p); p = n; (out.get(fn) ?? out.set(fn, []).get(fn)!).push({ v }); }
    else if (wire === 1) p += 8; else if (wire === 5) p += 4;
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const s = buf.slice(n, n + Number(l)); p = n + Number(l); (out.get(fn) ?? out.set(fn, []).get(fn)!).push({ sub: s }); }
    else break; } return out;
}
for (const f of readdirSync(SDIR).filter((x) => x.endsWith('.save'))) {
  const blob = blobOf(`${SDIR}/${f}`); if (!blob) continue;
  const ss = findLDField(blob, 2); const gs = ss && findLDField(ss, 8); const cs = gs && findLDField(gs, 7); if (!cs) continue;
  for (const cb of iterLDFields(cs, 3)) {
    const club = readMsg(cb);
    for (const f10 of club.get(10) ?? []) {
      if (!f10.sub) continue;
      const rule = readMsg(f10.sub);
      const f2 = rule.get(2)?.[0]?.sub; if (!f2) continue;
      const inst = readMsg(f2).get(3)?.[0]?.v;
      if (inst != null) { const id = '0x' + inst.toString(16); observed.set(id, (observed.get(id) ?? 0) + 1); }
    }
  }
}
const missing = [...observed.keys()].filter((id) => !(id in catalog));
console.log(`catalog: ${Object.keys(catalog).length} interaction groups (${nameless} without a name)`);
console.log(`observed f10 rule instances across saves: ${observed.size}`);
console.log(`resolved: ${observed.size - missing.length}/${observed.size}; MISSING: ${missing.length}${missing.length ? ' -> ' + missing.slice(0, 10).join(', ') : ''}`);
console.log(`\nsample resolved rules:`);
for (const [id, c] of [...observed].slice(0, 12)) console.log(`  ${id} x${c} -> ${catalog[id] ?? '❌'}`);

// --- emit the catalog file ---
const sorted = Object.entries(catalog).sort((a, b) => parseInt(a[0], 16) - parseInt(b[0], 16));
const body = sorted.map(([id, nm]) => `  '${id}': ${JSON.stringify(nm)},`).join('\n');
const iconSorted = Object.entries(iconCatalog).sort((a, b) => parseInt(a[0], 16) - parseInt(b[0], 16));
const iconBody = iconSorted.map(([id, inst]) => `  '${id}': '${inst}',`).join('\n');
const catSorted = Object.entries(categoryCatalog).sort((a, b) => parseInt(a[0], 16) - parseInt(b[0], 16));
const catBody = catSorted.map(([id, c]) => `  '${id}': '${c}',`).join('\n');
writeFileSync('src/data/stockClubActivities.ts', `/**
 * Club interaction-group id -> display name (the encouraged/discouraged
 * activities a club can set). Generated by
 * scripts/diagnostics/buildStockClubActivities.ts from a ClubInteractionGroup
 * tuning export; names are EA's <T n="name">. DO NOT EDIT BY HAND.
 *
 * In the save, a club's rules live at Club.f10 (repeated):
 *   f1 = 0 (discouraged) | 1 (encouraged)
 *   f2.f3 = the interaction-group instance id (key below)
 */
export const STOCK_CLUB_ACTIVITIES: Record<string, string> = {
${body}
};

/**
 * Club activity id -> its UI icon's ResourceKey instance (the tuning's
 * <T n="category_icon"> 2f7d0004:…:<instance>). This is the exact id→ResourceKey
 * provenance + the "has an icon" set; the PNG FILES are named by the activity id
 * (/club-activity-icons/<id>.png, see buildClubIconAssets.ts), so the instance
 * is no longer used to build the path. Groups without an icon in tuning (mostly
 * DynastyValue_* internals) are simply absent here.
 */
export const CLUB_ACTIVITY_ICONS: Record<string, string> = {
${iconBody}
};

/**
 * Club activity id -> its pie-menu category enum (the grouping the in-game
 * Rules picker uses). Only real picker entries (icon-bearing) are listed.
 */
export const CLUB_ACTIVITY_CATEGORY: Record<string, string> = {
${catBody}
};

export function resolveClubActivity(id: bigint): string | null {
  return STOCK_CLUB_ACTIVITIES['0x' + id.toString(16).toLowerCase()] ?? null;
}

/** /club-activity-icons/<idHex>.png for an activity id, or null if none.
 *  Named by the activity id (matches skills/careers), not the icon instance. */
export function clubActivityIconUrl(id: string): string | null {
  const k = id.toLowerCase();
  return CLUB_ACTIVITY_ICONS[k] ? \`/club-activity-icons/\${k.replace(/^0x/, '')}.png\` : null;
}
`);
console.log(`\nwrote src/data/stockClubActivities.ts (${sorted.length} activities, ${iconSorted.length} with icons)`);
