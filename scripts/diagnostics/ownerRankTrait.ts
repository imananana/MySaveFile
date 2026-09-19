import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanHumanSimStubs, scanFullSimAnchors } from '../../src/lib/parser/sims.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const sims = scanFullSimAnchors(bl!, scanHumanSimStubs(bl!));
const RANK: Record<string, bigint> = { Rank_0:0x5FC53n, Rank_1:0x5B5EEn, Rank_2:0x5B5EFn, Rank_3:0x5B5F0n, Rank_4:0x5B5F1n, Rank_5:0x5B5EDn };
const HASBEEN: Record<string, bigint> = { HasBeen_1:0x5BE69n, HasBeen_2:0x5BE6An, HasBeen_4:0x5BE6Cn, HasBeen_5:0x5BE95n, HasBeen_6:0x5BE96n };
for (const s of sims) {
  const hasRank = Object.entries(RANK).filter(([,id]) => s.traitIds.includes(id)).map(([n])=>n);
  const hasBeen = Object.entries(HASBEEN).filter(([,id]) => s.traitIds.includes(id)).map(([n])=>n);
  if (hasRank.length || hasBeen.length) console.log(`${s.firstName} ${s.lastName} (x${s.id.toString(16)}): RANK=[${hasRank.join(',')}] HASBEEN=[${hasBeen.join(',')}] (total ${s.traitIds.length} traits)`);
}
console.log('--- done; if empty, rank traits are filtered out of traitIds (hidden) ---');
