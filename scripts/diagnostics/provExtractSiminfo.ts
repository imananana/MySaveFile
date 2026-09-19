// Extract premade .siminfo resources (type 0x025ED6F4) from the game packages,
// matched to the resource_keys in ~/Documents/Sim Template/*.xml.
// POC mode (default): scan base-game client packages for a few known sims & dump structure.
// Full mode (argv[2]=="all"): scan ALL packages, write every matched .siminfo to OUT_DIR.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { inflateSync } from 'zlib';

const SIMINFO_TYPE = 0x025ED6F4;
const TPL_DIR = `${process.env.HOME}/Documents/Sim Template`;
const OUT_DIR = `${process.env.HOME}/Documents/Premade SimInfo`;

// ---- build wanted map: instance (BigInt) -> premade template name ----
const wanted = new Map<bigint, string>();
for (const f of readdirSync(TPL_DIR)) {
  if (!f.endsWith('.xml')) continue;
  const xml = readFileSync(`${TPL_DIR}/${f}`, 'utf8');
  // resource_key value like 025ed6f4:00000000:e3a451143d38d475
  const m = xml.match(/n="resource_key"[^>]*>([0-9a-fA-F]{8}):([0-9a-fA-F]{8}):([0-9a-fA-F]{16})</);
  if (m && parseInt(m[1], 16) === SIMINFO_TYPE) {
    const inst = BigInt('0x' + m[3]);
    wanted.set(inst, f.replace(/^.*?\.([^.]+)\.SimTemplateTuning.*/, '$1'));
  }
}
console.log(`Catalog: ${wanted.size} templates reference a .siminfo (type 0x025ED6F4).`);

// ---- lean DBPF index reader (metadata only, no data copy) ----
function indexEntries(buf: Buffer) {
  if (buf.toString('latin1', 0, 4) !== 'DBPF') return [];
  const indexCount = buf.readUInt32LE(36);
  const indexOffset = buf.readUInt32LE(64);
  const flags = buf.readUInt32LE(indexOffset);
  let hp = indexOffset + 4;
  let cT = 0, cG = 0, cHi = 0;
  if (flags & 1) { cT = buf.readUInt32LE(hp); hp += 4; }
  if (flags & 2) { cG = buf.readUInt32LE(hp); hp += 4; }
  if (flags & 4) { cHi = buf.readUInt32LE(hp); hp += 4; }
  const entrySize = 32 - ((flags & 1) ? 4 : 0) - ((flags & 2) ? 4 : 0) - ((flags & 4) ? 4 : 0);
  const out: { type: number; instHi: number; instLo: number; offset: number; sizeComp: number; compType: number }[] = [];
  let pos = hp;
  for (let i = 0; i < indexCount; i++) {
    if (pos + entrySize > buf.length) break;
    let off = pos;
    const type = (flags & 1) ? cT : buf.readUInt32LE(off); off += (flags & 1) ? 0 : 4;
    /* group */ off += (flags & 2) ? 0 : 4;
    const instHi = (flags & 4) ? cHi : buf.readUInt32LE(off); off += (flags & 4) ? 0 : 4;
    const instLo = buf.readUInt32LE(off); off += 4;
    const offset = buf.readUInt32LE(off); off += 4;
    const sizeComp = buf.readUInt32LE(off) & 0x7fffffff; off += 4;
    /* sizeDecomp */ off += 4;
    const compType = buf.readUInt16LE(off);
    out.push({ type, instHi, instLo, offset, sizeComp, compType });
    pos += entrySize;
  }
  return out;
}
function decode(data: Buffer, compType: number): Buffer {
  if (compType === 0xffff) return Buffer.from(decompressRefpack(data));
  if (compType === 0x5a42) return inflateSync(data);
  return data;
}

const mode = process.argv[2] ?? 'poc';
// .siminfo lives in (Client|Simulation)(Full|Delta)Build packages. Delta overrides Full
// (patched/current), so process Full first then Delta last → Delta wins on overwrite.
const PKG_RE = /(Client|Simulation)(Full|Delta)Build\d*\.package$/i;
const walk = (d: string, acc: string[]) => { try { for (const e of readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p, acc); else if (PKG_RE.test(e.name)) acc.push(p); } } catch { /* */ } };
let packages: string[] = [];
if (mode === 'all') {
  walk(`/Applications/EA Games/The Sims 4.app/Contents/Data`, packages);
  walk(`/Applications/EA Games/The Sims 4 Packs`, packages);
  mkdirSync(OUT_DIR, { recursive: true });
} else {
  walk(`/Applications/EA Games/The Sims 4.app/Contents/Data`, packages);
}
packages.sort((a, b) => (/Delta/i.test(a) ? 1 : 0) - (/Delta/i.test(b) ? 1 : 0)); // Full before Delta
console.log(`Scanning ${packages.length} package(s) in ${mode} mode…\n`);

let found = 0; const foundNames: string[] = []; let firstDumped = false;
for (const pkg of packages) {
  let buf: Buffer;
  try { buf = readFileSync(pkg); } catch { continue; }
  for (const e of indexEntries(buf)) {
    if (e.type !== SIMINFO_TYPE) continue;
    const inst = (BigInt(e.instHi) << 32n) | BigInt(e.instLo >>> 0);
    const name = wanted.get(inst);
    if (!name) continue;
    found++; foundNames.push(name);
    const raw = buf.subarray(e.offset, e.offset + e.sizeComp);
    let data: Buffer; try { data = decode(raw, e.compType); } catch { continue; }
    if (mode === 'all') writeFileSync(`${OUT_DIR}/${name}.siminfo`, data);
    else if (!firstDumped && /Goth/.test(name)) {
      firstDumped = true;
      console.log(`=== ${name}.siminfo  (inst=0x${inst.toString(16)}, ${data.length} bytes, comp=0x${e.compType.toString(16)}) ===`);
      // walk top-level protobuf fields
      let p = 0, c = 0;
      while (p < data.length && c < 40) {
        if (data[p] === 0) break; let tag: bigint, n: number; try { [tag, n] = readVarint(data, p); } catch { break; }
        p = n; const fn = Number(tag >> 3n), wt = Number(tag & 7n);
        if (wt === 0) { const [v, x] = readVarint(data, p); p = x; console.log(`   f${fn}/v0 = ${v}${v > 0xffffn ? ' (0x' + v.toString(16) + ')' : ''}`); }
        else if (wt === 1) { const v = readFixed64LE(data, p); p += 8; console.log(`   f${fn}/f64 = 0x${v.toString(16)}`); }
        else if (wt === 2) { const [l, x] = readVarint(data, p); const len = Number(l); const s = data.subarray(x, x + len); const txt = len > 0 && len < 40 && [...s].every(ch => ch >= 0x20 && ch <= 0x7e); console.log(`   f${fn}/len${len}${txt ? ' "' + s.toString('latin1') + '"' : ''}`); p = x + len; }
        else if (wt === 5) { p += 4; console.log(`   f${fn}/f32`); } else break;
        c++;
      }
      console.log('');
    }
  }
}
console.log(`Found ${found} matching .siminfo across the scanned packages.`);
if (mode === 'poc') console.log(`Sample names: ${[...new Set(foundNames)].slice(0, 20).join(', ')}`);
else console.log(`Wrote ${found} files to ${OUT_DIR} (catalog had ${wanted.size}).`);
