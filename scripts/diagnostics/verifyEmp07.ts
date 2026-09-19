import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { scanSmallBusinesses } from '../../src/lib/parser/smallBusinesses.js';
import { scanHumanSimStubs, scanFullSimAnchors } from '../../src/lib/parser/sims.js';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const sims = scanFullSimAnchors(bl!, scanHumanSimStubs(bl!));
const nm = (id: bigint|null) => { if(id==null)return 'null'; const s=sims.find(x=>x.id===id); return s?`${s.firstName} ${s.lastName}`:`x${id.toString(16)}`; };
for (const biz of scanSmallBusinesses(bl!)) {
  if (biz.name !== 'Tester Business') continue;
  console.log('owner    :', nm(biz.ownerSimId));
  console.log('employees:', biz.employeeSimIds.map(nm).join(', ') || '(none)');
}
