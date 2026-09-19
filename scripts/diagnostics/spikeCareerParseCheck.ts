/** Confirm the production parser populates ParsedSim.career correctly. */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanHumanSimStubs, scanFullSimAnchors } from '../../src/lib/parser/sims.js';
const savePath = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000003.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
let blob: Uint8Array | null = null;
for (const r of resources.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
const sims = scanFullSimAnchors(blob!, scanHumanSimStubs(blob!));
const byKind: Record<string, number> = {};
const samples: Record<string, string[]> = {};
let withCareer = 0;
for (const s of sims) {
  if (!s.career) continue;
  withCareer++;
  byKind[s.career.kind] = (byKind[s.career.kind] ?? 0) + 1;
  (samples[s.career.kind] ??= []).push(`${s.firstName} ${s.lastName}: ${s.career.name} L${s.career.level}`);
}
console.log(`${withCareer}/${sims.length} sims have a career.\n`);
console.log('by kind:', byKind, '\n');
for (const k of Object.keys(samples)) console.log(`--- ${k} ---\n  ${samples[k].slice(0, 5).join('\n  ')}\n`);
