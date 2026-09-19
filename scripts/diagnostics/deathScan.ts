/**
 * READ-ONLY: confirm f54 is the death field. For every sim, read top-level f54
 * (death-type tuning, 0 = alive) and f29. Report the distribution of distinct
 * f54 values with example names, and cross-check against our isGhost flag — so
 * we can see (a) whether f54 varies by cause of death, (b) whether any sim with
 * f54=0 is wrongly flagged dead (over-match) or vice-versa.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/deathScan.ts <save>
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const simIds = new Set(data.sims.map((s) => s.id));

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;
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

// read a single top-level varint field by number within [start,end)
function topVarint(start: number, end: number, want: number): bigint {
  let p = start;
  while (p < end) {
    const [tb, at] = readVarint(buf, p); const fn = Number(tb) >> 3, wt = Number(tb) & 7;
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [v, n] = readVarint(buf, p); if (fn === want) return v; p = n; }
    else if (wt === 1) { if (fn === want) return f64(p); p += 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); p = n + Number(l); }
    else if (wt === 5) p += 4; else break;
  }
  return -1n;
}

const f54counts = new Map<string, { n: number; examples: string[] }>();
let flaggedButAlive = 0, deadButUnflagged = 0;
const sample: string[] = [];
for (let i = 0; i < anchors.length; i++) {
  const id = anchors[i].id;
  const end = i + 1 < anchors.length ? anchors[i + 1].start : Math.min(buf.length, anchors[i].start + 300_000);
  const f54 = topVarint(anchors[i].start, end, 54);
  const s = simById.get(id);
  const name = s ? `${s.firstName} ${s.lastName}` : `?${id.toString(16)}`;
  const key = f54 === 0n ? '0 (alive)' : `0x${f54.toString(16)}`;
  const e = f54counts.get(key) ?? { n: 0, examples: [] };
  e.n++; if (e.examples.length < 6) e.examples.push(name); f54counts.set(key, e);
  // cross-check vs our isGhost flag
  if (s) {
    if (s.isGhost && f54 === 0n) flaggedButAlive++;
    if (!s.isGhost && f54 !== 0n && f54 !== -1n) deadButUnflagged++;
  }
}

console.log(`Save: ${savePath.split('/').pop()} — ${anchors.length} sim records\n`);
console.log(`── f54 (death-type) distribution ──`);
for (const [k, v] of [...f54counts].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${k.padEnd(22)} ${String(v.n).padStart(4)}   e.g. ${v.examples.join(', ')}`);
}
console.log(`\n── cross-check vs isGhost flag ──`);
console.log(`  isGhost=true but f54=0 (alive):   ${flaggedButAlive}`);
console.log(`  isGhost=false but f54≠0 (dead):   ${deadButUnflagged}`);
