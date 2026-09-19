// List clubs across saves; dump the RAW protobuf field tree of club records so
// we can find where membership rules + encouraged/discouraged activities live.
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { findLDField, iterLDFields, readTag, readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { scanClubs } from '../../src/lib/parser/clubs.js';

const DIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const NEEDLE = (process.argv[2] || '').toLowerCase();
const printable = (s: string) => /^[\x20-\x7e]{2,}$/.test(s) && /[a-zA-Z]/.test(s);

function blobOf(path: string): Uint8Array | null {
  try {
    const b = readFileSync(path);
    const res = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    let blob: Uint8Array | null = null;
    for (const r of res.filter((r) => r.type === 0x0d)) { const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data; if (!blob || d.length > blob.length) blob = d; }
    return blob;
  } catch { return null; }
}

function dump(buf: Uint8Array, depth: number, maxDepth = 5) {
  const pad = '  '.repeat(depth);
  let p = 0;
  while (p < buf.length) {
    let fn: number, wire: number, afterTag: number;
    try { [fn, wire, afterTag] = readTag(buf, p); } catch { break; }
    if (fn === 0) break; p = afterTag;
    if (wire === 0) { const [v, n] = readVarint(buf, p); p = n; console.log(`${pad}f${fn} varint=${v}`); }
    else if (wire === 1) { console.log(`${pad}f${fn} fix64=0x${readFixed64LE(buf, p).toString(16)}`); p += 8; }
    else if (wire === 5) { p += 4; console.log(`${pad}f${fn} fix32`); }
    else if (wire === 2) {
      const [l, n] = readVarint(buf, p); const ln = Number(l); const sub = buf.slice(n, n + ln); p = n + ln;
      const str = new TextDecoder().decode(sub);
      if (printable(str) && str.length <= 60) console.log(`${pad}f${fn} str="${str}"`);
      else if (depth < maxDepth && ln > 0 && ln < 8000) { console.log(`${pad}f${fn} msg(${ln}b):`); dump(sub, depth + 1, maxDepth); }
      else console.log(`${pad}f${fn} bytes(${ln})`);
    } else break;
  }
}

for (const f of readdirSync(DIR).filter((x) => x.endsWith('.save'))) {
  const blob = blobOf(`${DIR}/${f}`);
  if (!blob) continue;
  const clubs = scanClubs(blob);
  if (!clubs.length) continue;
  const named = clubs.filter((c) => c.name);
  console.log(`\n#### ${f}: ${clubs.length} clubs (${named.length} named): ${named.map((c) => c.name).slice(0, 8).join(', ')}`);
  // dump raw tree for the first named club matching NEEDLE (or first named club)
  const saveSlot = findLDField(blob, 2)!; const gameSlot = findLDField(saveSlot, 8)!; const clubSvc = findLDField(gameSlot, 7)!;
  for (const clubBytes of iterLDFields(clubSvc, 3)) {
    const c = scanClubs(blob).find(() => true); // placeholder
    // find name quickly
    const nameMatch = (() => { let p = 0; while (p < clubBytes.length) { let fn, wire, at; try { [fn, wire, at] = readTag(clubBytes, p); } catch { return null; } if (fn === 0) break; p = at; if (wire === 2) { const [l, n] = readVarint(clubBytes, p); const s = clubBytes.slice(n, n + Number(l)); p = n + Number(l); if (fn === 2) return new TextDecoder().decode(s); } else if (wire === 0) { const [, n] = readVarint(clubBytes, p); p = n; } else if (wire === 1) p += 8; else if (wire === 5) p += 4; else return null; } return null; })();
    if (!nameMatch) continue;
    if (NEEDLE && !nameMatch.toLowerCase().includes(NEEDLE)) continue;
    console.log(`\n=== RAW club "${nameMatch}" (${clubBytes.length}b) ===`);
    dump(clubBytes, 0);
    break;
  }
}
