import { readFileSync } from 'fs';
import { decompress } from 'qfs-compression';

const HOME = process.env.HOME;
const savePath = `${HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312030.save`;
const buf = readFileSync(savePath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

const indexCount = view.getUint32(36, true);
const indexOffset = view.getUint32(64, true);
const flags = view.getUint32(indexOffset, true);
const typeConst=(flags&1)!==0, groupConst=(flags&2)!==0, instHiConst=(flags&4)!==0;
let hp = indexOffset+4, ct=0,cg=0,ci=0;
if(typeConst){ct=view.getUint32(hp,true);hp+=4;}
if(groupConst){cg=view.getUint32(hp,true);hp+=4;}
if(instHiConst){ci=view.getUint32(hp,true);hp+=4;}
const eSize=32-(typeConst?4:0)-(groupConst?4:0)-(instHiConst?4:0);

function readVarint(b,p){let r=0n,s=0n;while(p<b.length){const x=b[p++];r|=BigInt(x&127)<<s;s+=7n;if(!(x&128))break;}return[r,p];}

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

// Search for "Ohan" and "Admiral" and "Proprietor" raw bytes
const TARGETS = ["Ohan'ali Beach", "Admiral's Wreckage", "Proprietor's Square", "Dachshund's Creek"];
for (const t of TARGETS) {
  const needle = Buffer.from(t, 'utf8');
  const idx = data0d.indexOf(needle);
  if (idx !== -1) {
    console.log(`"${t}" found at ${idx} (UTF-8 match)`);
  } else {
    // Try to find by printable chars ignoring apostrophe type
    const base = t.replace(/'/g, '').toLowerCase();
    let found = -1;
    for (let i = 0; i < data0d.length - base.length; i++) {
      const slice = Buffer.from(data0d.slice(i, i + t.length + 4)).toString('utf8').replace(/['’ʼ]/g, '').toLowerCase();
      if (slice.includes(base.slice(0,8))) { found = i; break; }
    }
    if (found !== -1) {
      const bytes = [...data0d.slice(found, found + t.length + 4)].map(b => b.toString(16).padStart(2,'0')).join(' ');
      console.log(`"${t}" NOT found as UTF-8. Nearby bytes: ${bytes}`);
    } else {
      console.log(`"${t}" not found at all`);
    }
  }
}
