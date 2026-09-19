// Career icons, named by CAREER tuning-id (the id saves store at f30.f12.f2.f1),
// joined EXACTLY through the career's trunk track. The career icon does NOT live
// on the CareerTuning or its SimData (that <T n="icon"> is null) — it lives on the
// career's start_track CareerTrackTuning:
//
//   CareerTuning <T n="start_track">  ->  CareerTrackTuning instance
//   CareerTrackTuning <T n="icon">…:<inst>  ==  icons.html block's ResourceKey
//
// No codename guessing — a career gets the icon its own trunk track declares, or a
// gap (which we print). Output: public/career-icons/<careerIdHex>.png named by the
// CAREER id, mirroring buildSkillIcons.ts, so the resolver is just
// careerIconUrlById(idHex). Run: npx tsx scripts/diagnostics/buildCareerIcons.ts
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { STOCK_CAREERS } from '../../src/data/stockCareers.js';

const HOME = process.env.HOME;
const CAREERDIR = `${HOME}/Documents/Career`;       // CareerTuning (type 73996BEB)
const TRACKDIR = `${HOME}/Documents/Aspirations`;   // CareerTrackTuning (type 48C75CE3)
const HTML = `${HOME}/Desktop/icons.html`;
const OUT = 'public/career-icons';
mkdirSync(OUT, { recursive: true });

// 1. career tuning-id ('0x..') -> trunk track id ('0x..'), from <T n="start_track">.
//    The value is decimal in the tuning; convert to hex to match track filenames.
const careerToTrack = new Map<string, string>();
for (const f of readdirSync(CAREERDIR)) {
  const m = f.match(/^73996BEB!([^!]+)!0*([0-9A-Fa-f]+)\..+\.CareerTuning\.xml$/i);
  if (!m) continue;
  const careerId = '0x' + parseInt(m[2], 16).toString(16);
  const xml = readFileSync(`${CAREERDIR}/${f}`, 'utf8');
  const st = xml.match(/<T n="start_track">\s*(\d+)/);
  if (st) careerToTrack.set(careerId, '0x' + parseInt(st[1], 10).toString(16));
}

// 2. track id ('0x..') -> icon instance hash (lowercase), from each track's <T n="icon">.
//    Scan the track dump AND the career dump — some tracks (e.g. the Discover
//    University E-Sports org) ship alongside their career rather than in Aspirations.
const trackToInstance = new Map<string, string>();
for (const dir of [TRACKDIR, CAREERDIR]) {
  for (const f of readdirSync(dir)) {
    const m = f.match(/^48C75CE3!([^!]+)!0*([0-9A-Fa-f]+)\..+\.CareerTrackTuning\.xml$/i);
    if (!m) continue;
    const trackId = '0x' + parseInt(m[2], 16).toString(16);
    const xml = readFileSync(`${dir}/${f}`, 'utf8');
    const ic = xml.match(/<T n="icon"[^>]*>\s*[0-9a-fA-F]{8}:[0-9a-fA-F]{8}:([0-9a-fA-F]{16})\s*<\/T>/);
    if (ic && !trackToInstance.has(trackId)) trackToInstance.set(trackId, ic[1].toLowerCase());
  }
}

// 3. icon instance hash -> base64 PNG, from the html (each block: ResourceKey + img).
const instToB64 = new Map<string, string>();
for (const block of readFileSync(HTML, 'utf8').split('<div class="icon-item">')) {
  const key = block.match(/[0-9a-fA-F]{8}:[0-9a-fA-F]{8}:([0-9a-fA-F]{16})/);
  const img = block.match(/data:image\/png;base64,([^"]+)"/);
  if (key && img && !instToB64.has(key[1].toLowerCase())) instToB64.set(key[1].toLowerCase(), img[1]);
}

// Documented one-off overrides (careerId -> icon instance) for the lone careers
// whose track-declared icon assets are absent from every icon dump. NOT fuzzy
// matching: each value is the same career's art identified by its exact unique
// internal codename, used only because the strict chain's asset doesn't exist.
//   0x3ef8e Interior Decorator: track <T n=icon> = career_interiordesigner_fl
//     (e92891fa5e1ea302) is in no dump; only career_interiordesigner_main exists.
const ICON_OVERRIDE: Record<string, string> = {
  '0x3ef8e': '46c122cb58e08a53', // Interior Decorator -> career_interiordesigner_main
};

// 4. write <careerId>.png from the exact chained match. Only playable careers
//    matter for the picker, but we resolve every non-npc/school career and report.
let wrote = 0; const ids: string[] = []; let overrode = 0;
const noTrack: string[] = []; const noTrackIcon: string[] = []; const noImage: string[] = [];
for (const [id, c] of Object.entries(STOCK_CAREERS)) {
  if (c.kind === 'npc' || c.kind === 'school') continue; // not shown in the picker
  const override = ICON_OVERRIDE[id];
  const track = override ? null : careerToTrack.get(id);
  if (!override && !track) { noTrack.push(`${id} ${c.name} (no start_track in CareerTuning)`); continue; }
  const inst = override ?? trackToInstance.get(track!);
  if (!inst) { noTrackIcon.push(`${id} ${c.name} (track ${track} has no <T n=icon>)`); continue; }
  if (override) overrode++;
  const b64 = instToB64.get(inst);
  if (!b64) { noImage.push(`${id} ${c.name} (instance ${inst} not in html)`); continue; }
  writeFileSync(`${OUT}/${id.replace(/^0x/, '')}.png`, Buffer.from(b64, 'base64'));
  ids.push(id.replace(/^0x/, '')); wrote++;
}

const playable = Object.entries(STOCK_CAREERS).filter(([, c]) => c.kind !== 'npc' && c.kind !== 'school').length;
console.log(`careers->track: ${careerToTrack.size}; tracks->icon: ${trackToInstance.size}; html icons: ${instToB64.size}`);
console.log(`WROTE ${wrote}/${playable} playable career icons (exact chain + ${overrode} documented override).`);
if (noTrack.length) { console.log(`\nNo start_track (${noTrack.length}):`); noTrack.forEach((s) => console.log('  ' + s)); }
if (noTrackIcon.length) { console.log(`\nTrack has no icon key (${noTrackIcon.length}):`); noTrackIcon.forEach((s) => console.log('  ' + s)); }
if (noImage.length) { console.log(`\nIcon key not in html (${noImage.length}):`); noImage.forEach((s) => console.log('  ' + s)); }

// 5. emit the resolver, mirroring src/data/skillIcons.ts (named by tuning id).
ids.sort();
const setBody = ids.map((id) => `'${id}'`).reduce((acc: string[], cur, i) => {
  if (i % 8 === 0) acc.push('');
  acc[acc.length - 1] += (acc[acc.length - 1] && acc[acc.length - 1] !== '' ? ' ' : '') + cur + ',';
  return acc;
}, []).map((l) => '  ' + l.trim()).join('\n');
writeFileSync('src/data/careerIcons.ts', `// Career icon files in /public/career-icons/ are named by the career's tuning id
// (hex, no 0x), joined EXACTLY through the career's trunk track:
//   CareerTuning <T n="start_track"> -> CareerTrackTuning <T n="icon"> ResourceKey
// (see scripts/diagnostics/buildCareerIcons.ts). Resolve career icons by ID, never
// by name/slug. Careers whose trunk track declares no icon have no file here.
export const CAREER_ICON_IDS = new Set<string>([
${setBody}
]);

/** /career-icons/<idHex>.png for a career tuning id, or null if we have no art. */
export function careerIconUrlById(idHex: string): string | null {
  const k = idHex.replace(/^0x/, '').toLowerCase();
  return CAREER_ICON_IDS.has(k) ? \`/career-icons/\${k}.png\` : null;
}
`);
console.log(`\nwrote src/data/careerIcons.ts (${ids.length} ids)`);
