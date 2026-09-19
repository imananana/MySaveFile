/**
 * One-off: find the SimData GROUP code for the Statistic/Skill class, the way
 * GROUP_CAREER was found. Scans the base-game packages for SimData resources
 * (type 0x545AC67A) whose instance matches a known base skill id, and reports
 * the group histogram. The dominant group = GROUP_SKILL.
 *
 * Usage: npx tsx scripts/diagnostics/findSkillGroup.ts
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';

const BASE_DATA = '/Applications/EA Games/The Sims 4.app/Contents/Data/Client';
const TUNING_TYPE = 0x545AC67A;

// Known base-game skills (id → name) to fingerprint the class group.
const KNOWN: Record<string, string> = {
  '0x4142': 'Logic',
  '0x413b': 'Charisma',
  '0x4141': 'Cooking',
  '0x4113': 'Fitness',
  '0x4140': 'Handiness',
  '0x413a': 'Comedy',
  '0x413d': 'Gardening',
};

function instanceHex(instHi: number, instLo: number): string {
  if (instHi === 0) return '0x' + instLo.toString(16);
  return '0x' + instHi.toString(16).padStart(8, '0') + instLo.toString(16).padStart(8, '0');
}

const groupHist = new Map<number, { count: number; hits: string[] }>();

const files = readdirSync(BASE_DATA).filter((f) => f.startsWith('Client') && f.endsWith('.package'));
for (const f of files) {
  const path = `${BASE_DATA}/${f}`;
  if (!existsSync(path)) continue;
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const resources = parseDbpf(ab);
  for (const r of resources) {
    if (r.type !== TUNING_TYPE) continue;
    const hex = instanceHex(r.instHi, r.instLo);
    if (KNOWN[hex]) {
      if (!groupHist.has(r.group)) groupHist.set(r.group, { count: 0, hits: [] });
      const g = groupHist.get(r.group)!;
      g.count++;
      g.hits.push(`${KNOWN[hex]} (${hex})`);
    }
  }
}

console.log('\nGroup histogram for known base skills (SimData type 0x545AC67A):');
for (const [group, { count, hits }] of [...groupHist].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  group 0x${group.toString(16).padStart(8, '0')} — ${count} hits: ${hits.join(', ')}`);
}
if (groupHist.size === 0) console.log('  (no matches — skills may live under a different resource type)');
