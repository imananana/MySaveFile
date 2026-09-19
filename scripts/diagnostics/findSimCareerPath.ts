/* Walk a named sim's full record and print the FIELD PATH of every occurrence of
 * a known career uid (default Culinary 0x240f) + nearby skill uids — to find
 * where a career is stored when it's NOT in f30.f12.
 * Run: npx tsx scripts/diagnostics/findSimCareerPath.ts <savePath> <needle> [uidHex] */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { STOCK_CAREERS } from '../../src/data/stockCareers.js';
import { STOCK_SKILLS } from '../../src/data/stockSkills.js';

const savePath = process.argv[2];
const NEEDLE = (process.argv[3] || 'dina caliente').toLowerCase();
const TARGET = process.argv[4] ? BigInt(process.argv[4]) : 0x240fn;

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
const buf = blob!;

function rv(b: Uint8Array, p: number): [bigint, number] { let res = 0n, sh = 0n, i = p; while (i < b.length) { const x = b[i]; i++; res |= BigInt(x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7n; if (sh > 70n) break; } return [res, i]; }
const f64 = (b: Uint8Array, p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(b[p + k]) << BigInt(8 * k); return v; };
const hx = (v: bigint) => '0x' + v.toString(16);

const known = new Set(data.sims.map((s) => s.id));
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue; let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = rv(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(buf, i + 1); if (!known.has(id)) continue; anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const ext = new Map<bigint, [number, number]>();
anchors.forEach((a, i) => ext.set(a.id, [a.start, i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, a.start + 300_000)]));

function hunt(s: number, e: number, path: string, depth: number) {
  let p = s;
  while (p < e && depth < 12) {
    const [tb, at] = rv(buf, p); const tag = Number(tb), fn = tag >> 3, wt = tag & 7; if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [v, n] = rv(buf, p); if (v === TARGET) console.log(`  VARINT match ${hx(v)} (${STOCK_CAREERS[hx(v)]?.name ?? STOCK_SKILLS[hx(v)] ?? '?'}) at ${path}.f${fn}`); p = n; }
    else if (wt === 1) { const v = f64(buf, p); if (v === TARGET) console.log(`  FIXED64 match ${hx(v)} at ${path}.f${fn}`); p += 8; }
    else if (wt === 5) p += 4;
    else if (wt === 2) { const [l, n] = rv(buf, p); const ce = n + Number(l); if (ce <= e) hunt(n, ce, `${path}.f${fn}`, depth + 1); p = ce; }
    else break;
  }
}

console.log(`# ${savePath.split('/').pop()}  needle="${NEEDLE}" target=${hx(TARGET)} (${STOCK_CAREERS[hx(TARGET)]?.name ?? '?'})`);
for (const sim of data.sims) {
  const full = `${sim.firstName} ${sim.lastName}`.trim();
  if (!full.toLowerCase().includes(NEEDLE)) continue;
  const [s, e] = ext.get(sim.id)!;
  console.log(`\n${full} [${sim.lifestage}] record bytes ${s}..${e} (${e - s}b):`);
  hunt(s, e, '', 0);
  console.log('  (end — if no matches above, the uid is NOT inside this record window)');
}
