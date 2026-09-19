/**
 * Lot descriptions (0x3a field 14) across saves: how many lots carry one, and
 * whether any lot's text ever differs between two saves. A field identical in
 * every save is EA's stock copy; one that differs somewhere is editable, and
 * that difference is the only evidence a player can author it.
 *
 *   npx tsx scripts/diagnostics/diagLotDescAcrossSaves.ts <saveA> <saveB> [...]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';
import { readVarint, readFixed64LE, readString } from '../../src/lib/parser/protobuf.js';

function lotDescs(path: string): Map<string, { name: string; desc: string }> {
  const b = readFileSync(path);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  let bl: Uint8Array | null = null;
  for (const r of parseDbpf(ab).filter((r) => r.type === 0x0d)) {
    const d = r.compType === 0xffff ? decompressRefpack(r.data) : r.data;
    if (!bl || d.length > bl.length) bl = d;
  }
  const buf = bl!;
  const out = new Map<string, { name: string; desc: string }>();
  for (let i = 0; i < buf.length - 12; i++) {
    if (buf[i] !== 0x3a) continue;
    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(buf, pos);
    if (msgLen < 12n || msgLen > 50000n || msgStart + Number(msgLen) > buf.length) continue;
    const msgEnd = msgStart + Number(msgLen);
    pos = msgStart;
    if (buf[pos] !== 0x09) continue;
    pos++;
    if (pos + 8 > msgEnd) continue;
    const lotId = readFixed64LE(buf, pos); pos += 8;
    if (pos >= msgEnd || buf[pos] !== 0x12) continue;
    pos++;
    const [lotName, afterName] = readString(buf, pos);
    if (!lotName || lotName.length < 3 || /^[a-z][a-z0-9_:]+$/.test(lotName)) { i = msgEnd - 1; continue; }
    let p = afterName, desc = '';
    while (p < msgEnd) {
      const tag = buf[p]; const wire = tag & 0x07; const num = tag >> 3;
      p++;
      if (num === 0) break;
      if (wire === 0) { const [, n] = readVarint(buf, p); p = n; }
      else if (wire === 1) p += 8;
      else if (wire === 2) {
        const [len, n] = readVarint(buf, p);
        if (num === 14) desc = new TextDecoder('utf-8', { fatal: false }).decode(buf.subarray(n, n + Number(len)));
        p = n + Number(len);
      }
      else if (wire === 5) p += 4;
      else break;
    }
    if (!out.has(lotId.toString(16))) out.set(lotId.toString(16), { name: lotName, desc });
    i = msgEnd - 1;
  }
  return out;
}

const paths = process.argv.slice(2);
const maps = paths.map((p) => ({ p: p.split('/').pop()!, m: lotDescs(p) }));
for (const { p, m } of maps) {
  const withDesc = [...m.values()].filter((v) => v.desc).length;
  console.log(`${p.padEnd(28)} ${m.size} lots, ${withDesc} with a description (${Math.round(withDesc / m.size * 100)}%)`);
}

const [a, ...rest] = maps;
for (const b of rest) {
  const shared = [...a.m.keys()].filter((k) => b.m.has(k));
  const diff = shared.filter((k) => a.m.get(k)!.desc !== b.m.get(k)!.desc);
  console.log(`\n${a.p} vs ${b.p}: ${shared.length} lots in both, ${diff.length} with DIFFERENT description`);
  for (const k of diff.slice(0, 8)) {
    console.log(`  "${a.m.get(k)!.name}" / "${b.m.get(k)!.name}"`);
    console.log(`      A: "${a.m.get(k)!.desc.slice(0, 110)}"`);
    console.log(`      B: "${b.m.get(k)!.desc.slice(0, 110)}"`);
  }
}
