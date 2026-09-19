/**
 * Check whether known pets have 0x0a stubs (the supposed human discriminator).
 * If yes, our discriminator is broken and we need a different one.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_02220000.save`;
const KNOWN_PETS = [
  { name: 'Oreo',     id: 0x0cab161e093f13c9n },
  { name: 'Harry',    id: 0x016315b7f7260d3an },
  { name: 'Cheyenne', id: 0x03bf15835bfc268fn },
  { name: 'Sheba',    id: 0x0f2715c1a5e00b65n },
  { name: 'Buddy(Wallace)', id: 0x0f971625e39b5c67n },
  { name: 'Monka',    id: 0x0f971625e39b5c6cn },
];

const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst = (flags & 0x01) !== 0, groupConst = (flags & 0x02) !== 0, instHiConst = (flags & 0x04) !== 0;
let headerPos = indexOffset + 4;
let constType = 0;
if (typeConst) { constType = view.getUint32(headerPos, true); headerPos += 4; }
if (groupConst) headerPos += 4;
if (instHiConst) headerPos += 4;
const entrySize = 32 - (typeConst?4:0) - (groupConst?4:0) - (instHiConst?4:0);

const entries = [];
let pos = headerPos;
for (let i = 0; i < indexCount; i++) {
  if (pos + entrySize > buf.length) break;
  let off = pos;
  const type = typeConst ? constType : view.getUint32(off, true); off += typeConst ? 0 : 4;
  off += groupConst ? 0 : 4;
  off += instHiConst ? 0 : 4;
  const instLo = view.getUint32(off, true); off += 4;
  const offset = view.getUint32(off, true); off += 4;
  const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
  off += 4;
  const compType = view.getUint16(off, true);
  pos += entrySize;
  entries.push({ type, instLo, offset, sizeComp, compType });
}

const dataEntry = entries.find(e => e.type === 0x0d);
let data = buf.slice(dataEntry.offset, dataEntry.offset + dataEntry.sizeComp);
if (dataEntry.compType === 0xffff) {
  const p2 = Buffer.from(data);
  if (p2[1] === 0xfb && p2[0] !== 0x10) p2[0] = 0x10;
  data = decompress(p2);
}

function readV(b, p) { let r=0n,sh=0n; while(p<b.length){const x=b[p++]; r|=BigInt(x&0x7f)<<sh; sh+=7n; if((x&0x80)===0)break;} return [r,p]; }
function readStr(b,p){const[l,n]=readV(b,p);const e=n+Number(l);return[Buffer.from(b.slice(n,e)).toString('utf8'),e];}

// Replicate scanHumanSimStubs exactly
const humanIds = new Set();
const ASCII_NAME = /^[A-Z][A-Za-z'\-. ]{0,28}$/;
const LAST_NAME_OK = /^[A-Za-z'\-. ]{0,28}$/;

for (let i = 0; i < data.length - 6; i++) {
  if (data[i] !== 0x0a) continue;
  let p = i + 1;
  const [msgLen, msgStart] = readV(data, p);
  const msgEnd = msgStart + Number(msgLen);
  if (msgLen < 4n || msgLen > 200n || msgEnd > data.length) continue;
  p = msgStart;
  if (data[p] !== 0x08) continue; p++;
  const [simId, afterId] = readV(data, p);
  if (simId === 0n || simId < 0x10000n) continue;
  p = afterId;
  if (p >= msgEnd || data[p] !== 0x12) continue; p++;
  const [first, afterFirst] = readStr(data, p);
  if (!first || first.length < 1 || first.length > 30) continue;
  p = afterFirst;
  if (p >= msgEnd || data[p] !== 0x1a) continue; p++;
  const [last] = readStr(data, p);
  if (last.length > 30) continue;
  if (!ASCII_NAME.test(first)) continue;
  if (last.length > 0 && !LAST_NAME_OK.test(last)) continue;
  if (first.includes('_') || last.includes('_')) continue;
  humanIds.add(simId);
  i = msgEnd - 1;
}

console.log(`Total IDs in 0x0a stubs (treated as humans): ${humanIds.size}\n`);

for (const pet of KNOWN_PETS) {
  const inHumans = humanIds.has(pet.id);
  console.log(`  ${pet.name.padEnd(20)} id=0x${pet.id.toString(16)}  in-humans=${inHumans ? 'YES (WRONG!)' : 'no'}`);
}
