/**
 * Find specific tuning resources by (pack, group, instance hex) and print
 * their content so we can identify what they actually are. For unmatched
 * venues + aspirations from the EP scan.
 */
import { readFileSync, existsSync } from 'fs';
import { inflateSync } from 'zlib';
import { parseDbpf } from '../../src/lib/dbpf.js';
import { decompressRefpack } from '../../src/lib/refpack.js';

const APP_ROOT = '/Applications/EA Games/The Sims 4.app/Contents';
const PACKS_ROOT = '/Applications/EA Games/The Sims 4 Packs';

const GROUP_TRAIT = 0x005FDD0C;
const GROUP_ASPIRATION = 0x0020FC6D;
const GROUP_VENUE = 0x00BBD738;
const TUNING_TYPE = 0x545AC67A;

// Pack → list of [group, instLo hex, label] to identify. Only venues +
// aspirations — traits are intentionally out of scope (we map the 97
// CAS-pickable personality traits, the rest are reward/state/NPC tunings).
const targets: Record<string, Array<[number, number, string]>> = {
  EP03: [[GROUP_VENUE, 0x247f7, 'venue']],
  GP01: [[GROUP_VENUE, 0x19c77, 'venue']],
  GP06: [[GROUP_VENUE, 0x2ac13, 'venue']],
  GP09: [
    [GROUP_VENUE, 0x38a1c, 'venue'],
    [GROUP_VENUE, 0x38fe9, 'venue'],
    [GROUP_ASPIRATION, 0x38db9, 'aspiration'],
    [GROUP_ASPIRATION, 0x38dba, 'aspiration'],
  ],
  GP12: [
    [GROUP_ASPIRATION, 0x46e70, 'aspiration'],
    [GROUP_ASPIRATION, 0x46e71, 'aspiration'],
    [GROUP_ASPIRATION, 0x46e72, 'aspiration'],
    [GROUP_ASPIRATION, 0x46e73, 'aspiration'],
  ],
  SP18: [[GROUP_VENUE, 0x3d9dc, 'venue']],
};

function findInFile(path: string, group: number, instLo: number) {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const resources = parseDbpf(bytes);
  for (const r of resources) {
    if (r.type === TUNING_TYPE && r.group === group && r.instHi === 0 && r.instLo === instLo) {
      return r;
    }
  }
  return null;
}

function dumpResource(label: string, packCode: string, group: number, instLo: number) {
  const candidates = [
    `${PACKS_ROOT}/${packCode}/ClientFullBuild0.package`,
    `${PACKS_ROOT}/${packCode}/ClientFullBuild1.package`,
    `${APP_ROOT}/Delta/${packCode}/ClientDeltaBuild0.package`,
    `${APP_ROOT}/Delta/${packCode}/ClientDeltaBuild1.package`,
  ];
  for (const path of candidates) {
    const r = findInFile(path, group, instLo);
    if (!r) continue;
    let data: Uint8Array;
    try {
      // compType: 0xffff = refpack, 0x5a42 = zlib. Also detect zlib by magic
      // bytes (78 da/78 9c/78 01) in case compType doesn't match.
      const isZlib = r.data[0] === 0x78 && (r.data[1] === 0xda || r.data[1] === 0x9c || r.data[1] === 0x01);
      if (r.compType === 0xffff) data = new Uint8Array(decompressRefpack(r.data));
      else if (isZlib || r.compType === 0x5a42) data = new Uint8Array(inflateSync(Buffer.from(r.data)));
      else data = r.data;
    } catch (e) {
      console.log(`  [${label}] ${path.split('/').pop()}: decompress failed (compType=0x${r.compType.toString(16)}): ${e}`);
      return;
    }
    // Extract every printable ASCII run in the decompressed SimData and look
    // for the tuning class name (trait_*, aspiration_*, venue_*, etc.).
    const runs: string[] = [];
    let cur = '';
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      if (b >= 0x20 && b <= 0x7E) cur += String.fromCharCode(b);
      else { if (cur.length >= 4) runs.push(cur); cur = ''; }
    }
    if (cur.length >= 4) runs.push(cur);
    // The class-name string is in one of two forms:
    //   trait_Cringe / venue_Library / aspiration_Foo — class prefix + camel name
    //   Cringe / unfinished_Business_Track — bare camel name (no prefix)
    // Skip generic SimData field names that share the prefix.
    const FIELD_NAMES = new Set([
      'venue_description', 'venue_game_tests', 'venue_type', 'trait_description',
      'trait_origin_description', 'trait_type', 'aspiration_track',
    ]);
    const candidates = runs.filter((s) =>
      s.length >= 4 && !FIELD_NAMES.has(s) &&
      !/^(DATA|ages|tags|icon|display|species|genders|ui_category|cas_|bb_|conflicting|refresh|thumbnail|occults|category|description_text|is_hidden|mood_asm|override_traits|primary_trait|reward|aspirations|Trait|Aspiration|Venue|LotType)$/.test(s)
    );
    // Prefer prefix matches (most authoritative). Otherwise show top candidates.
    // Prefix match: must be lowercase prefix + underscore + capital letter
    // (e.g. "venue_DoctorClinic"). Case-sensitive so we don't grab field names
    // like "venue_icon" / "venue_flags".
    const tuningName = candidates.find((s) => /^(trait|aspiration|venue|lotType|lot_type|subVenue)_[A-Z]/.test(s) && !FIELD_NAMES.has(s))
                    ?? candidates.find((s) => /^Venue_[A-Z]/.test(s))         // Sometimes capitalized prefix (Venue_Penthouse)
                    ?? candidates.find((s) => /^[A-Z][a-z]+_[A-Z]/.test(s));  // Bare CamelCase_Path (Fairy_FairyStories_DarkPath, unfinished_Business_Track)
    console.log(`  [${label}] 0x${instLo.toString(16)}: ${tuningName ?? '(no tuning name found)'}`);
    if (!tuningName) {
      console.log(`    candidates: ${candidates.slice(0, 10).map((s) => `"${s}"`).join(', ')}`);
    }
    return;
  }
  console.log(`  [${label}] 0x${instLo.toString(16)} NOT FOUND in ${packCode}`);
}

for (const [pack, items] of Object.entries(targets)) {
  console.log(`\n${pack}:`);
  for (const [group, instLo, label] of items) {
    dumpResource(label, pack, group, instLo);
  }
}
