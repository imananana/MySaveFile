// Custom-venue / getaway / preset KIND icons. There's no per-venue icon picker,
// so each editor surface shows a fixed icon for its kind. ResourceKeys were
// hand-picked by the user from icons.html (type 2f7d0004). We extract every
// candidate so we can compare and choose; files are named by instance hex (no
// map, mirroring club icons). Run: npx tsx scripts/diagnostics/buildVenueKindIcons.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const HTML = `${process.env.HOME}/Desktop/icons.html`;
const OUT = 'public/venue-kind-icons';
mkdirSync(OUT, { recursive: true });

// Candidate instances per kind (first = my proposed primary).
const CANDIDATES: Record<string, string[]> = {
  preset: ['a6821caf34cb7de8', 'cf5e97cd8d97f76f', '3cb2f8bad480ba8e', 'fdb8e7abeb6922c4', 'b71c73aaff28ac86'],
  venue: ['08b923f3f7cf42c6', 'c7fddfb51d08558a', '89c651c572dc816c'],
  getaway: ['548a7b163fd57272'],
};

const html = readFileSync(HTML, 'latin1');
const blocks = html.split('<div class="icon-item">');
const want = new Set(Object.values(CANDIDATES).flat());
const found = new Map<string, string>(); // instance -> base64

for (const b of blocks) {
  const keyM = b.match(/[0-9a-fA-F]{8}:[0-9a-fA-F]{8}:([0-9a-fA-F]{16})/);
  if (!keyM) continue;
  const inst = keyM[1].toLowerCase();
  if (!want.has(inst) || found.has(inst)) continue;
  const imgM = b.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  if (imgM) found.set(inst, imgM[1]);
}

let wrote = 0;
for (const [kind, insts] of Object.entries(CANDIDATES)) {
  for (const inst of insts) {
    const b64 = found.get(inst);
    if (!b64) { console.log(`MISSING ${kind} ${inst}`); continue; }
    writeFileSync(`${OUT}/${inst}.png`, Buffer.from(b64, 'base64'));
    wrote++;
    console.log(`wrote ${kind.padEnd(8)} ${inst}.png`);
  }
}
console.log(`\nextracted ${wrote}/${want.size} venue-kind icons → ${OUT}/`);
