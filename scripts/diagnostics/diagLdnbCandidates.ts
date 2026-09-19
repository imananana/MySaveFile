/**
 * diagLdnbCandidates.ts
 *
 * For one save + one lot field5, find ALL "28 zeros + 06 00 00 00" markers in
 * the LDNB and dump the 8 bytes after each. Helps us see which match is the
 * REAL venue tuning ID versus which are coincidental.
 *
 * Usage:
 *   tsx scripts/diagLdnbCandidates.ts <savePath> <field5>
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../src/lib/dbpf.js';
import { decompressRefpack } from '../src/lib/refpack.js';
import { parseSaveData } from '../src/lib/saveParser.js';

const savePath = process.argv[2];
const targetField5 = BigInt(process.argv[3]);
if (!savePath || !process.argv[3]) {
  console.error('Usage: tsx scripts/diagLdnbCandidates.ts <savePath> <field5>');
  process.exit(1);
}

const buf = readFileSync(savePath);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const data = parseSaveData(resources);

const lot = data.lots.find((l) => l.field5 === targetField5);
if (!lot) { console.error(`Lot with field5=${targetField5} not found`); process.exit(1); }
console.log(`Lot: "${lot.name}" id=0x${lot.id.toString(16)} field5=${lot.field5}`);

const targetLo = Number(lot.id & 0xffffffffn);
const r = resources.find((r) => r.type === 0x06 && r.compType === 0xffff && r.instLo === targetLo);
if (!r) { console.error('No 0x06 chunk for this lot'); process.exit(1); }

const raw = decompressRefpack(r.data);
console.log(`Raw 0x06 chunk: ${raw.length} bytes`);

// Extract LDNB (tag 0x12 length-delimited)
function readVarint(b: Uint8Array, p: number): [bigint, number] {
  let v = 0n, s = 0n;
  while (p < b.length) { const x = b[p++]; v |= BigInt(x & 0x7f) << s; s += 7n; if ((x & 0x80) === 0) break; }
  return [v, p];
}
let p = 0;
let ldnb: Uint8Array | null = null;
while (p < raw.length) {
  const tag = raw[p++];
  if (tag === 0) break;
  const wt = tag & 7;
  if (wt === 0) { const [, n] = readVarint(raw, p); p = n; }
  else if (wt === 1) p += 8;
  else if (wt === 2) {
    const [len, n] = readVarint(raw, p);
    const end = n + Number(len);
    if (tag === 0x12) { ldnb = raw.slice(n, end); break; }
    p = end;
  }
  else if (wt === 5) p += 4;
  else break;
}
if (!ldnb) { console.error('No LDNB'); process.exit(1); }
console.log(`LDNB: ${ldnb.length} bytes\n`);

function readFixed64LE(b: Uint8Array, p: number): bigint {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(b[p + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(b[p + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}

// Scan ALL matches of "28 zeros + 06 00 00 00", show 8 bytes after each.
console.log('All "28 zeros + 06 00 00 00" markers in LDNB:\n');
const matches: { offset: number; value: bigint; nextBytes: string; prevBytes: string }[] = [];
outer: for (let i = 28; i <= ldnb.length - 12; i++) {
  if (ldnb[i] !== 0x06) continue;
  if (ldnb[i + 1] !== 0x00 || ldnb[i + 2] !== 0x00 || ldnb[i + 3] !== 0x00) continue;
  for (let j = i - 28; j < i; j++) if (ldnb[j] !== 0x00) continue outer;
  const val = readFixed64LE(ldnb, i + 4);
  const nextBytes = Array.from(ldnb.slice(i + 4, i + 24))
    .map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const prevStart = Math.max(0, i - 36);
  const prevBytes = Array.from(ldnb.slice(prevStart, i - 28))
    .map((b) => b.toString(16).padStart(2, '0')).join(' ');
  matches.push({ offset: i, value: val, nextBytes, prevBytes });
}
console.log(`Found ${matches.length} matches:\n`);
for (const m of matches) {
  const pctFromEnd = ((ldnb.length - m.offset) / ldnb.length * 100).toFixed(1);
  console.log(`  offset=${m.offset} (${pctFromEnd}% from end)`);
  console.log(`    value (LE) = 0x${m.value.toString(16).padStart(16, '0')}`);
  console.log(`    8 bytes after marker: ${m.nextBytes.slice(0, 23)}  | following 12 bytes: ${m.nextBytes.slice(24)}`);
  console.log(`    8 bytes before zeros: ${m.prevBytes}`);
  console.log('');
}
