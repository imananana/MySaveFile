// READ-ONLY: enumerate RelationshipBit-class entries in base-game combined
// tuning — names + s ids — to establish the true relbit id universe.
import { readFileSync } from 'fs';
import { inflateSync, inflateRawSync } from 'zlib';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const p = '/Applications/EA Games/The Sims 4.app/Contents/Data/Simulation/SimulationFullBuild0.package';
const f = readFileSync(p);
const resources = parseDbpf(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength));
const combined = resources.filter((r) => (r.type >>> 0) === 0x62e94d38);
console.log(`${combined.length} combined-tuning resources`);
let total = 0; const samples: string[] = []; let married = '';
for (const r of combined) {
  let d: Uint8Array | null = null;
  try { d = r.compType === 0xffff ? decompressRefpack(r.data) : r.compType === 0x5a42 ? (() => { try { return inflateSync(r.data); } catch { return inflateRawSync(r.data); } })() : r.data; } catch { continue; }
  if (!d) continue;
  const txt = Buffer.from(d).toString('latin1');
  const re = /<I [^>]*c="RelationshipBit[^"]*"[^>]*>/g; let m;
  while ((m = re.exec(txt))) {
    total++;
    const nm = m[0].match(/n="([^"]+)"/); const s = m[0].match(/s="([^"]+)"/);
    const line = `${s ? s[1] : '?'} (0x${s ? BigInt(s[1]).toString(16) : '?'})  ${nm ? nm[1] : '?'}`;
    if (/ex|brok|divorc|partner|spouse|engag|marri|signific|girlfriend|boyfriend|romantic-|family_/i.test(line)) samples.push(line);
    if (nm && /romantic/i.test(nm[1]) && /marri|spouse|ex/i.test(nm[1])) married += '  ★ ' + line + '\n';
  }
}
console.log(`RelationshipBit entries: ${total}`);
console.log(samples.map((s) => '  ' + s).join('\n'));
console.log('\nmarriage/ex-related:'); console.log(married || '  (none matched)');
