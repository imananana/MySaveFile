/**
 * Dump every raw protobuf field for clubs that the parser sees as "stock"
 * (no name). Goal: find whether the name lives in some other field we're not
 * reading.
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const HOME = process.env.HOME;
const SAVE = process.env.SAVE || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000002.save`;

const buf = readFileSync(SAVE);
const resources = parseDbpf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const data = parseSaveData(resources);
const noName = new Set(data.clubs.filter((c) => c.name === null).map((c) => c.id));
console.log(`${noName.size} clubs with no name field\n`);

for (const r of resources) {
  if (r.type !== 0x0d) continue;
  const raw = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  const u8 = new Uint8Array(raw);
  const saveSlot = findLDField(u8, 2);
  if (!saveSlot) continue;
  const gameSlot = findLDField(saveSlot, 8);
  if (!gameSlot) continue;
  const clubSvc = findLDField(gameSlot, 7);
  if (!clubSvc) continue;

  for (const clubBytes of iterLDFields(clubSvc, 3)) {
    let cid = 0n;
    let pp = 0;
    while (pp < clubBytes.length) {
      const [fn, wire, afterTag] = readTag(clubBytes, pp);
      pp = afterTag;
      if (wire === 0) {
        const [v, n] = readVarint(clubBytes, pp);
        pp = n;
        if (fn === 1) { cid = v; break; }
      } else if (wire === 1) { pp += 8; }
      else if (wire === 2) { const [l, n] = readVarint(clubBytes, pp); pp = n + Number(l); }
      else if (wire === 5) { pp += 4; }
      else break;
    }
    if (!noName.has(cid)) continue;

    console.log(`=== club ${cid} ===`);
    let p = 0;
    while (p < clubBytes.length) {
      const [fn, wire, afterTag] = readTag(clubBytes, p);
      p = afterTag;
      if (wire === 0) {
        const [v, n] = readVarint(clubBytes, p);
        p = n;
        console.log(`  field ${fn} varint   = ${v}`);
      } else if (wire === 1) {
        const v = readFixed64LE(clubBytes, p);
        p += 8;
        console.log(`  field ${fn} fixed64  = ${v}`);
      } else if (wire === 2) {
        const [l, n] = readVarint(clubBytes, p);
        const ln = Number(l);
        const sub = clubBytes.slice(n, n + ln);
        p = n + ln;
        const asStr = new TextDecoder('utf-8', { fatal: false }).decode(sub);
        const isPrintable = /^[ -~ -￿]+$/.test(asStr) && ln < 400;
        if (isPrintable) {
          console.log(`  field ${fn} LD(${ln})   = "${asStr.slice(0, 200)}${asStr.length > 200 ? '…' : ''}"`);
        } else {
          const hex = [...sub.slice(0, 32)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`  field ${fn} LD(${ln})   = hex ${hex}${ln > 32 ? '…' : ''}`);
        }
      } else if (wire === 5) {
        p += 4;
      } else { break; }
    }
    console.log('');
  }
}
