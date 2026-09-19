// Can a placed lot in the save be JOINED to its .trayitem locally?
// Cabin Fever: save lotId=0x330c4fa04da938 ; tray instance=0x023516bfd45d2234.
// 1) does the tray instance id appear anywhere in the save? 2) does the save lotId
// appear in the trayitem? 3) any shared 8-byte GUID between trayitem and save lot region?
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const SIMS = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4`;
const b = readFileSync(`${SIMS}/saves/Slot_12345678.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab);

// concat all decompressed save bytes
const chunks: Buffer[] = [];
for (const r of res) {
  try { chunks.push(Buffer.from(r.compType === 0xffff ? decompressRefpack(r.data) : r.data)); } catch { /* */ }
}
const saveAll = Buffer.concat(chunks);

const tray = readFileSync(`${SIMS}/Tray/0x00000002!0x023516bfd45d2234.trayitem`);

function le8(hex: string): Buffer {
  const v = BigInt(hex); const out = Buffer.alloc(8);
  out.writeBigUInt64LE(v); return out;
}
function be8(hex: string): Buffer {
  const v = BigInt(hex); const out = Buffer.alloc(8);
  out.writeBigUInt64BE(v); return out;
}

const trayInstLE = le8('0x023516bfd45d2234');
const trayInstBE = be8('0x023516bfd45d2234');
const lotIdLE = le8('0x330c4fa04da938');
const lotIdBE = be8('0x330c4fa04da938');

console.log('tray instance 0x023516bfd45d2234 in SAVE? LE:', saveAll.includes(trayInstLE), ' BE:', saveAll.includes(trayInstBE));
console.log('save lotId   0x330c4fa04da938  in TRAY? LE:', tray.includes(lotIdLE), ' BE:', tray.includes(lotIdBE));

// brute: collect every 8-byte LE value in the trayitem that looks id-ish, and test against save
console.log('\nScanning trayitem for any 8-byte value that also appears in the save…');
const found: string[] = [];
const sset = saveAll; // substring search
for (let i = 0; i + 8 <= tray.length; i++) {
  const slice = tray.subarray(i, i + 8);
  const v = slice.readBigUInt64LE();
  if (v < 0x1000000000000n || v > 0xffffffffffffffffn) continue; // skip tiny
  // only test plausible Sims entity ids (high byte nonzero, not all 0xff)
  if (sset.includes(slice)) {
    const hx = '0x' + v.toString(16);
    if (!found.includes(hx)) { found.push(hx); if (found.length <= 20) console.log('   shared id:', hx); }
  }
}
console.log(`total shared 8-byte ids: ${found.length}`);

// what string-ish fields does the trayitem expose?
console.log('\nTray item printable strings (len>=4):');
const s = tray.toString('latin1');
const strs = s.match(/[\x20-\x7e]{4,}/g) ?? [];
for (const st of strs.slice(0, 30)) console.log('   ', st);
console.log('\nAll trayitems present on disk (by type prefix):');
const counts = new Map<string, number>();
for (const f of readdirSync(`${SIMS}/Tray`)) {
  const m = f.match(/\.([a-z]+)$/);
  if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
}
for (const [k, c] of counts) console.log(`   .${k}: ${c}`);
