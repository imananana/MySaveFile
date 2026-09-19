/**
 * diagField7.mjs
 *
 * Extracts ALL lot records from one or two save files, reads the stable
 * field-7 (tag 0x39, fixed64) canonical lot definition ID, and compares
 * the names found in the save against WORLDS_DATA to audit typos / mismatches.
 *
 * Usage:
 *   node scripts/diagField7.mjs [save1.save] [save2.save]
 *
 * Defaults: Slot_02220000.save  and  Slot_1031202f.save
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { decompress } from 'qfs-compression';

// ── WORLDS_DATA inline (extracted from worlds.ts) ────────────────────────────
// We inline just the lot names here so the script has no TS build dependency.
// World → array of lot names.
const WORLDS_DATA = {
  "Brindleton Bay": ["Salty Paws Saloon","Catscratch Cottage","Bedlington Boathouse","Sporting Space","Ragdoll Refurb","Dachschund's Creek","Hindquarter Hideaway","Deadgrass Discoveries","Domus Familiaris","Club Calico","Pupperstone Park","Tail's End","Brindleton Pawspital","Chateau Frise","It's A Good House","Hound's Head"],
  "Britechester": ["Honeydew Fields","Mossy Lane","Spring Steppes","Pepper's Pub","Darby's Den","Brinny Tower","Maritime Manor","Tidal Tower","Darkwing House","Drake Hall","Wyvern Hall","Larry's Lagoon","Laurel Library"],
  "Chestnut Ridge": ["Big Sky Reach","Canyon Crossing","The Oak Barrel","The Rusty Horseshoe","Champion's Groove","The Cozy Corner House","Grapevine Terrace","Sweet Nectar Glade","Center Cottage","Duke's Hall","Biscuit's Bastion","Palomino Junction","Red Roan Field"],
  "Ciudad Enamorada": ["Torres Amanecer","Sudor","Laguna del Abrazo","Mirador del Amor","Casita del Amor","Mansión de la Pasión","Media Naranja","Avenida de la Eternidad","Calle de la Promesa","Villa Cálida","La Suite del Flechazo","Calle del Ensueño","Caminito del Deseo"],
  "Copperdale": ["Lea Suli Point","Town Square Terrace","Water Tower Way","Thrift Tea","Lakeview Library","Little Falls Nook","Auditorium","Hillside Haven","Bridge Creek Drive","Golden Peak","Totter Park","Copperdale High School"],
  "Del Sol Valley": ["Ward Park","Pectoral Fitness","Orchid A Go Go","Studio PBP","Plumbob Pictures Museum","Inner Circle","Upland Place","Vacuous Green","Bailey-Moon Manor","The Ward Den","Studio","Chateau Peak"],
  "Evergreen Harbor": ["#404 PineCrest Apartments","Canal Corner","The Caboose","Pigulock Manor","Miner Mansion","Rockridge Springs","The Old Mill","The Portsmouth Promenade","The Shipping Views","Sprucewood Square","The Quarry Building","The Waterfront","#402 PineCrest Apartments","#3 Stonestreet Apartments","#4 Stonestreet Apartments"],
  "Forgotten Hollow": ["Garliclauter Place","Widowshild Townhome","Fledermaus Bend","Wolfsbane Manor","Straud Mansion"],
  "Gibbi Point": ["Fearful Fish Lounge","Crystal Cottage","Miner's Manse","Fletcher's Cottage","Wanderwood Wonder","Prospector's Paradise","Seabreeze Scenic","Jellyfish Jubilee","Plumbird Park","Camp Gibbi Gibbi","Love Highland","Revive and Thrive Retreat","Hothead Rock Hideaway"],
  "Glimmerbrook": ["Elixirs and Brews","Brooks Bridge Borough","Creek Side Corner","Glimmerbrook Watch","Rock Ridge Canyon","The Magic Realm"],
  "Granite Falls": ["Hermit's House","Campground","Green Getaway","Riverside Retreat","Forest Hideaway","Lakeside Retreat","Granite Falls Forest"],
  "Henford-on-Bagley": ["The Gnome's Arms","1 Cobblebottom Street","3 Cobblebottom Street","13 Nettle Lane","5 Cobblebottom Street","4 Olde Mill Lane","Cordelia's Secret Cottage","14 Nettle Lane","Isle of Volpe Park","2 Olde Mill Lane","3 Olde Mill Lane","Olde Mill Hill"],
  "Innisgreen": ["Crannamor Residential","1 Mari Shores Road","8 Gnome Coast Street","Bard Boulevard","Greenwood Hamlet Residence","Gringle's","Starsong Lounge","Gimmley Gardensbrook","The GNOM Exhibit","Whistling Thistle Gardens","42 Normfair Drive","The Watering Hole","Puckitt Hall","Fern & Frond Wading Pond"],
  "Magnolia Promenade": ["Sixam","JF&S Clothiers","Paddywack's Emporium","Preeminent Domain","Police Station","The Roadstead","FutureSim Labs","Willow Creek Hospital"],
  "Moonwood Mill": ["New Moon Shack","Prowler's Patch","The Moonwood Mill Library","The Collective Cabin","The Grimtooth Bar & Bunker"],
  "Mt. Komorebi": ["5-6-1 Shinrinyoku","6-4-1 Hanamigawa","2-4-1 Wakabamori","2-4-3 Wakabamori","Mt. Komorebi Peak","Izakaya Ippai","Hazakura Lounge","Sutefani Onsen Bathhouse","Hanamigawa Koen","2-4-2 Wakabamori","5-1-1 Kiyomatsu","5-1-2 Kiyomatsu","5-3-1 Shinrinyoku","2-5-1 Wakabamori","Kiyomatsu Point"],
  "Newcrest": ["Comfy Cubby","Oak Alcove","Beech Byway","Fern Park","Asphalt Abodes","Civic Cliffs","Cookout Lookout","Hillside Highlands","Tranquil Crescent","Sandy Run","Midtown Meadows","Avarice Acres","Rippling Flats","Optimist's Outlook","Twin Oracle Point"],
  "Nordhaven": ["The Old Foundry","Old Torget House","The Rouge Note","Spilled Neon","Koffieboon","Inked Inlet","Comfortably Canalside","Terra-Potta","Fisher's Horizon","Konst Modern","Lighthouse Lookout","New Harbor Park"],
  "Oasis Springs": ["Forgotten Grotto","Agave Abode","Nookstone","Rafia Quinta","Rattlesnake Juice","The Solar Flare","The Futures Past","Pebble Burrow","Sandtrap Flat","Dusty Turf","Springscape","Vista Quarry","Granada Place","Sultry Springside","Burners & Builders","Yuma Heights","Slipshod Mesquite","Cacti Casa","Arid Ridge","Rio Verde","Desert Bloom Park","Affluista Mansion"],
  "Ondarion": ["12 Lakeview Apartments","13 Lakeview Apartments","17 Bright Cliff","18 Bright Cliff","Renaissance Road","Casa Do Corsário","Hardcover","Fisherman's Hut","Ye Olde Voyager","Zanbira Market","Sankofa Residence","The Lair in the Open-Air","Abrantes Estate","La Vivace","Bellacorde Palace","Dambele Palace","Verdemar Palace","Giardino Del Grandioso"],
  "Ravenwood": ["Netherworld Department of Death","Mourning Mist Manor","Moppy Manor","Specter Family Manor","The Cozy Casket House","The Final Draught","Club Eternity","Crow's Perch","Mystic Crossroads","Teardrop Cottage","Old Ravenwood Estate","The Marigold Chateau","Eternal Hollow","Hay Hill Landing"],
  "San Myshuno": ["17 Culpepper House","18 Culpepper House","121 Hakim House","920 Medina Studios","1313 21 Chic Street","122 Hakim House","19 Culpepper House","20 Culpepper House","2A Jasmine Suites","2B Jasmine Suites","701 Zen View","702 Zen View","IX Landgraab Apartments","VIII Landgraab Apartments","930 Medina Studios","888 Spire Apartments","Skye Fitness","Planet Honey Pop!","Fountain View Penthouse","Waterside Warble","The Old Salt House","1020 Alto Apartments","1010 Alto Apartments","Casbah Gallery","Stargazer Lounge","Torendi Tower Penthouse","Myshuno Meadows","1310 21 Chic Street","1312 21 Chic Street","910 Medina Studios"],
  "San Sequoia": ["Anchorpoint Library","Anchorpoint Abode","Manzanita Terrace","Parkside Place","23 Eucalyptus Lane","36 Bayani Place","Sequoia Cottage","18 Celebration Way","13 Acacia Avenue","Robls Point","7 Eucalpytus Lane","Celebration Center"],
  "Selvadorada": ["Hillview Hideaway","Belomisia Field Station","Selvadorada Villa","Jungle Bungalow","Bellomisia Trailhead","Cantina \"El Arbot del Jaguar\"","Alam Museum of Archaeology"],
  "Strangerville": ["Slip 42","8 Bells","Strangerville Information Center","Cliff Side Crest","Creek Corner Cove","Dream Weavers Way","Carpophagous Corner","Riverside Groove","Plateau Palace","Strangerville Overlook","Old Penelope","The ______ Lab"],
  "Sulani": ["Tangled Flat","The Sand Bar","Pier Perfection","Caldera Camp","Lagoon Look","Ohan'ali Beach","Kin-Ship","Sand Simoleon Beach","Journey's End","Reef Finery","Key Point","Chieftain's Villa","Sapphire Shores","Admiral's Wreckage"],
  "Tartosa": ["Piccola Luce","Villa Vigna","Rifugio dei Pirati","Baia Dell-Amore","The Old Wood Nectary","Via Romanza","Celebrazioni d'Amore","La Coppia Serena","Thebe Estate"],
  "Tomarang": ["Hothotok Shore","Chee-Wit Chee-Waa Kanto","The Screaming Gecko","Isda Riverfront","Taka Soi 15","Tam Nang Sands","Sungai Point","Zosul Taman Botani","Ro Kaya Rockside"],
  "Willow Creek": ["Sylvan Glade","Rindle Rose","Crick Cabana","Streamlet Single","Movers & Shakers Gym","Willow Creek Archive Library","The Blue Velvet Night Club","Ophelia Villa","Pique Hearth","Potters Splay","Riverside Roost","Hallow Slough","Bargain Bend","Daisy Hovel","Municipal Muses Museum","Brook Bungalow","Garden Essence","Parkshore","Umbrage Manor","Cypress Terrace","Magnolia Blossom","Oakenstead"],
  "Windenburg": ["Ancient Ruins","Old Quarter Inn","The Shrieking Llama","Havisham House","Mid-Nowhere","Cottage Am See","Hare and Hedgehog","South Square Coffee","Quad Manor","Discoteque Pan Europa","The Nawhal Arms","Hare Square","Factory One","Proprietor's Square","Waterlock Redoubt","Dock Den","Pier Palace","Rustic Residence","Harbor Quarter Gym","The Bluffs","Von Haunt Estate","Bathe de Rill","The Lighthouse","Cooringberg Cottage","The Summer Home","Von-Windenburg Estate","Dresden House"],
};

// Build lookup: normalised lot name → "World::Lot"
const LOT_INDEX = new Map();
for (const [world, lots] of Object.entries(WORLDS_DATA)) {
  for (const name of lots) {
    const norm = name.toLowerCase().replace(/\s+/g, '');
    const noNum = name.toLowerCase().trim().replace(/^\d+\S*\s+/, '').replace(/\s+/g, '');
    LOT_INDEX.set(name.toLowerCase().trim(), `${world}::${name}`);
    if (!LOT_INDEX.has(norm)) LOT_INDEX.set(norm, `${world}::${name}`);
    if (!LOT_INDEX.has(noNum)) LOT_INDEX.set(noNum, `${world}::${name}`);
  }
}

// ── DBPF helpers ──────────────────────────────────────────────────────────────

function readFixed64LE(buf, pos) {
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 4; i++) lo |= BigInt(buf[pos + i]) << BigInt(i * 8);
  for (let i = 0; i < 4; i++) hi |= BigInt(buf[pos + 4 + i]) << BigInt(i * 8);
  return lo | (hi << 32n);
}

function readVarint(buf, pos) {
  let result = 0n, shift = 0n;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    shift += 7n;
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}

function readString(buf, pos) {
  const [len, next] = readVarint(buf, pos);
  const end = next + Number(len);
  return [Buffer.from(buf.slice(next, end)).toString('utf8'), end];
}

// ── Extended lot scanner — captures field1, lotId, name, field7 ──────────────
//
// Lot record wire format (protobuf inside a decompressed chunk):
//   tag 0x2a (field 5, len-delim) [msgLen]
//   {
//     0x08 [varint field1]          ← lot slot index (stable)
//     0x11 [8-byte lotId]           ← save-specific lot instance ID
//     0x1a [len] [name]             ← lot name string
//     0x22 [sub-msg]                ← sub-message (variable length, MUST skip entirely)
//     0x28 [varint field5]          ← stable varint
//     0x30 [varint field6]          ← optional
//     0x39 [8-byte field7]          ← THE stable EA canonical lot definition ID
//   }
//
// IMPORTANT: We use strict LINEAR parsing after the name — not a byte search.
// A search-based approach finds 0x39 bytes inside the 0x22 sub-message, which
// produces incorrect (shared) field7 values across many unrelated lots.

function skipVarint(buf, pos) {
  while (pos < buf.length && (buf[pos] & 0x80) !== 0) pos++;
  return pos + 1;
}

function scanLotsExtended(buf) {
  const lots = [];
  const seen = new Set();

  for (let i = 0; i < buf.length - 12; i++) {
    if (buf[i] !== 0x2a) continue;

    let pos = i + 1;
    const [msgLen, msgStart] = readVarint(buf, pos);
    const msgEnd = msgStart + Number(msgLen);
    if (msgLen < 12n || msgEnd > buf.length) continue;
    pos = msgStart;

    // field 1 (varint, tag 0x08)
    if (buf[pos] !== 0x08) continue;
    pos++;
    const [field1, afterField1] = readVarint(buf, pos);
    pos = afterField1;

    if (pos + 9 > msgEnd) continue;

    // field 2 (fixed64, tag 0x11) = lotId
    if (buf[pos] !== 0x11) continue;
    pos++;
    if (pos + 8 > buf.length) continue;
    const lotId = readFixed64LE(buf, pos);
    pos += 8;

    if (pos >= msgEnd) continue;

    // field 3 (string, tag 0x1a) = lot name
    if (buf[pos] !== 0x1a) continue;
    pos++;
    const [lotName, afterName] = readString(buf, pos);
    pos = afterName;

    if (!lotName || lotName.length === 0) continue;
    if (/^[a-z][a-z0-9_]+$/.test(lotName)) continue; // skip internal keys

    // ── Strict linear parse for field7 (tag 0x39) ────────────────────────
    // Walk the remaining top-level fields in order. Never search — only
    // advance field-by-field so we don't misread bytes inside sub-messages.
    let field7 = null;
    let p = pos;

    // field 4: sub-message (tag 0x22, len-delim) — skip entirely
    if (p < msgEnd && buf[p] === 0x22) {
      p++;
      const [subLen, subNext] = readVarint(buf, p);
      p = subNext + Number(subLen);
    }

    // field 5: varint (tag 0x28) — skip
    if (p < msgEnd && buf[p] === 0x28) {
      p++;
      p = skipVarint(buf, p);
    }

    // field 6: varint (tag 0x30) — optional, skip if present
    if (p < msgEnd && buf[p] === 0x30) {
      p++;
      p = skipVarint(buf, p);
    }

    // field 7: fixed64 (tag 0x39) — read if present
    if (p < msgEnd && buf[p] === 0x39 && p + 9 <= msgEnd) {
      field7 = readFixed64LE(buf, p + 1);
    }
    // ─────────────────────────────────────────────────────────────────────

    const key = lotId.toString(16).padStart(16, '0');
    if (!seen.has(key)) {
      seen.add(key);
      lots.push({ field1: Number(field1), lotId, lotIdHex: key, name: lotName, field7 });
    }

    i = msgEnd - 1;
  }

  return lots;
}

// ── Process one save file ─────────────────────────────────────────────────────

function loadLots(savePath, label) {
  console.log(`\nReading ${label} (${savePath}) …`);
  const buf = readFileSync(savePath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const indexCount = view.getUint32(36, true);
  const indexOffset = view.getUint32(64, true);
  const flags = view.getUint32(indexOffset, true);
  const typeConst   = (flags & 0x01) !== 0;
  const groupConst  = (flags & 0x02) !== 0;
  const instHiConst = (flags & 0x04) !== 0;
  let headerPos = indexOffset + 4;
  let constType = 0, constGroup = 0, constInstHi = 0;
  if (typeConst)   { constType   = view.getUint32(headerPos, true); headerPos += 4; }
  if (groupConst)  { constGroup  = view.getUint32(headerPos, true); headerPos += 4; }
  if (instHiConst) { constInstHi = view.getUint32(headerPos, true); headerPos += 4; }
  const entrySize = 32 - (typeConst ? 4 : 0) - (groupConst ? 4 : 0) - (instHiConst ? 4 : 0);

  const allLots = [];
  const seenIds = new Set();
  let pos = headerPos;

  for (let i = 0; i < indexCount; i++) {
    if (pos + entrySize > buf.length) break;
    let off = pos;
    const type    = typeConst   ? constType   : view.getUint32(off, true); off += typeConst   ? 0 : 4;
    const group   = groupConst  ? constGroup  : view.getUint32(off, true); off += groupConst  ? 0 : 4;
    const instHi  = instHiConst ? constInstHi : view.getUint32(off, true); off += instHiConst ? 0 : 4;
    const instLo  = view.getUint32(off, true); off += 4;
    const offset  = view.getUint32(off, true); off += 4;
    const sizeComp = view.getUint32(off, true) & 0x7fffffff; off += 4;
    off += 4; // sizeDecomp
    const compType = view.getUint16(off, true);
    pos += entrySize;

    // Only scan 0x0d chunks (primary save data) and a sample of 0x06 chunks
    if (type !== 0x0d && type !== 0x06) continue;
    if (type === 0x06 && compType !== 0xffff) continue;

    let data = buf.slice(offset, offset + sizeComp);
    if (compType === 0xffff) {
      try {
        const patched = Buffer.from(data);
        if (patched[1] === 0xfb && patched[0] !== 0x10) patched[0] = 0x10;
        data = decompress(patched);
      } catch { continue; }
    }

    try {
      for (const lot of scanLotsExtended(data)) {
        if (!seenIds.has(lot.lotIdHex)) {
          seenIds.add(lot.lotIdHex);
          allLots.push(lot);
        }
      }
    } catch { continue; }
  }

  console.log(`  → ${allLots.length} unique lots found`);
  return allLots;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const HOME = process.env.HOME;
const SAVES = `${HOME}/Documents/Electronic Arts/The Sims 4/saves`;

const save1Path = process.argv[2] || `${SAVES}/Slot_02220000.save`;
const save2Path = process.argv[3] || `${SAVES}/Slot_1031202f.save`;

const lots1 = loadLots(save1Path, 'Save A (02220000)');
const lots2 = loadLots(save2Path, 'Save B (1031202f)');

// ── Merge by field7 (stable EA canonical lot definition ID) ──────────────────

const byField7 = new Map();

function addToMap(lots, saveLabel) {
  for (const lot of lots) {
    const key = lot.field7 !== null ? lot.field7.toString() : `NOF7:${lot.field1}`;
    if (!byField7.has(key)) {
      byField7.set(key, { field7: lot.field7, field1: lot.field1, names: new Map() });
    }
    const entry = byField7.get(key);
    if (!entry.names.has(lot.name)) entry.names.set(lot.name, []);
    entry.names.get(lot.name).push(saveLabel);
  }
}

addToMap(lots1, 'A');
addToMap(lots2, 'B');

// ── Produce report ────────────────────────────────────────────────────────────

// Try to match a lot name against WORLDS_DATA
function findPlannerKey(name) {
  const lower = name.toLowerCase().trim();
  const norm  = lower.replace(/\s+/g, '');
  const noNum = lower.replace(/^\d+\S*\s+/, '');
  const noNumNorm = noNum.replace(/\s+/g, '');
  for (const k of [lower, norm, noNum, noNumNorm]) {
    if (LOT_INDEX.has(k)) return LOT_INDEX.get(k);
  }
  // Prefix match (save sometimes truncates)
  for (const [k, v] of LOT_INDEX) {
    if (k.startsWith(noNum + ' ') || k.startsWith(lower + ' ')) return v;
  }
  return null;
}

const sorted = [...byField7.values()].sort((a, b) => {
  const af = a.field7 ?? BigInt(a.field1) << 32n;
  const bf = b.field7 ?? BigInt(b.field1) << 32n;
  return af < bf ? -1 : af > bf ? 1 : 0;
});

// Categorise
const matched   = []; // save name matches WORLDS_DATA exactly
const renamed   = []; // save name exists but is NOT the EA original (gallery replacement / mismatch)
const noF7      = []; // no field7 found — less reliable

for (const entry of sorted) {
  // Collect all distinct names across saves
  const allNames = [...entry.names.keys()];
  // Try each name for a planner match
  let plannerKey = null;
  let matchedName = null;
  for (const n of allNames) {
    const k = findPlannerKey(n);
    if (k) { plannerKey = k; matchedName = n; break; }
  }

  const row = {
    field7: entry.field7,
    field1: entry.field1,
    namesInSave: entry.names,      // Map<name, saveLabels[]>
    plannerKey,
    matchedName,
  };

  if (entry.field7 === null) {
    noF7.push(row);
  } else if (plannerKey) {
    matched.push(row);
  } else {
    renamed.push(row);
  }
}

// ── Print ─────────────────────────────────────────────────────────────────────

function nameTag(namesMap) {
  return [...namesMap.entries()]
    .map(([n, saves]) => `"${n}" [${saves.join(',')}]`)
    .join(' | ');
}

console.log('\n\n══════════════════════════════════════════════════════════════════');
console.log(`MATCHED (save name → WORLDS_DATA)  — ${matched.length} lots`);
console.log('══════════════════════════════════════════════════════════════════');
for (const r of matched) {
  const f7 = r.field7.toString(16).padStart(16, '0');
  const differentNames = [...r.namesInSave.keys()].filter(n => n !== r.matchedName);
  const extra = differentNames.length ? `  ⚠ also seen as: ${differentNames.map(n => `"${n}"`).join(', ')}` : '';
  console.log(`  f7=${f7}  f1=${String(r.field1).padStart(6)}  ${r.plannerKey}${extra}`);
}

console.log('\n\n══════════════════════════════════════════════════════════════════');
console.log(`NO PLANNER MATCH (gallery-renamed or unknown)  — ${renamed.length} lots`);
console.log('══════════════════════════════════════════════════════════════════');
for (const r of renamed) {
  const f7 = r.field7.toString(16).padStart(16, '0');
  console.log(`  f7=${f7}  f1=${String(r.field1).padStart(6)}  ${nameTag(r.namesInSave)}`);
}

if (noF7.length) {
  console.log('\n\n══════════════════════════════════════════════════════════════════');
  console.log(`NO field7 FOUND  — ${noF7.length} lots`);
  console.log('══════════════════════════════════════════════════════════════════');
  for (const r of noF7) {
    console.log(`  f1=${String(r.field1).padStart(6)}  ${nameTag(r.namesInSave)}`);
  }
}

// ── Audit: WORLDS_DATA lots not seen in either save ───────────────────────────

const seenPlannerKeys = new Set([
  ...matched.map(r => r.plannerKey),
]);

console.log('\n\n══════════════════════════════════════════════════════════════════');
console.log('WORLDS_DATA lots NOT SEEN in either save');
console.log('══════════════════════════════════════════════════════════════════');
let missingCount = 0;
for (const [world, lots] of Object.entries(WORLDS_DATA)) {
  for (const name of lots) {
    const key = `${world}::${name}`;
    if (!seenPlannerKeys.has(key)) {
      console.log(`  MISSING  ${key}`);
      missingCount++;
    }
  }
}
if (missingCount === 0) console.log('  (none — all WORLDS_DATA lots found in save files)');

console.log(`\nSummary: ${matched.length} matched | ${renamed.length} unmatched (gallery/renamed) | ${noF7.length} no-field7 | ${missingCount} missing from saves\n`);
