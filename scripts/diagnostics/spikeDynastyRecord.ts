/**
 * SPIKE: is the in-game Dynasty record (members+roles, progression, motto,
 * alliances) parseable from the save? Targets the Capp dynasty: finds its
 * description string, then inspects the surrounding region for member sim IDs,
 * the family motto, and other dynasty names (alliances/rivalries).
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/spikeDynastyRecord.ts [savePath] [dynastyName]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { parseSaveData } from '../../src/lib/saveParser.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00001706.save`;
const dynName = (process.argv[3] || 'Capp');

const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simById = new Map(data.sims.map((s) => [s.id, s]));
const nm = (id: bigint) => { const s = simById.get(id); return s ? `${s.firstName} ${s.lastName}`.trim() : null; };

let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!blob || d.length > blob.length) blob = d;
}
const buf = blob!;

// Member ids for the dynasty surname
const members = data.sims.filter((s) => s.lastName === dynName);
console.log(`${dynName} household sims: ${members.map((s) => `${s.firstName}(${s.gender[0]},${s.lifestage})`).join(', ')}`);

// Find the dynasty description string offset
const text = Buffer.from(buf).toString('latin1');
const marker = `admires the ${dynName}`;
let descOff = text.indexOf(marker);
if (descOff < 0) descOff = text.indexOf(dynName);
console.log(`marker "${marker}" @ ${descOff}`);
if (descOff < 0) { console.log('not found'); process.exit(0); }

const W = 6000;
const lo = Math.max(0, descOff - W), hi = Math.min(buf.length, descOff + W);

// fixed64 LE search within window for member ids (and any known sim)
const f64 = (p: number) => { let v = 0n; for (let k = 0; k < 8; k++) v |= BigInt(buf[p + k]) << BigInt(8 * k); return v; };
const idHits: { name: string; rel: number }[] = [];
for (let i = lo; i <= hi - 8; i++) {
  const v = f64(i);
  const n = nm(v);
  if (n) idHits.push({ name: n, rel: i - descOff });
}
console.log(`\nSim IDs (fixed64) within ±${W}B of the description:`);
const byName = new Map<string, number[]>();
for (const h of idHits) { if (!byName.has(h.name)) byName.set(h.name, []); byName.get(h.name)!.push(h.rel); }
for (const [name, rels] of byName) console.log(`   ${name}  @ ${rels.map((r) => (r >= 0 ? '+' : '') + r).join(', ')}`);

// ASCII runs in window — dynasty name, motto, allied/rival dynasty names, role labels
const runs: { s: string; rel: number }[] = [];
let cur = '', st = 0;
for (let i = lo; i < hi; i++) {
  const b = buf[i];
  if (b >= 0x20 && b <= 0x7e) { if (!cur) st = i; cur += String.fromCharCode(b); }
  else { if (cur.length >= 3) runs.push({ s: cur, rel: st - descOff }); cur = ''; }
}
console.log(`\nASCII runs within window (rel offset):`);
for (const r of runs.filter((r) => r.s.length >= 3 && !/^[\d.,\- ]+$/.test(r.s))) {
  console.log(`   ${r.rel >= 0 ? '+' : ''}${r.rel}  "${r.s.slice(0, 80)}"`);
}
