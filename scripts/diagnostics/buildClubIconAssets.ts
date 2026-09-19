/**
 * Extract club icons from the base64 "all icons" HTML dump:
 *   - club ACTIVITY icons (encouraged/discouraged rules) → public/club-activity-icons/<activityIdHex>.png,
 *     named by the ACTIVITY tuning id (the id saves store), resolved exactly via
 *     each ClubInteractionGroup's category_icon ResourceKey (CLUB_ACTIVITY_ICONS
 *     in stockClubActivities.ts — id→ResourceKey join). Files are id-named so the
 *     resolver is just /club-activity-icons/<id>.png, matching skills/careers.
 *   - club REQUIREMENT value icons (occult / marital / financial / celebrity-level)
 *     → public/criteria-icons/<instance>.png. These are small fixed enums, each
 *     ResourceKey confirmed by exact icon name in the dump (no fuzzy matching).
 *
 * Usage:  HTML="$HOME/Desktop/icons.html" npx tsx scripts/diagnostics/buildClubIconAssets.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { CLUB_ACTIVITY_ICONS } from '../../src/data/stockClubActivities.js';

const HTML_FILE = process.env.HTML || `${process.env.HOME}/Desktop/icons.html`;
const ACT_DIR = `${process.cwd()}/public/club-activity-icons`;
const CRIT_DIR = `${process.cwd()}/public/criteria-icons`;
mkdirSync(ACT_DIR, { recursive: true });
mkdirSync(CRIT_DIR, { recursive: true });

// Requirement value-icon ResourceKey instances (lowercase). Confirmed by exact
// icon name in the dump + our seed-confirmed criterion enums.
const CRITERIA_INSTANCES: Record<string, string> = {
  // marital (MARITAL_STATUS: 0 Married / 1 Not Married)
  'simsocialstatus_rel_married': '2df34abdc4b8f36c',
  'simsocialstatus_rel_unmarried': 'b2687c7c97eb6ec3',
  // financial (FUNDS_STATUS: 0 Poor / 1 Moderate / 2 Wealthy)
  'simsocialstatus_wealth_poor': '6a40c064622c4dbe',
  'simsocialstatus_wealth_medium': '537500dc3a45c6fb',
  'simsocialstatus_wealth_rich': '5829726457b62650',
  // occult (STOCK_OCCULTS) — Non-Occult reuses the hug icon (no dedicated art)
  'occult_vampire': 'bfa6b19a7785731b',
  'occult_spellcaster': '65da5160ac2e4d3b',
  'occult_mermaid': 'c0dee0f81b204bb1',
  'occult_werewolf': 'a9f1ceb800807805',
  'occult_alien': '26853c08f0141423',
  'occult_ghost': '3dae421c56005e4f',
  'occult_fairy': '6acbdfcb06bd2418',
  'occult_nonoccult': '12345b6955d90455',
  // celebrity level (fame 1–5) → famelevel01–05
  'famelevel01': 'b3c5fe01fcc5cfdf',
  'famelevel02': 'b3c5fe01fcc5cfdc',
  'famelevel03': 'b3c5fe01fcc5cfdd',
  'famelevel04': 'b3c5fe01fcc5cfda',
  'famelevel05': 'b3c5fe01fcc5cfdb',
  // gender (GENDER: Male 4096 / Female 8192) — the role-criteria filter art
  'club_rules_gendercriteriamale': 'b371bd292c5be57b',
  'club_rules_gendercriteriafemale': 'd0d5d1e82454cf7c',
  // relationship (RELATIONSHIP: Single 0 / In a Relationship 1 / Married 2)
  'club_rules_single': '067742fdfb81093c',
  'club_rules_inarelationship': '6ba2cc352a95d018',
  'club_rules_married': 'b6058dc517816904',
  // orientation (Attracted to: Men 4096 / Women 8192 / Anyone[both] 12288 / No one[aromantic] 16384)
  'club_rules_rolecriteriamen': '1dbe52d0c48592f9',
  'club_rules_rolecriteriawomen': 'c9a07d0949fbcd3b',
  'club_rules_rolecriteriacategoryboth': '4a0d98cb96aeabea',
  'club_rules_rolecriteriaaromantic': '9e940fbd26dbf4d1',
};

// Invert CLUB_ACTIVITY_ICONS (id→instance) so we can name each PNG by the
// activity id. Several activities may share an icon instance — each still gets
// its own id-named file.
const instanceToActivityIds = new Map<string, string[]>();
for (const [id, inst] of Object.entries(CLUB_ACTIVITY_ICONS)) {
  const key = inst.toLowerCase();
  (instanceToActivityIds.get(key) ?? instanceToActivityIds.set(key, []).get(key)!).push(id.replace(/^0x/, '').toLowerCase());
}
const activityWanted = new Set(instanceToActivityIds.keys());
const critWanted = new Set(Object.values(CRITERIA_INSTANCES).map((s) => s.toLowerCase()));

console.log(`Reading ${HTML_FILE}…`);
const html = readFileSync(HTML_FILE, 'utf8');

const iconBlockRe = /<div class="icon-item">([\s\S]*?)<\/div>\s*<\/div>/g;
const imgSrcRe = /<img src="data:image\/png;base64,([^"]+)"/;
const resRe = /2f7d0004:0{8}:([0-9a-fA-F]{16})/;

let act = 0, crit = 0;
const seen = new Set<string>();
for (const blockMatch of html.matchAll(iconBlockRe)) {
  const block = blockMatch[1];
  const img = block.match(imgSrcRe);
  const res = block.match(resRe);
  if (!img || !res) continue;
  const inst = res[1].toLowerCase();
  const buf = Buffer.from(img[1], 'base64');
  if (activityWanted.has(inst)) {
    for (const id of instanceToActivityIds.get(inst)!) writeFileSync(`${ACT_DIR}/${id}.png`, buf);
    seen.add(inst); act += instanceToActivityIds.get(inst)!.length;
  }
  if (critWanted.has(inst)) { writeFileSync(`${CRIT_DIR}/${inst}.png`, buf); seen.add(inst); crit++; }
}

console.log(`Wrote ${act} activity icons → public/club-activity-icons/`);
console.log(`Wrote ${crit} criteria icons → public/criteria-icons/`);

const missAct = [...activityWanted].filter((i) => !seen.has(i));
const missCrit = Object.entries(CRITERIA_INSTANCES).filter(([, i]) => !seen.has(i.toLowerCase()));
if (missAct.length) console.log(`\n⚠ activity instances not found in HTML (${missAct.length}): ${missAct.slice(0, 10).join(', ')}`);
if (missCrit.length) console.log(`\n⚠ criteria icons not found (${missCrit.length}): ${missCrit.map(([n]) => n).join(', ')}`);
if (!missAct.length && !missCrit.length) console.log('\nAll wanted icons found. ✓');
