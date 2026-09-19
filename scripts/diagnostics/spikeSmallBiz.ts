// Dump SmallBusinessData (wrapper.f2) for configured businesses, flagging values
// that match small-business perk traits / seed (business-type) ids, to locate
// the deeper-config fields (perks, type, employees, policies).
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';

const TDIR = `${process.env.HOME}/Documents/Small Business`;
const label = new Map<string, string>();
for (const f of readdirSync(TDIR)) {
  const m = f.match(/!0*([0-9A-Fa-f]+)\.([^.]+)\.(TraitTuning|SmallBusinessSeedTuning|StatisticTuning)\.xml$/);
  if (m) label.set('0x' + m[1].toLowerCase(), m[2]);
}
const tag = (v: bigint) => label.get('0x' + v.toString(16)) ? ` <<${label.get('0x' + v.toString(16))}>>` : '';

const p = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_10312029.save`;
const b = readFileSync(p); const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
let bl: Uint8Array | null = null; for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
function dump(buf: Uint8Array, pad: string, depth: number): string { if (depth > 4) return pad + '…\n'; let q = 0, s = ''; while (q < buf.length) { let fn, wire, at; try { [fn, wire, at] = readTag(buf, q); } catch { break; } if (fn === 0) break; q = at; if (wire === 0) { const [v, n] = readVarint(buf, q); q = n; s += `${pad}f${fn}=${v}${tag(v)}\n`; } else if (wire === 1) { const v = readFixed64LE(buf, q); s += `${pad}f${fn}=x${v.toString(16)}${tag(v)}\n`; q += 8; } else if (wire === 5) q += 4; else if (wire === 2) { const [l, n] = readVarint(buf, q); const sub = buf.slice(n, n + Number(l)); q = n + Number(l); const txt = new TextDecoder().decode(sub); if (/^[\x20-\x7e]{2,40}$/.test(txt) && /[a-zA-Z]/.test(txt)) s += `${pad}f${fn}="${txt}"\n`; else if (Number(l) > 0 && Number(l) < 4000) s += `${pad}f${fn}{\n${dump(sub, pad + '  ', depth + 1)}${pad}}\n`; else s += `${pad}f${fn} bytes(${l})\n`; } else break; } return s; }

const ss = findLDField(bl!, 2)!; const gs = findLDField(ss, 8)!; const svc = findLDField(gs, 10)!;
let shown = 0;
for (const rec of iterLDFields(svc, 1)) {
  // navigate to sbData = wrapper(f3|f8).f2
  let wrapper: Uint8Array | null = null; let pp = 0;
  while (pp < rec.length) { let fn, wire, at; try { [fn, wire, at] = readTag(rec, pp); } catch { break; } if (fn === 0) break; pp = at; if (wire === 0) { const [, n] = readVarint(rec, pp); pp = n; } else if (wire === 1) pp += 8; else if (wire === 5) pp += 4; else if (wire === 2) { const [l, n] = readVarint(rec, pp); if ((fn === 3 || fn === 8) && !wrapper) wrapper = rec.slice(n, n + Number(l)); pp = n + Number(l); } else break; }
  if (!wrapper) continue;
  let sb: Uint8Array | null = null; let qq = 0;
  while (qq < wrapper.length) { let fn, wire, at; try { [fn, wire, at] = readTag(wrapper, qq); } catch { break; } if (fn === 0) break; qq = at; if (wire === 0) { const [, n] = readVarint(wrapper, qq); qq = n; } else if (wire === 1) qq += 8; else if (wire === 5) qq += 4; else if (wire === 2) { const [l, n] = readVarint(wrapper, qq); if (fn === 2 && !sb) sb = wrapper.slice(n, n + Number(l)); qq = n + Number(l); } else break; }
  if (!sb) continue;
  // get name from f21.f5
  const inner = findLDField(sb, 21); let nm = '?'; if (inner) { let r = 0; while (r < inner.length) { let fn, wire, at; try { [fn, wire, at] = readTag(inner, r); } catch { break; } if (fn === 0) break; r = at; if (wire === 2) { const [l, n] = readVarint(inner, r); if (fn === 5) nm = new TextDecoder().decode(inner.slice(n, n + Number(l))); r = n + Number(l); } else if (wire === 0) { const [, n] = readVarint(inner, r); r = n; } else if (wire === 1) r += 8; else if (wire === 5) r += 4; else break; } }
  if (nm === '?' || shown >= 2) continue;
  console.log(`\n######## "${nm}" SmallBusinessData (outer, f21 inner collapsed):`);
  // dump outer but skip f21 (already parsed) to focus on deeper config
  console.log(dump(sb, '', 0).split('\n').filter(l => !/^f21/.test(l)).join('\n'));
  shown++;
}
