/* Dump the RAW protobuf tree of a custom venue record to find where activity
 * ids live. Run: npx tsx scripts/diagnostics/diagVenueActivities.ts [nameSubstr]  */
import { readFileSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE } from '../../src/lib/parser/protobuf.js';
import { STOCK_ACTIVITIES } from '../../src/data/stockActivities.js';

const NEEDLE = (process.argv[2] || 'Teen After School').toLowerCase();
const DIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;
const SAVES = readdirSync(DIR).filter(f => f.endsWith('.save')).map(f => `${DIR}/${f}`);

function blobOf(path: string): Uint8Array {
  const b = readFileSync(path);
  const r = parseDbpf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)).find(x => x.type === 0x0d)!;
  return r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
}

const act = (id: number) => STOCK_ACTIVITIES[String(id)]?.name ?? `?${id}`;
const printable = (s: string) => /^[\x20-\x7e]+$/.test(s) && !/^[a-z][a-z0-9_:]+$/.test(s);

// recursive pretty-print of a protobuf message
function dump(buf: Uint8Array, depth: number, maxDepth = 6): void {
  const pad = '  '.repeat(depth);
  let p = 0;
  while (p < buf.length) {
    const [tag, a1] = readVarint(buf, p); const fn = Number(tag >> 3n), wire = Number(tag & 7n);
    if (fn === 0) break; p = a1;
    if (wire === 0) { const [v, n] = readVarint(buf, p); p = n;
      const hint = (v >= 1000 && v < 9_000_000 && STOCK_ACTIVITIES[String(v)]) ? `  <ACTIVITY ${act(Number(v))}>` : '';
      console.log(`${pad}f${fn} varint = ${v}${hint}`); }
    else if (wire === 1) { console.log(`${pad}f${fn} fixed64 = ${readFixed64LE(buf, p)}`); p += 8; }
    else if (wire === 2) { const [l, n] = readVarint(buf, p); const end = n + Number(l); const sub = buf.slice(n, end); p = end;
      const str = new TextDecoder().decode(sub);
      if (printable(str) && str.length >= 2) { console.log(`${pad}f${fn} str = "${str}"`); }
      else if (depth < maxDepth && sub.length > 0) { console.log(`${pad}f${fn} msg (${sub.length}b):`); dump(sub, depth + 1, maxDepth); }
      else { console.log(`${pad}f${fn} bytes(${sub.length})`); }
    } else if (wire === 5) { p += 4; console.log(`${pad}f${fn} fixed32`); }
    else break;
  }
}

for (const path of SAVES) {
  let blob: Uint8Array;
  try { blob = blobOf(path); } catch { continue; }
  for (let i = 0; i < blob.length - 4; i++) {
    if (blob[i] !== 0xc2 || blob[i + 1] !== 0x01) continue;
    const [len, after] = readVarint(blob, i + 2); const ln = Number(len);
    if (ln < 4 || ln > 200000 || after + ln > blob.length || blob[after] !== 0x0a) continue;
    const nameLen = blob[after + 1];
    const name = new TextDecoder().decode(blob.slice(after + 2, after + 2 + nameLen));
    if (!printable(name) || !name.toLowerCase().includes(NEEDLE)) { i = after + ln - 1; continue; }
    console.log(`\n=== "${name}" in ${path.split('/').pop()} (body ${ln}b) ===`);
    dump(blob.slice(after, after + ln), 0);
    i = after + ln - 1;
  }
}
