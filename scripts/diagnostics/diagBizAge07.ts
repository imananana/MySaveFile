// Hunt for the small-business "required age: teen" criterion in Slot_00000007.
// Dumps the FULL SmallBusinessData (incl. f21) and flags the filter-base hash
// (796721156) and the teen age value (8) wherever they appear.
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const FILTER_BASE = 796721156n;

const p = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_00000007.save`;
const b = readFileSync(p);
const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
let bl: Uint8Array | null = null;
for (const r of res.filter((r) => r.type === 0x0d)) {
  const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
  if (!bl || d.length > bl.length) bl = d;
}

function dump(buf: Uint8Array, pad: string, depth: number): string {
  if (depth > 7) return pad + '…\n';
  let q = 0, s = '';
  while (q < buf.length) {
    let fn, wire, at;
    try { [fn, wire, at] = readTag(buf, q); } catch { break; }
    if (fn === 0) break;
    q = at;
    if (wire === 0) {
      const [v, n] = readVarint(buf, q); q = n;
      const flag = v === FILTER_BASE ? '   <<FILTER_BASE>>' : v === 8n ? '   <<=8 teen?>>' : '';
      s += `${pad}f${fn}=${v}${flag}\n`;
    } else if (wire === 1) {
      const v = readFixed64LE(buf, q); s += `${pad}f${fn}=x${v.toString(16)}\n`; q += 8;
    } else if (wire === 5) {
      q += 4; s += `${pad}f${fn}=fix32\n`;
    } else if (wire === 2) {
      const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l);
      const txt = new TextDecoder().decode(sub);
      if (/^[\x20-\x7e]{2,40}$/.test(txt) && /[a-zA-Z]/.test(txt)) s += `${pad}f${fn}="${txt}"\n`;
      else if (Number(l) > 0 && Number(l) < 4000) s += `${pad}f${fn}{\n${dump(sub, pad + '  ', depth + 1)}${pad}}\n`;
      else s += `${pad}f${fn} bytes(${l})\n`;
    } else break;
  }
  return s;
}

const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10);
if (!svc) { console.log('NO business service (f10)'); process.exit(0); }

for (const rec of iterLDFields(svc, 1)) {
  let id = 0n, type = 0n, wrapper: Uint8Array | null = null, pp = 0;
  while (pp < rec.length) {
    let fn, wire, at; try { [fn, wire, at] = readTag(rec, pp); } catch { break; }
    if (fn === 0) break; pp = at;
    if (wire === 0) { const [, n] = readVarint(rec, pp); pp = n; }
    else if (wire === 1) { if (fn === 1) id = readFixed64LE(rec, pp); else if (fn === 2) type = readFixed64LE(rec, pp); pp += 8; }
    else if (wire === 5) pp += 4;
    else if (wire === 2) { const [l, n] = readVarint(rec, pp); if ((fn === 3 || fn === 8) && !wrapper) wrapper = rec.slice(n, n + Number(l)); pp = n + Number(l); }
    else break;
  }
  console.log(`\n==== record id=x${id.toString(16)} type=${type} ====`);
  if (type !== 5n) { console.log('(skip, not type 5)'); continue; }
  if (!wrapper) { console.log('(no wrapper)'); continue; }
  let sb: Uint8Array | null = null, qq = 0;
  while (qq < wrapper.length) {
    let fn, wire, at; try { [fn, wire, at] = readTag(wrapper, qq); } catch { break; }
    if (fn === 0) break; qq = at;
    if (wire === 0) { const [, n] = readVarint(wrapper, qq); qq = n; }
    else if (wire === 1) qq += 8;
    else if (wire === 5) qq += 4;
    else if (wire === 2) { const [l, n] = readVarint(wrapper, qq); if (fn === 2 && !sb) sb = wrapper.slice(n, n + Number(l)); qq = n + Number(l); }
    else break;
  }
  if (!sb) { console.log('(no sbData)'); continue; }

  // Raw scan for the filter base hash anywhere in the full business record
  let hits = 0;
  for (let i = 0; i + 8 <= sb.length; i++) {
    // varint scan: check if a varint starting at i equals FILTER_BASE
  }
  // simpler: scan as we already dump; also do a byte search for the LE/varint encoding
  const needleVarint: number[] = [];
  { let v = FILTER_BASE; while (v > 0x7fn) { needleVarint.push(Number(v & 0x7fn) | 0x80); v >>= 7n; } needleVarint.push(Number(v)); }
  for (let i = 0; i + needleVarint.length <= sb.length; i++) {
    let ok = true; for (let j = 0; j < needleVarint.length; j++) if (sb[i + j] !== needleVarint[j]) { ok = false; break; }
    if (ok) hits++;
  }
  console.log(`FILTER_BASE varint occurrences in sbData: ${hits}`);
  console.log(dump(sb, '', 0));
}
