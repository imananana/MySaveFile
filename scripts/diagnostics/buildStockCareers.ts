/**
 * Build the STOCK_CAREERS tuning-ID → display-name (+ icon instance) map from an
 * S4 Studio Career export dump. Mirror of buildStockTraits.ts.
 *
 * Usage:
 *   EXPORT="$HOME/Documents/Careers" npx tsx scripts/diagnostics/buildStockCareers.ts
 *
 * Export from S4S: extract the Career tunings (type 73996BEB) AND their SimData
 * siblings (type 545AC67A, Career class group 0x996B98) to a folder. Filenames:
 *   `73996BEB!<group>!<instance_hex>.<career_rawName>.CareerTuning.xml`
 *   `545AC67A!<group>!<instance_hex>.<career_rawName>.SimData.xml`
 * The instance hex is the career tuning uid (the `f30.f12.f2.f1` we read from
 * saves — see spikeCareerFinal.ts). The SimData side carries the icon
 * ResourceKey, same as traits.
 *
 * PACK assignment is NOT baked in here — it's resolved at runtime via
 * getCareerPack() (src/data/packAssignments.ts, populated by scanInstalledPacks).
 *
 * Output: src/data/stockCareers.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const EXPORT_DIR = process.env.EXPORT || `${HOME}/Documents/Careers`;
const OUTPUT = process.env.OUTPUT || `${process.cwd()}/src/data/stockCareers.ts`;

const allFiles = readdirSync(EXPORT_DIR);
const careerFiles = allFiles.filter((f) => /\.CareerTuning\.xml$/i.test(f));

// Index SimData siblings by instance hex so we can read each career's icon.
const simDataByInstance = new Map<string, string>();
for (const f of allFiles) {
  const m = f.match(/^545AC67A!([^!]+)!([0-9A-Fa-f]+)\..+\.SimData\.xml$/i);
  if (m) simDataByInstance.set(m[2].toUpperCase(), f);
}

console.log(`Scanning ${careerFiles.length} CareerTuning files in ${EXPORT_DIR} (paired with ${simDataByInstance.size} SimData)…\n`);

// The career display name lives on the CareerTrack tuning (not exported), so
// filenames are the only signal — and several are internal codenames that differ
// from the in-game label. Hand-curated overrides (uid → display name), to be
// confirmed by the user. Everything else is prettified from the filename.
const NAME_OVERRIDE: Record<string, string> = {
  '0x19e94': 'Detective',
  '0x3c9fb': 'Salary Person',     // CorporateWorker
  '0x21021': 'Politician',        // Activist
  '0x5c2f2': 'Undertaker',        // Mortician
  '0x19fda': 'Athlete',           // Athletic
  '0x2e2cf': 'Actor',             // Active_ActorCareer
  '0x1a2de': 'Doctor',            // Active_Doctor
  '0x1a2f7': 'Scientist',         // Active_Scientist
  '0x5c317': 'Reaper',            // Active_Reaper
  '0x6b344': 'Naturopath',        // workFromHomeCareer_Naturopath
  '0x43c9e': 'Simfluencer',       // SimsfluencerSideHustle
  '0x42df8': 'Video Game Streamer', // StreamerSideHustle
  '0x35004': 'E-Sports Competitor', // career_Volunteer_E-Sports (Discover University after-school org)
  '0x327c7': 'Freelancer',        // Freelancer_No_Agency (trade resolved separately)

  // NPC / townie service careers — user-curated names (2026-06-16), leading
  // "NPC" dropped. These hold the auto-gen townies surfaced by the roster's
  // "NPC job" filter, so the names need to be human-readable.
  '0x3f937': 'Garden Shop Owner',
  '0x3f939': 'Grocery Delivery',
  '0x3f938': 'Grocery Owner',
  '0x3f93a': 'Henford Mayor',
  '0x3f93b': 'Henford Pub Owner',
  '0x4f473': 'Horse Trainer',
  '0x4f472': 'Mysterious Rancher',
  '0x6262a': 'Bakery Stall',
  '0x6262c': 'Pottery Stall',
  '0x6262b': 'Sweet Stall',
  '0x6bbb2': 'Apothecary Shop',
  '0x6bb97': 'Gnome Shop',
  '0x76020': 'World Market Stall',
  '0x2af33': 'Adoption Officer',
  '0x1dd9e': 'Barista',
  '0x1ab92': 'Bartender',
  '0x1fe1e': 'Bartender Company',
  '0x47d9f': 'Moonwood Bartender',
  '0x3eb9c': 'Bonehilda',
  '0x24106': 'Butler',
  '0x30011': 'Camera Operator',
  '0x6d377': 'Cryptid',
  '0x32746': 'Curio Shop Owner',
  '0x1dfc2': 'DJ',
  '0x3b2ba': 'Eco Inspector',
  '0x2cc4b': 'Father Winter',
  '0x3a0d4': 'Firefighter',
  '0x1b5da': 'Fisherman',
  '0x1b5d3': 'Gardener',
  '0x1fde1': 'Gardener Service',
  '0x1aef6': 'Grim Reaper',
  '0x1b58e': 'Gym Trainer',
  '0x2fd6f': 'Hair Makeup Chair Stylist',
  '0x485c9': 'High School Teacher',
  '0x22664': 'Home Chef',
  '0x23125': 'Landlord',
  '0x1b58f': 'Librarian',
  '0x1ab90': 'Maid',
  '0x1ab91': 'Mailman',
  '0x1cf16': 'Massage Therapist',
  '0x1d372': 'Massage Therapist Service',
  '0x22a4d': 'Nanny',
  '0x21411': 'Ownable Restaurant Chef',
  '0x21410': 'Ownable Restaurant Host',
  '0x21412': 'Ownable Restaurant Waiter',
  '0x29279': 'Ownable Vet Clinic Vet',
  '0x302af': 'Paparazzi',
  '0x1addb': 'Pizza Delivery',
  '0x66f7a': 'Police',
  '0x1c3b7': 'Pollinator',
  '0x30013': 'Producer',
  '0x36dee': 'Arts Professor',
  '0x36def': 'Science Professor',
  '0x4a681': 'Ranch Hand',
  '0x1b5e8': 'Ranger',
  '0x1d2d2': 'Reflexologist',
  '0x1f9bf': 'Repair',
  '0x2212d': 'Restaurant Critic',
  '0x1ade9': 'Retail',
  '0x61d6c': 'Shady NPC',
  '0x2ffce': 'Special Effects Operator',
  '0x22fb5': 'Stall Vendor',
  '0x438b9': 'Stall Vendor Wedding Flower',
  '0x32390': 'StrangerVille OGA',
  '0x32389': 'StrangerVille Scientist',
  '0x62ac9': 'Tattoo Artist',
  '0x22271': 'Tragic Clown',
  '0x1df22': 'Bar Regular',
  '0x79a3c': 'Robin Hood',
  '0x2fd70': 'Wardrobe Pedestal Stylist',
  '0x1cf54': 'Yoga Instructor',
};

// kind drives both display grouping and the active-career picker (which ignores
// 'npc' and 'school'). Derived from the rawName.
type Kind = 'fulltime' | 'parttime' | 'teen' | 'club' | 'freelance' | 'npc' | 'school';
function kindOf(raw: string, uid: bigint): Kind {
  if (uid === 0x2545n) return 'school';                       // Teen_HighSchool tracker
  if (/_NPC_|^NPC|StallVendor|MarketStall|Venue_BarRegular|Pollinator/i.test(raw)) return 'npc';
  if (/Volunteer_/i.test(raw)) return 'club';   // after-school / university orgs (HS teams, Soccer, E-Sports, …)
  if (/Freelancer/i.test(raw)) return 'freelance';
  if (/PartTime/i.test(raw)) return 'parttime';
  if (/^career_Teen_/i.test(raw)) return 'teen';
  return 'fulltime';
}

function prettify(raw: string): string {
  return raw
    .replace(/^careers?_/i, '')
    .replace(/^(Adult|Teen|Child)_/i, '')
    .replace(/^Active_/i, '')
    .replace(/^Volunteer_(HSTeam_)?/i, '')
    .replace(/^PartTime_/i, '')                  // drop "Part Time" prefix (kind carries it)
    .replace(/^Freelancer_Agency_/i, 'Freelance ') // "Freelance Fashion Photographer" etc.
    .replace(/^Freelancer_/i, 'Freelance ')
    .replace(/SideHustle$/i, '')
    .replace(/Career(_\d+)?$/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .trim();
}

interface Entry { instance: bigint; rawName: string; name: string; kind: Kind; iconInstance: string | null }
const careers: Entry[] = [];

for (const file of careerFiles) {
  const m = file.match(/^73996BEB!([^!]+)!([0-9A-Fa-f]+)\.(.+)\.CareerTuning\.xml$/i);
  if (!m) continue;
  const instanceHex = m[2];
  const rawName = m[3];
  const instance = BigInt('0x' + instanceHex);
  const contents = readFileSync(join(EXPORT_DIR, file), 'utf8');

  // Name: curated override (uid) wins; otherwise prettify the filename. (The
  // real localized name is on the CareerTrack tuning, which isn't in this export.)
  void contents;
  const uidKey = '0x' + instance.toString(16);
  const name = NAME_OVERRIDE[uidKey] ?? prettify(rawName);
  const kind = kindOf(rawName, instance);

  // Icon ResourceKey from the SimData side ("TYPE-GROUP-INSTANCE"), same as traits.
  let iconInstance: string | null = null;
  const sd = simDataByInstance.get(instanceHex.toUpperCase());
  if (sd) {
    const icon = readFileSync(join(EXPORT_DIR, sd), 'utf8').match(/<T name="icon">([0-9A-Fa-f]+)-([0-9A-Fa-f]+)-([0-9A-Fa-f]+)<\/T>/);
    if (icon && !/^0+$/.test(icon[3])) iconInstance = icon[3].toLowerCase();
  }

  careers.push({ instance, rawName, name, kind, iconInstance });
}

careers.sort((a, b) => a.name.localeCompare(b.name));
const withIcon = careers.filter((c) => c.iconInstance).length;
console.log(`${careers.length} careers (${withIcon} with an icon):\n`);
for (const c of careers) console.log(`  0x${c.instance.toString(16).padEnd(8)} ${c.kind.padEnd(9)} ${c.name.padEnd(28)} icon=${c.iconInstance ?? '—'}`);

const lines: string[] = [
  '/**',
  ' * Career tuning ID → display name + icon instance. Generated from an S4 Studio',
  ' * Career export by scripts/diagnostics/buildStockCareers.ts.',
  ' *',
  ' * The key is the career uid read from saves at f30.f12.f2.f1. iconInstance is',
  ' * the icon texture resource hex → filename in /career-icons/<hex>.png.',
  ' * Pack origin is resolved separately via getCareerPack() (packAssignments.ts).',
  ' *',
  ' * kind: fulltime|parttime|teen|club|freelance = playable; npc = held only by',
  ' * townie service sims (ignored by the active-career picker); school = the teen',
  ' * high-school tracker. Names are filename-derived + curated overrides.',
  ' */',
  "export type CareerKind = 'fulltime' | 'parttime' | 'teen' | 'club' | 'freelance' | 'npc' | 'school';",
  'export interface StockCareer {',
  '  name: string;',
  '  kind: CareerKind;',
  '  iconInstance: string | null;',
  '}',
  '',
  'export const STOCK_CAREERS: Record<string, StockCareer> = {',
];
for (const c of careers) {
  const icon = c.iconInstance ? `'${c.iconInstance}'` : 'null';
  lines.push(`  '0x${c.instance.toString(16)}': { name: ${JSON.stringify(c.name)}, kind: '${c.kind}', iconInstance: ${icon} },`);
}
lines.push('};');
lines.push('');
lines.push('/** Look up a career by its raw bigint tuning ID. */');
lines.push('export const lookupCareer = (id: bigint): StockCareer | null => STOCK_CAREERS[\'0x\' + id.toString(16)] ?? null;');
lines.push('');

writeFileSync(OUTPUT, lines.join('\n'));
console.log(`\nWrote ${OUTPUT}`);
