// READ-ONLY: extract per-target relationship entries from each seeded sim's
// record. Pattern: `09 [8b tuning-id] 11 [8b target-sim-id]` — scan each sim's
// extent for `11 [partnerId]` and read the preceding fixed64 as the tuning id.
// Seeded pairs have exactly one relationship, so tuning sets per directed pair
// are clean. Then label via the user's ground-truth relbit names by set math.
//   relTargets.ts <save> <householdName> ...
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const hhNames = process.argv.slice(3).map((s) => s.toLowerCase());
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const byId = new Map(data.sims.map((s) => [s.id, s]));
const nm = (id: bigint) => { const s = byId.get(id); return s ? `${s.firstName} ${s.lastName}` : '?'; };
const simIds = new Set(data.sims.map((s) => s.id));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;

// sim-record extents
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = readVarint(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = readFixed64LE(buf, i + 1); if (!simIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((x, y) => x.start - y.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

const le = (id: bigint) => { const b = new Uint8Array(8); for (let i = 0; i < 8; i++) b[i] = Number((id >> BigInt(8 * i)) & 0xffn); return b; };

// in [start,end), find all `11 [targetId]` with preceding `09 [8b]`; return tuning ids
function entriesToward(start: number, end: number, target: bigint): { tuning: string; trail: string }[] {
  const pat = le(target); const out: { tuning: string; trail: string }[] = [];
  for (let i = start; i < end - 9; i++) {
    if (buf[i] !== 0x11) continue;
    let ok = true; for (let j = 0; j < 8; j++) if (buf[i + 1 + j] !== pat[j]) { ok = false; break; }
    if (!ok) continue;
    if (i - 9 >= start && buf[i - 9] === 0x09) {
      const tun = readFixed64LE(buf, i - 8);
      // small trail context: next 2 fields raw
      const trail = [...buf.slice(i + 9, i + 9 + 6)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
      out.push({ tuning: '0x' + tun.toString(16), trail });
    }
  }
  return out;
}

for (const h of data.households) {
  if (!hhNames.some((n) => h.name.toLowerCase().includes(n))) continue;
  console.log(`\n══════ "${h.name}" ══════`);
  const [a, b] = h.simIds;
  for (const [me, other] of [[a, b], [b, a]] as [bigint, bigint][]) {
    if (me === undefined || other === undefined) continue;
    const e = ext.get(me); if (!e) { console.log(`  ${nm(me)}: no extent`); continue; }
    const es = entriesToward(e[0], e[1], other);
    console.log(`  ${nm(me)} → ${nm(other)}:`);
    if (!es.length) console.log('     (no entries)');
    for (const x of es) console.log(`     ${x.tuning.padEnd(10)} trail: ${x.trail}`);
  }
}
