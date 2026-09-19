// PROOF OF CONCEPT: classify save sims as premade / townie / player-created by matching
// the sim's last-name STBL key (save f56) against the premade-template catalog
// (~/Documents/Sim Template/premadeSimTemplate_*.xml → specify_last_name key).
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

// ---- 1. build catalog: last_name_key (number) -> set of premade display surnames ----
const TPL_DIR = `${process.env.HOME}/Documents/Sim Template`;
const lastNameKey = new Map<number, Set<string>>();   // key -> surnames
const fullCatalog: { name: string; first?: string; lastKey?: number; lastLabel?: string }[] = [];
for (const f of readdirSync(TPL_DIR)) {
  if (!/premadeSimTemplate/i.test(f)) continue;
  const xml = readFileSync(`${TPL_DIR}/${f}`, 'utf8');
  const nameM = f.match(/premadeSimTemplate_([^.]*)\./);
  const lnM = xml.match(/<T n="specify_last_name">0x([0-9A-Fa-f]+)<!--([^>]*)--><\/T>/);
  const fnM = xml.match(/<T n="first_name">0x[0-9A-Fa-f]+<!--([^>]*)--><\/T>/);
  if (lnM) {
    const key = parseInt(lnM[1], 16); const label = lnM[2];
    if (!lastNameKey.has(key)) lastNameKey.set(key, new Set());
    lastNameKey.get(key)!.add(label);
    fullCatalog.push({ name: nameM?.[1] ?? f, first: fnM?.[1], lastKey: key, lastLabel: label });
  }
}
console.log(`Catalog: ${fullCatalog.length} premade templates with a fixed last-name key; ${lastNameKey.size} distinct surname keys.\n`);

// ---- 2. scan save sims, read f56 (last_name key) + names ----
const save = process.argv[2] ?? 'Slot_1239123c.save';
const b = readFileSync(`${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/${save}`);
const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = parseDbpf(ab); let bl: Uint8Array | null = null;
for (const r of res.filter(r => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!bl || d.length > bl.length) bl = d; }
const buf = bl!; const seen = new Set<bigint>();
let premade = 0, townie = 0, player = 0; const premadeHits: string[] = [];
for (let i = 0; i + 40 < buf.length; i++) {
  if (buf[i] !== 0x09) continue;
  const simId = readFixed64LE(buf, i + 1); let p = i + 9;
  if (buf[p] !== 0x11) continue; p++; p += 8;
  if (buf[p] !== 0x18) continue; p++; let ts, n; try { [ts, n] = readVarint(buf, p); } catch { continue; } p = n;
  if (buf[p] !== 0x21) continue; p++; p += 8;
  if (buf[p] !== 0x2a) continue; p++; let first, last = ''; try { [first, p] = readString(buf, p); } catch { continue; }
  if (!/^[\x20-\x7e]{0,40}$/.test(first)) continue;
  if (buf[p] === 0x32) { p++; try { [last, p] = readString(buf, p); } catch { last = ''; } }
  if (buf[p] !== 0x38) continue;
  if (simId === 0n || seen.has(simId)) continue; seen.add(simId);
  // walk body for f56
  let q = p, f56 = -1, g = 0;
  while (q < buf.length && g++ < 3000) { if (buf[q] === 0) break; let t, nn; try { [t, nn] = readVarint(buf, q); } catch { break; } q = nn; const fn = Number(t >> 3n), wt = Number(t & 7n); if (wt === 0) { const [v, x] = readVarint(buf, q); q = x; if (fn === 56) { f56 = Number(v); break; } } else if (wt === 1) q += 8; else if (wt === 2) { const [l, x] = readVarint(buf, q); q = x + Number(l); } else if (wt === 5) q += 4; else break; if (fn > 56) break; }
  if (f56 === 0) { player++; }
  else if (f56 > 0 && lastNameKey.has(f56)) { premade++; if (premadeHits.length < 40) premadeHits.push(`${first} ${last}  → catalog surname "${[...lastNameKey.get(f56)!].join('/')}"`); }
  else { townie++; }
}
console.log(`${save}: ${seen.size} sims classified by f56 (last-name STBL key):`);
console.log(`   PREMADE (f56 in catalog):   ${premade}`);
console.log(`   townie (f56≠0, not catalog): ${townie}`);
console.log(`   player-named (f56=0):        ${player}`);
console.log(`\nSample premade matches:`);
for (const h of premadeHits) console.log(`   ${h}`);
