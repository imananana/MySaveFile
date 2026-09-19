/**
 * Pack content tagger.
 *
 * Strategy:
 *   1. Scan every base-game DBPF (Data/Client/*) → build the "base set" of
 *      trait/aspiration/venue tuning hexes the base game already owns.
 *   2. For each installed EP, scan its ClientFullBuild0.package + any post-
 *      launch refresh deltas in app/Contents/Delta/EP##/ → that pack's
 *      observed set.
 *   3. Pack-added = pack set − base set. Subtracts out base content that the
 *      pack merely references (Residential venue, Jealous trait, etc.).
 *   4. Cross-reference pack-added hexes against STOCK_TRAITS,
 *      STOCK_ASPIRATIONS, VENUE_TUNING_MAP for human-readable names.
 *   5. Emit a per-pack report + a JSON file ready for static commit.
 *
 * Tuning class is encoded in the GROUP code of type 0x545AC67A:
 *   0x005FDD0C = Trait
 *   0x0020FC6D = Aspiration
 *   0x00BBD738 = Venue
 *
 * Usage: npx tsx scripts/diagnostics/scanInstalledPacks.ts
 */
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { STOCK_TRAITS } from '../../src/data/stockTraits.js';
import { STOCK_ASPIRATIONS } from '../../src/data/stockAspirations.js';
import { STOCK_SKILLS } from '../../src/data/stockSkills.js';
import { VENUE_TUNING_MAP } from '../../src/lib/parser/lots.js';

const APP_ROOT = '/Applications/EA Games/The Sims 4.app/Contents';
const PACKS_ROOT = '/Applications/EA Games/The Sims 4 Packs';
const BASE_DATA = `${APP_ROOT}/Data/Client`;
const PACK_DELTAS = `${APP_ROOT}/Delta`;

const TUNING_TYPE = 0x545AC67A;
const GROUP_TRAIT = 0x005FDD0C;
const GROUP_ASPIRATION = 0x0020FC6D;
const GROUP_VENUE = 0x00BBD738;
const GROUP_CAREER = 0x00996B98;   // Career class SimData (found via base-game Culinary 0x240f)
const GROUP_SKILL = 0x009BC58E;    // Statistic/Skill class SimData (found via base skills Logic/Charisma/… — findSkillGroup.ts)

interface Bucket {
  traits: Set<string>;
  aspirations: Set<string>;
  venues: Set<string>;
  careers: Set<string>;
  skills: Set<string>;
}

const emptyBucket = (): Bucket => ({
  traits: new Set(),
  aspirations: new Set(),
  venues: new Set(),
  careers: new Set(),
  skills: new Set(),
});

function instanceHex(instHi: number, instLo: number): string {
  if (instHi === 0) return '0x' + instLo.toString(16);
  return '0x' + instHi.toString(16).padStart(8, '0') + instLo.toString(16).padStart(8, '0');
}

function scanPackage(path: string, into: Bucket): { resources: number; bytes: number; ms: number } {
  const t0 = Date.now();
  const buf = readFileSync(path);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const resources = parseDbpf(bytes);
  let kept = 0;
  for (const r of resources) {
    if (r.type !== TUNING_TYPE) continue;
    const hex = instanceHex(r.instHi, r.instLo);
    if (r.group === GROUP_TRAIT) { into.traits.add(hex); kept++; }
    else if (r.group === GROUP_ASPIRATION) { into.aspirations.add(hex); kept++; }
    else if (r.group === GROUP_VENUE) { into.venues.add(hex); kept++; }
    else if (r.group === GROUP_CAREER) { into.careers.add(hex); kept++; }
    else if (r.group === GROUP_SKILL) { into.skills.add(hex); kept++; }
  }
  return { resources: resources.length, bytes: buf.length, ms: Date.now() - t0 };
}

function scanFolder(dir: string, into: Bucket, label: string) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.startsWith('Client') && f.endsWith('.package'));
  for (const f of files) {
    const path = `${dir}/${f}`;
    const stats = scanPackage(path, into);
    console.log(`  ${label}/${f}: ${stats.resources} res, ${(stats.bytes / 1024 / 1024).toFixed(0)}MB, ${stats.ms}ms`);
  }
}

// ─── 1. Base set ─────────────────────────────────────────────────────────────
console.log('\n═══ BASE GAME ═══');
const base = emptyBucket();
scanFolder(BASE_DATA, base, 'Base');
console.log(`Base totals: ${base.traits.size} traits, ${base.aspirations.size} aspirations, ${base.venues.size} venues, ${base.careers.size} careers, ${base.skills.size} skills`);

// ─── 2. Per-pack scan (EPs, GPs, FPs, SPs) ───────────────────────────────────
interface PackResult {
  pack: string;
  type: 'EP' | 'GP' | 'FP' | 'SP';
  traits: string[];
  aspirations: string[];
  venues: string[];
  careers: string[];
  skills: string[];
}
const results: PackResult[] = [];

const allPackDirs = readdirSync(PACKS_ROOT)
  .filter((d) => /^(EP|GP|FP|SP)\d+$/.test(d))
  .sort();

const byType: Record<string, string[]> = { EP: [], GP: [], FP: [], SP: [] };
for (const d of allPackDirs) byType[d.slice(0, 2)].push(d);

for (const packType of ['EP', 'GP', 'FP', 'SP'] as const) {
  const list = byType[packType];
  if (list.length === 0) continue;
  console.log(`\n═══ ${packType} (${list.length}) ═══`);

  for (const pack of list) {
    const obs = emptyBucket();
    scanFolder(`${PACKS_ROOT}/${pack}`, obs, pack);
    scanFolder(`${PACK_DELTAS}/${pack}`, obs, `${pack} (delta)`);

    const added = {
      traits: [...obs.traits].filter((h) => !base.traits.has(h)).sort(),
      aspirations: [...obs.aspirations].filter((h) => !base.aspirations.has(h)).sort(),
      venues: [...obs.venues].filter((h) => !base.venues.has(h)).sort(),
      careers: [...obs.careers].filter((h) => !base.careers.has(h)).sort(),
      skills: [...obs.skills].filter((h) => !base.skills.has(h)).sort(),
    };

    // Skip packs that add nothing of interest (most SPs add only objects/CC)
    if (added.traits.length === 0 && added.aspirations.length === 0 && added.venues.length === 0 && added.careers.length === 0 && added.skills.length === 0) {
      console.log(`--- ${pack} --- (none)`);
      results.push({ pack, type: packType, ...added });
      continue;
    }

    console.log(`\n--- ${pack} ---`);

    const matched = {
      traits: added.traits.map((h) => STOCK_TRAITS[h]?.name).filter(Boolean),
      aspirations: added.aspirations.map((h) => STOCK_ASPIRATIONS[h]?.name).filter(Boolean),
      venues: added.venues.map((h) => VENUE_TUNING_MAP[h]).filter(Boolean),
    };
    const unmatched = {
      traits: added.traits.filter((h) => !STOCK_TRAITS[h]),
      aspirations: added.aspirations.filter((h) => !STOCK_ASPIRATIONS[h]),
      venues: added.venues.filter((h) => !VENUE_TUNING_MAP[h]),
    };

    if (added.traits.length) {
      console.log(`  Traits added: ${added.traits.length} (${matched.traits.length} matched)`);
      if (matched.traits.length) console.log(`    matched: ${matched.traits.join(', ')}`);
      if (unmatched.traits.length) console.log(`    unmatched (${unmatched.traits.length}): ${unmatched.traits.slice(0, 8).join(', ')}${unmatched.traits.length > 8 ? '…' : ''}`);
    }
    if (added.aspirations.length) {
      console.log(`  Aspirations added: ${added.aspirations.length} (${matched.aspirations.length} matched)`);
      if (matched.aspirations.length) console.log(`    matched: ${matched.aspirations.join(', ')}`);
      if (unmatched.aspirations.length) console.log(`    unmatched: ${unmatched.aspirations.join(', ')}`);
    }
    if (added.venues.length) {
      console.log(`  Venues added: ${added.venues.length} (${matched.venues.length} matched)`);
      if (matched.venues.length) console.log(`    matched: ${matched.venues.join(', ')}`);
      if (unmatched.venues.length) console.log(`    unmatched: ${unmatched.venues.join(', ')}`);
    }
    if (added.careers.length) {
      // No STOCK_CAREERS map yet (comes from buildStockCareers after an S4S
      // export); just report the count + hexes so we can sanity-check coverage.
      console.log(`  Careers added: ${added.careers.length}  ${added.careers.join(', ')}`);
    }
    if (added.skills.length) {
      const matchedSkills = added.skills.map((h) => STOCK_SKILLS[h]).filter(Boolean);
      console.log(`  Skills added: ${added.skills.length} (${matchedSkills.length} named)  ${matchedSkills.join(', ')}`);
    }

    results.push({ pack, type: packType, ...added });
  }
}

// ─── 3. Collision report ─────────────────────────────────────────────────────
console.log('\n═══ COLLISION CHECK ═══');
const seenIn: Record<string, { traits: Map<string, string[]>; aspirations: Map<string, string[]>; venues: Map<string, string[]>; careers: Map<string, string[]> }> = {
  all: { traits: new Map(), aspirations: new Map(), venues: new Map(), careers: new Map() },
};
for (const r of results) {
  for (const h of r.traits) {
    if (!seenIn.all.traits.has(h)) seenIn.all.traits.set(h, []);
    seenIn.all.traits.get(h)!.push(r.pack);
  }
  for (const h of r.aspirations) {
    if (!seenIn.all.aspirations.has(h)) seenIn.all.aspirations.set(h, []);
    seenIn.all.aspirations.get(h)!.push(r.pack);
  }
  for (const h of r.venues) {
    if (!seenIn.all.venues.has(h)) seenIn.all.venues.set(h, []);
    seenIn.all.venues.get(h)!.push(r.pack);
  }
  for (const h of r.careers) {
    if (!seenIn.all.careers.has(h)) seenIn.all.careers.set(h, []);
    seenIn.all.careers.get(h)!.push(r.pack);
  }
}
let collisions = 0;
for (const cat of ['traits', 'aspirations', 'venues', 'careers'] as const) {
  for (const [hex, packs] of seenIn.all[cat]) {
    if (packs.length > 1) {
      const name = cat === 'traits' ? STOCK_TRAITS[hex]?.name
                 : cat === 'aspirations' ? STOCK_ASPIRATIONS[hex]?.name
                 : cat === 'venues' ? VENUE_TUNING_MAP[hex]
                 : undefined; // careers: no name map yet
      console.log(`  ${cat} ${hex} "${name ?? '?'}" → in ${packs.join(', ')}`);
      collisions++;
    }
  }
}
if (collisions === 0) console.log('  No collisions — every pack-added hex is in exactly one pack.');

// ─── 4. Emit JSON ────────────────────────────────────────────────────────────
const outPath = `${process.cwd()}/scripts/diagnostics/packAssignments.scan.json`;
writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), base: { traits: base.traits.size, aspirations: base.aspirations.size, venues: base.venues.size, careers: base.careers.size, skills: base.skills.size }, packs: results }, null, 2));
console.log(`\nWrote ${outPath}`);
