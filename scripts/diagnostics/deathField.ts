/**
 * READ-ONLY: dump the top-level protobuf fields of named sims' 0x0d records so
 * we can isolate the real DEATH field (death_type), distinct from the buggy
 * isGhost marker. Anchor: Victor Goth is confirmed DEAD ("Death by Old Age");
 * compare against confirmed-LIVING sims to find a field present only in the dead.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/deathField.ts <save> "Victor Goth" "Bella Goth" ...
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const names = process.argv.slice(3);
if (!savePath || names.length === 0) { console.error('usage: deathField.ts <save> "First Last" ...'); process.exit(1); }

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simIds = new Set(data.sims.map((s) => s.id));
const findSim = (n: string) => data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === n.toLowerCase())
  || data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(n.toLowerCase()));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;

// anchors → [start,end)
const f64 = (p: number) => readFixed64LE(buf, p);
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = readVarint(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(i + 1); if (!simIds.has(id)) continue;
  anchors.push({ id, start: i }); i = pos;
}
anchors.sort((x, y) => x.start - y.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

// dump top-level fields
function dump(start: number, end: number): string[] {
  const out: string[] = [];
  let p = start;
  while (p < end) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [v, n] = readVarint(buf, p); out.push(`f${fn} varint = ${v} (0x${v.toString(16)})`); p = n; }
    else if (wt === 1) { const v = f64(p); out.push(`f${fn} fixed64 = 0x${v.toString(16)}${simIds.has(v) ? ' [SIM]' : ''}`); p += 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); out.push(`f${fn} len=${l} {msg}`); p = n + Number(l); }
    else if (wt === 5) { const v = (buf[p] | (buf[p+1]<<8) | (buf[p+2]<<16) | (buf[p+3]<<24)) >>> 0; out.push(`f${fn} fixed32 = 0x${v.toString(16)}`); p += 4; }
    else break;
  }
  return out;
}

for (const name of names) {
  const s = findSim(name);
  if (!s) { console.log(`\n### ${name}: NOT FOUND\n`); continue; }
  const e = ext.get(s.id);
  console.log(`\n### ${s.firstName} ${s.lastName} (${s.gender}, ${s.lifestage}, isGhost=${s.isGhost}) id=0x${s.id.toString(16)}`);
  if (!e) { console.log('  (no anchor)'); continue; }
  for (const line of dump(e[0], e[1])) console.log('  ' + line);
}
