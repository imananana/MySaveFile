import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanHumanSimStubs, scanFullSimAnchors } from '../../src/lib/parser/sims.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const sims = scanFullSimAnchors(bl!, scanHumanSimStubs(bl!));
const ALIGN: Record<string, bigint> = { '1_Schemer':0x5BE12n,'2_Schemer':0x5BE13n,'3_Schemer':0x5BE14n,'4_Neutral':0x5BE15n,'5_Dreamer':0x5BE16n,'6_Dreamer':0x5BE17n,'7_Dreamer':0x5BE11n,'UltSchemer':0x62B63n,'UltDreamer':0x62B62n };
for (const s of sims) {
  const hit = Object.entries(ALIGN).filter(([,id]) => s.traitIds.includes(id)).map(([n])=>n);
  if (hit.length) console.log(`${s.firstName} ${s.lastName}: [${hit.join(', ')}]`);
}
