/**
 * Compares 0x2a lot IDs vs 0x3a lot IDs vs household 0x21 lot IDs
 * for the same lots, to see if they match.
 */
import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const HOME = process.env.HOME;
const savePath = process.argv[2] || `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312030.save`;
const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst=(flags&1)!==0,groupConst=(flags&2)!==0,instHiConst=(flags&4)!==0;
let hp=indexOffset+4,ct=0,cg=0,ci=0;
if(typeConst){ct=view.getUint32(hp,true);hp+=4;}
if(groupConst){cg=view.getUint32(hp,true);hp+=4;}
if(instHiConst){ci=view.getUint32(hp,true);hp+=4;}
const eSize=32-(typeConst?4:0)-(groupConst?4:0)-(instHiConst?4:0);

function readVarint(b,p){let r=0n,s=0n;while(p<b.length){const x=b[p++];r|=BigInt(x&127)<<s;s+=7n;if(!(x&128))break;}return[r,p];}
function readFixed64LE(b,p){let lo=0n,hi=0n;for(let i=0;i<4;i++)lo|=BigInt(b[p+i])<<BigInt(i*8);for(let i=0;i<4;i++)hi|=BigInt(b[p+4+i])<<BigInt(i*8);return lo|(hi<<32n);}
function readString(b,p){const[l,n]=readVarint(b,p);return[Buffer.from(b.slice(n,n+Number(l))).toString('utf8'),n+Number(l)];}

let pos=hp, data0d=null;
for(let i=0;i<indexCount;i++){
  if(pos+eSize>buf.length)break;
  let off=pos;
  const type=typeConst?ct:view.getUint32(off,true);off+=typeConst?0:4;
  off+=groupConst?0:4;off+=instHiConst?0:4;off+=4;
  const offset=view.getUint32(off,true);off+=4;
  const sc=view.getUint32(off,true)&0x7fffffff;off+=4;off+=4;
  const ctype=view.getUint16(off,true);
  pos+=eSize;
  if(type!==0x0d)continue;
  let raw=buf.slice(offset,offset+sc);
  if(ctype===0xffff){const p=Buffer.from(raw);if(p[1]===0xfb&&p[0]!==0x10)p[0]=0x10;raw=decompress(p);}
  data0d=raw;break;
}

const TARGETS = new Set(['Cypress Terrace', 'Bargain Bend', 'Ophelia Villa', 'Oakenstead']);

// Scan 0x2a records (residential, has lotId in 0x11)
const lots2a = new Map(); // name → lotId
for(let i=0;i<data0d.length-12;i++){
  if(data0d[i]!==0x2a)continue;
  let pos=i+1;
  const[ml,ms]=readVarint(data0d,pos);if(ml<12n||ml>50000n)continue;
  const me=ms+Number(ml);if(me>data0d.length)continue;pos=ms;
  if(data0d[pos]!==0x08)continue;pos++;
  const[,af]=readVarint(data0d,pos);pos=af;
  if(pos+9>me)continue;
  if(data0d[pos]!==0x11)continue;pos++;
  const lotId=readFixed64LE(data0d,pos);pos+=8;
  if(pos>=me)continue;
  if(data0d[pos]!==0x1a)continue;pos++;
  const[name]=readString(data0d,pos);
  if(TARGETS.has(name))lots2a.set(name,lotId);
  i=me-1;
}

// Scan 0x3a records (all lots, field1 in 0x09)
const lots3a = new Map(); // name → id
for(let i=0;i<data0d.length-12;i++){
  if(data0d[i]!==0x3a)continue;
  let pos=i+1;
  const[ml,ms]=readVarint(data0d,pos);if(ml<12n||ml>50000n)continue;
  const me=ms+Number(ml);if(me>data0d.length)continue;pos=ms;
  if(data0d[pos]!==0x09)continue;pos++;
  if(pos+8>me)continue;
  const id=readFixed64LE(data0d,pos);pos+=8;
  if(pos>=me||data0d[pos]!==0x12)continue;pos++;
  const[name]=readString(data0d,pos);
  if(TARGETS.has(name))lots3a.set(name,id);
  i=me-1;
}

// Scan household records for lot IDs (0x21)
const hhLots = []; // {hhName, lotId}
for(let i=0;i<data0d.length-40;i++){
  if(data0d[i]!==0x09)continue;
  if(i+9>=data0d.length||data0d[i+9]!==0x11)continue;
  let pos=i+10;
  if(pos+8>data0d.length)continue;
  const hhId=readFixed64LE(data0d,pos);pos+=8;
  if(pos>=data0d.length||data0d[pos]!==0x1a)continue;pos++;
  const[name,afterName]=readString(data0d,pos);
  if(!name||name.length<2||name.length>60||!/^[\x20-\x7e]+$/.test(name)||name.includes('_'))continue;
  pos=afterName;
  if(pos>=data0d.length||data0d[pos]!==0x21)continue;pos++;
  if(pos+8>data0d.length)continue;
  const lotId=readFixed64LE(data0d,pos);
  if(lotId!==0n)hhLots.push({hhName:name,lotId});
}

console.log('=== 0x2a lot IDs (runtime session IDs) ===');
for(const[name,id]of lots2a)console.log(`  "${name}": 0x${id.toString(16).padStart(16,'0')}`);

console.log('\n=== 0x3a lot IDs (field 1 from 0x09) ===');
for(const[name,id]of lots3a)console.log(`  "${name}": 0x${id.toString(16).padStart(16,'0')}`);

console.log('\n=== Household → lot assignments ===');
for(const h of hhLots.slice(0,20))console.log(`  "${h.hhName}" → lotId=0x${h.lotId.toString(16).padStart(16,'0')}`);

console.log('\n=== Cross-reference check ===');
for(const[name,id2a]of lots2a){
  const id3a=lots3a.get(name);
  const match=id3a===id2a;
  console.log(`  "${name}": 0x2a=${id2a.toString(16)} / 0x3a=${id3a?.toString(16)} → MATCH=${match}`);
}
