/**
 * READ-ONLY: dump a sim's f47 relationship records, per target, listing the
 * "tuning-magnitude" values found in each target's record (candidate
 * relationship-bit tuning IDs). Goal: isolate the EX-SPOUSE bit by comparing
 * the ex target's record against friends/roommates, across two divorced pairs
 * (Bob↔Eliza Pancakes, Eric↔Alice Spencer-Kim).
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeRel.ts <save> "Sim Name" [highlightTargetSubstr]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const savePath = process.argv[2];
const simName = process.argv[3];
const hl = (process.argv[4] || '').toLowerCase();

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simIds = new Set(data.sims.map((s) => s.id));
const nameById = new Map(data.sims.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
const self = data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase() === simName.toLowerCase())
  || data.sims.find((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(simName.toLowerCase()));
if (!self) { console.error('sim not found'); process.exit(1); }

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
const buf = blob!;
const f64 = (p: number) => readFixed64LE(buf, p);

// anchors → extent for self
const anchors: { id: bigint; start: number }[] = [];
for (let i = 0; i < buf.length - 60; i++) {
  if (buf[i] !== 0x09) continue;
  let pos = i + 9; if (buf[pos] !== 0x11) continue; pos += 9;
  if (buf[pos] !== 0x18) continue; pos++; const [, a] = readVarint(buf, pos); pos = a;
  if (buf[pos] !== 0x21) continue; pos += 9; if (buf[pos] !== 0x2a) continue;
  const id = f64(i + 1); if (!simIds.has(id)) continue; anchors.push({ id, start: i }); i = pos;
}
anchors.sort((a, b) => a.start - b.start);
const idx = anchors.findIndex((a) => a.id === self.id);
const start = anchors[idx].start, end = idx + 1 < anchors.length ? anchors[idx + 1].start : Math.min(buf.length, start + 300_000);

function isMsg(s: number, e: number): boolean {
  let p = s, fields = 0;
  while (p < e) { const [tb, at] = readVarint(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n);
    if (fn === 0 || fn > 60000 || at <= p) return false; p = at;
    if (wt === 0) { const [, n] = readVarint(buf, p); p = n; } else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readVarint(buf, p); const ce = n + Number(l); if (ce > e) return false; p = ce; }
    else if (wt === 5) p += 4; else return false; fields++; }
  return p === e && fields > 0;
}
// find f47 message bounds within self record
function findField(s: number, e: number, want: number): [number, number] | null {
  let p = s;
  while (p < e) { const [tb, at] = readVarint(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n);
    if (fn === 0 || at <= p) break; p = at;
    if (wt === 0) { const [, n] = readVarint(buf, p); p = n; } else if (wt === 1) p += 8;
    else if (wt === 2) { const [l, n] = readVarint(buf, p); const ce = n + Number(l); if (fn === want) return [n, ce]; p = ce; }
    else if (wt === 5) p += 4; else break; }
  return null;
}
const f47 = findField(start, end, 47);
if (!f47) { console.error('no f47'); process.exit(1); }

// collect sims + tuning-magnitude values within a record
function collect(s: number, e: number, acc: { sims: bigint[]; vals: bigint[] }, depth: number): void {
  let p = s;
  while (p < e) { const [tb, at] = readVarint(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n);
    if (fn === 0 || at <= p) return; p = at;
    if (wt === 0) { const [v, n] = readVarint(buf, p); if (simIds.has(v) && v !== self!.id) acc.sims.push(v); else if (v >= 0x10000n) acc.vals.push(v); p = n; }
    else if (wt === 1) { const v = f64(p); if (simIds.has(v) && v !== self!.id) acc.sims.push(v); else if (v >= 0x10000n) acc.vals.push(v); p += 8; }
    else if (wt === 2) { const [l, n] = readVarint(buf, p); const ce = n + Number(l); if (ce <= e && depth < 10 && l > 0 && isMsg(n, ce)) collect(n, ce, acc, depth + 1); p = ce; }
    else if (wt === 5) p += 4; else return; }
}

const exId = data.sims.find((s)=>`${s.firstName} ${s.lastName}`.toLowerCase().includes(hl))?.id;
const exLow = exId!==undefined ? (exId & 0xffffffffn) : undefined;
const isExRef = (v: bigint) => v===exId || v===exLow;
console.log(`Sim: ${self.firstName} ${self.lastName} — searching f47 for ex 0x${exId?.toString(16)} (low 0x${exLow?.toString(16)})\n`);

const mark=(v: bigint)=> isExRef(v)?'  ◀◀EX':simIds.has(v)?'  [sim]':(v>=0x100000n?'  (tuning?)':'');
function dumpTree(s: number, e: number, depth: number){
  if(depth>6) return; const pad='  '.repeat(depth); let p=s;
  while(p<e){ const [tb,at]=readVarint(buf,p); const fn=Number(tb>>3n), wt=Number(tb&7n); if(fn===0||at<=p) break; p=at;
    if(wt===0){ const [v,n]=readVarint(buf,p); console.log(`${pad}f${fn}: ${v}${mark(v)}`); p=n; }
    else if(wt===1){ const v=f64(p); console.log(`${pad}f${fn}: 0x${v.toString(16)}${mark(v)}`); p+=8; }
    else if(wt===2){ const [l,n]=readVarint(buf,p); const ce=n+Number(l);
      if(l>0&&isMsg(n,ce)){ console.log(`${pad}f${fn}: {`); dumpTree(n,ce,depth+1); console.log(`${pad}}`); }
      else if(l>0 && Number(l)%8===0 && Number(l)<=80){ const ch=[]; for(let k=0;k<Number(l);k+=8){ const v=f64(n+k); ch.push('0x'+v.toString(16)+mark(v)); } console.log(`${pad}f${fn}: ‹${l}b›= ${ch.join(', ')}`); }
      else console.log(`${pad}f${fn}: ‹${l}b bytes›`); p=ce; }
    else if(wt===5){ p+=4; } else break; }
}
// f27 holds the relationship records — dump the first few in full
const f27 = findField(f47[0], f47[1], 27)!;
let p = f27[0]; let rec=0;
while (p < f27[1] && rec < 4) {
  const [tb, at] = readVarint(buf, p); const fn = Number(tb >> 3n), wt = Number(tb & 7n); if (fn===0||at<=p) break; p = at;
  if (wt === 2) { const [l, n] = readVarint(buf, p); const ce = n + Number(l);
    if (l>0 && isMsg(n, ce)) { rec++; console.log(`\n── f27 record #${rec} (f${fn}, ${l}b) ──`); dumpTree(n, ce, 1); }
    p = ce; }
  else if (wt === 0) { const [, n] = readVarint(buf, p); p = n; }
  else if (wt === 1) p += 8; else if (wt === 5) p += 4; else break;
}
