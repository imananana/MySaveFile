/**
 * Does a lot's description (0x3a f14) ever differ between saves?
 *
 * Keyed by field5 + lot name, which identifies a lot across save lineages
 * (zone ids do not). A lot whose text is identical in every save is EA stock;
 * any lot with two different texts proves something can author them.
 *
 *   npx tsx scripts/diagnostics/diagLotDescVariance.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

const DIR = `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves`;

function lots(path: string) {
  const b = readFileSync(path);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  let bl: Uint8Array | null = null;
  for (const r of parseDbpf(ab).filter((r) => r.type === 0x0d)) {
    const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
    if (!bl || d.length > bl.length) bl = d;
  }
  const buf = bl!;
  const out: Array<{ key: string; name: string; desc: string }> = [];
  for (let i = 0; i < buf.length - 12; i++) {
    if (buf[i] !== 0x3a) continue;
    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(buf, pos);
    if (msgLen < 12n || msgLen > 50000n || msgStart + Number(msgLen) > buf.length) continue;
    const msgEnd = msgStart + Number(msgLen); pos = msgStart;
    if (buf[pos] !== 0x09) continue; pos++;
    if (pos + 8 > msgEnd) continue;
    pos += 8;
    if (pos >= msgEnd || buf[pos] !== 0x12) continue; pos++;
    const [name, afterName] = readString(buf, pos);
    if (!name || name.length < 3 || /^[a-z][a-z0-9_:]+$/.test(name)) { i = msgEnd - 1; continue; }
    let p = afterName, desc = '', f5 = '';
    while (p < msgEnd) {
      const tag = buf[p]; const wire = tag & 0x07; const num = tag >> 3;
      p++;
      if (num === 0) break;
      if (wire === 0) { const [v, n] = readVarint(buf, p); if (num === 5) f5 = v.toString(); p = n; }
      else if (wire === 1) p += 8;
      else if (wire === 2) {
        const [len, n] = readVarint(buf, p);
        if (num === 14) desc = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(n, n + Number(len)));
        p = n + Number(len);
      }
      else if (wire === 5) p += 4;
      else break;
    }
    out.push({ key: `${f5}::${name}`, name, desc });
    i = msgEnd - 1;
  }
  return out;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.save'))
  .map((f) => ({ f, m: statSync(`${DIR}/${f}`).mtimeMs })).sort((a, b) => a.m - b.m);

const seen = new Map<string, Map<string, string[]>>(); // key -> desc -> saves
let ok = 0;
for (const { f } of files) {
  try {
    for (const l of lots(`${DIR}/${f}`)) {
      const byDesc = seen.get(l.key) ?? new Map<string, string[]>();
      const arr = byDesc.get(l.desc) ?? [];
      arr.push(f.replace('.save', '')); byDesc.set(l.desc, arr); seen.set(l.key, byDesc);
    }
    ok++;
  } catch { /* skip */ }
}

const varying = [...seen.entries()].filter(([, byDesc]) => byDesc.size > 1);
console.log(`${ok} saves read, ${seen.size} distinct lots.`);
console.log(`Lots whose description text VARIES between saves: ${varying.length}\n`);
for (const [key, byDesc] of varying.slice(0, 10)) {
  console.log(`  ${key.split('::')[1]}`);
  for (const [desc, saves] of byDesc) {
    console.log(`     [${saves.length}] ${saves.slice(0, 4).join(', ')}${saves.length > 4 ? ', …' : ''}`);
    console.log(`         ${desc ? `"${desc.slice(0, 80)}"` : '(empty)'}`);
  }
}
