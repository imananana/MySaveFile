/**
 * Run classifyHousehold on every household in a save and print the Yours/EA/Mod
 * distribution + sub-labels + examples. Tests the classifier on real data with
 * no UI / DB / import — exactly what the household Manager will eventually show.
 *
 *   server/node_modules/.bin/tsx scripts/diagnostics/provenanceDist.ts [save]
 */
import { readFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { parseSaveData } from '../../src/lib/saveParser.js';
import { classifyHousehold } from '../../src/lib/parser/provenance.js';

const savePath = process.argv[2] || `${process.env.HOME}/Documents/Electronic Arts/The Sims 4/saves/Slot_12345673.save`;
const file = readFileSync(savePath);
const resources = parseDbpf(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
const data = parseSaveData(resources);
const simsById = new Map(data.sims.map((s) => [s.id, s]));

const byBucketSub = new Map<string, number>();
const examples: Record<string, string[]> = {};
for (const hh of data.households) {
  const o = classifyHousehold(hh, simsById, data.ownerAccountId);
  const key = `${o.bucket} / ${o.sub}`;
  byBucketSub.set(key, (byBucketSub.get(key) ?? 0) + 1);
  (examples[key] ??= []).push(hh.name + (o.creator ? ` [by ${o.creator}]` : ''));
}

console.log(`Save: ${savePath.split('/').pop()} — ${data.households.length} households, owner acct ${data.ownerAccountId ?? 'unknown'}\n`);
console.log('bucket / sub-label           count   examples');
for (const [key, n] of [...byBucketSub].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key.padEnd(26)} ${String(n).padStart(4)}   ${examples[key].slice(0, 3).join(', ')}`);
}
