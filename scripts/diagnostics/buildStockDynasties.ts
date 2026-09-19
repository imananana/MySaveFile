/**
 * Build the STOCK_DYNASTY_ROLES + STOCK_DYNASTY_PERKS catalogs from an S4 Studio
 * Dynasty export dump (the in-game Dynasty system, EP21 royalty pack). Mirror of
 * buildStockCareers.ts / buildStockTraits.ts.
 *
 * Usage:
 *   EXPORT="$HOME/Documents/Dynasty" npx tsx scripts/diagnostics/buildStockDynasties.ts
 *
 * Export from S4S: the Dynasty trait tunings (type CB5FDDC7, trait class) +
 * their SimData siblings (type 545AC67A) to a folder. Filenames:
 *   `CB5FDDC7!<group>!<instance_hex>.<rawName>.TraitTuning.xml`
 * The instance hex is the trait uid we read from a sim's parsed `traitIds`, so a
 * sim's dynasty role/perks are read straight from traits we already parse — no
 * new save decode needed (verified against Slot_00000003: all 8 premade Maxis
 * dynasties resolve Head/Heir/Member/BlackSheep + per-member perk counts).
 *
 * The 0x0d save record supplies the grouping the traits can't: which sims belong
 * to which dynasty, plus the dynasty name + description (see spikeDynastyRecord).
 *
 * Output: src/data/stockDynasties.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME;
const EXPORT_DIR = process.env.EXPORT || `${HOME}/Documents/Dynasty`;
const OUTPUT = process.env.OUTPUT || `${process.cwd()}/src/data/stockDynasties.ts`;

const PLACEHOLDER_ICON = '30f0846c783606f9'; // InGame debug missing_image — treated as no icon

// Roles are HIDDEN traits with no display_name; curate labels + precedence (a
// member carries the base Member trait plus their specific role, so we pick the
// most specific). Founder is historical (the original head) — Head is the
// current leader, so Head outranks Founder for the displayed role.
const ROLE_META: Record<string, { name: string; precedence: number }> = {
  trait_Dynasty_Head: { name: 'Head', precedence: 100 },
  trait_Dynasty_Heir: { name: 'Heir', precedence: 90 },
  trait_Dynasty_BlackSheep_Resentful: { name: 'Black Sheep (Resentful)', precedence: 80 },
  trait_Dynasty_BlackSheep_Repentful: { name: 'Black Sheep (Repentful)', precedence: 80 },
  trait_Dynasty_BlackSheep: { name: 'Black Sheep', precedence: 70 },
  trait_Dynasty_Founder: { name: 'Founder', precedence: 60 },
  trait_Dynasty_Member: { name: 'Member', precedence: 10 },
};

// Ideal/skill encouragement markers — applied to the actively-played dynasty.
const IDEAL_META: Record<string, string> = {
  trait_Dynasty_EncourageIdeal: 'Encouraged Ideal',
  trait_Dynasty_DiscourageIdeal: 'Discouraged Ideal',
  trait_Dynasty_EncourageSkill: 'Encouraged Skill',
};

// Hidden purchasable perks have no display_name in the tuning — derive a label
// from the raw name + tier. Affinity perks DO carry a display_name (used directly).
const PERK_LABEL: Record<string, string> = {
  EasyFriends: 'Easy Friends',
  GradeBoost: 'Grade Boost',
  Matchmaker: 'Matchmaker',
  PartyPlanner: 'Party Planner',
  Secretive: 'Secretive',
};
const TIER_ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

const files = readdirSync(EXPORT_DIR).filter((f) => /\.TraitTuning\.xml$/i.test(f) && /Dynasty/i.test(f));

interface Role { hex: string; rawName: string; name: string; precedence: number }
interface Ideal { hex: string; rawName: string; name: string }
interface Perk { hex: string; rawName: string; name: string; category: string; tier: number; iconInstance: string | null }

const roles: Role[] = [];
const ideals: Ideal[] = [];
const perks: Perk[] = [];

for (const f of files) {
  const xml = readFileSync(join(EXPORT_DIR, f), 'utf8');
  const s = xml.match(/<I [^>]*\bs="(\d+)"/)?.[1];
  const rawName = xml.match(/<I [^>]*\bn="([^"]+)"/)?.[1];
  if (!s || !rawName) continue;
  const hex = '0x' + Number(s).toString(16);

  if (ROLE_META[rawName]) {
    roles.push({ hex, rawName, ...ROLE_META[rawName] });
    continue;
  }
  if (IDEAL_META[rawName]) {
    ideals.push({ hex, rawName, name: IDEAL_META[rawName] });
    continue;
  }

  // Perk: trait_DynastyPerk_<Category><Tier>
  const pm = rawName.match(/^trait_DynastyPerk_([A-Za-z]+?)(\d)$/);
  if (!pm) continue;
  const [, rawCat, tierStr] = pm;
  const tier = Number(tierStr);
  const iconRaw = xml.match(/<T n="icon"[^>]*>[0-9a-f]+:[0-9a-f]+:([0-9a-f]+)/i)?.[1] ?? null;
  const iconInstance = iconRaw && iconRaw !== PLACEHOLDER_ICON ? iconRaw : null;
  const displayName = xml.match(/<T n="display_name">[^<]*<!--([^>]*)-->/)?.[1];
  // Affinity perks carry a real display_name ("Mild/Moderate/Strong X Affinity");
  // hidden perks fall back to "<Pretty Name> <tier roman>".
  const category = rawCat.replace(/^Affinity/, '');
  const name = displayName ?? `${PERK_LABEL[rawCat] ?? rawCat} ${TIER_ROMAN[tier]}`.trim();
  perks.push({ hex, rawName, name, category, tier, iconInstance });
}

// Ideal/skill VALUES (the dynastyValue_* snippets in the Other/ subfolder). Their
// tuning uid is exactly what the save's dynasty definition record stores in its
// field-7 list (verified id-for-id against Slot_00000003). Separate from the
// IDEAL_MARKERS above (those 3 are encourage/discourage traits on the played dynasty).
interface Value { hex: string; name: string }
// Tuning filenames are EA's internal names; some differ from the in-game display
// name. Override to the real game name (verified by the user). Extend as needed.
// Real in-game display names where they differ from EA's internal tuning name
// (confirmed by the user).
const VALUE_DISPLAY_OVERRIDE: Record<string, string> = {
  Nature: 'Nature Loving',   // ideal (icon: natureloving)
  DJMixing: 'DJ Mixing',     // acronym prefix — space-split can't handle it
  CrossStitch: 'Cross-Stitch',
  EquestrianSkill: 'Horse Riding',
  ResearchDebate: 'Research & Debate',
  HomestyleCooking: 'Cooking',
  RanchNectar: 'Nectar Making',
  NLS: 'Natural Living',
};
// CamelCase → spaced ("GourmetCooking" → "Gourmet Cooking"). Icons are unaffected
// (the resolver strips non-alphanumerics).
const prettify = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2');
const idealValues: Value[] = [];
const skillValues: Value[] = [];
const otherDir = join(EXPORT_DIR, 'Other');
for (const f of readdirSync(otherDir)) {
  const m = f.match(/dynastyValue_(Ideal|Skill)_([A-Za-z]+)\.SnippetTuning\.xml$/i);
  if (!m) continue;
  const xml = readFileSync(join(otherDir, f), 'utf8');
  const s = xml.match(/<I [^>]*\bs="(\d+)"/)?.[1];
  if (!s) continue;
  const hex = '0x' + Number(s).toString(16);
  const name = VALUE_DISPLAY_OVERRIDE[m[2]] ?? prettify(m[2]);
  (m[1].toLowerCase() === 'ideal' ? idealValues : skillValues).push({ hex, name });
}

// Crest pieces: read public/dynasty-crests/_manifest.json (name -> instance hash, from
// extractCrests.ts) and key by the 16-char instance hash, which is exactly what the save's
// dynasty record stores (varint-encoded) for the fg symbol + bg background. So a parsed
// crest hash -> piece is a direct lookup, and the renderer composes fg over bg.
interface Crest { hash: string; asset: string; kind: 'bg' | 'fg'; style?: number; color?: string; symbol?: string }
const crests: Crest[] = [];
const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/dynasty-crests/_manifest.json'), 'utf8')) as Record<string, { instance: string }>;
for (const asset of Object.keys(manifest)) {
  const hash = manifest[asset].instance.toLowerCase().padStart(16, '0');
  const bg = asset.match(/^crest_bg_style(\d+)_([a-z]+)$/);
  const fg = asset.match(/^crest_fg_([a-z0-9]+)$/);
  if (bg) crests.push({ hash, asset, kind: 'bg', style: Number(bg[1]), color: bg[2] });
  else if (fg) crests.push({ hash, asset, kind: 'fg', symbol: fg[1] });
}

roles.sort((a, b) => b.precedence - a.precedence);
ideals.sort((a, b) => a.name.localeCompare(b.name));
perks.sort((a, b) => a.category.localeCompare(b.category) || a.tier - b.tier);
idealValues.sort((a, b) => a.name.localeCompare(b.name));
skillValues.sort((a, b) => a.name.localeCompare(b.name));
crests.sort((a, b) => a.asset.localeCompare(b.asset));

const q = (s: string) => JSON.stringify(s);
const lines: string[] = [];
lines.push(`/**`);
lines.push(` * In-game Dynasty (EP21 royalty system) trait catalog: tuning ID -> role / perk.`);
lines.push(` * Generated from an S4 Studio Dynasty export by`);
lines.push(` * scripts/diagnostics/buildStockDynasties.ts. Do not edit by hand.`);
lines.push(` *`);
lines.push(` * Keys are trait uids (hex) as they appear in a sim's parsed traitIds, so a`);
lines.push(` * member's role + unlocked perks resolve directly from traits. The dynasty`);
lines.push(` * grouping (which sims, name, description) comes from the 0x0d save record.`);
lines.push(` */`);
lines.push(``);
lines.push(`export interface StockDynastyRole {`);
lines.push(`  name: string;`);
lines.push(`  /** Higher wins when a sim carries several role traits (e.g. Founder+Head). */`);
lines.push(`  precedence: number;`);
lines.push(`}`);
lines.push(``);
lines.push(`export interface StockDynastyPerk {`);
lines.push(`  name: string;`);
lines.push(`  /** Mental | Physical | Creative | Social | EasyFriends | GradeBoost | Matchmaker | PartyPlanner | Secretive */`);
lines.push(`  category: string;`);
lines.push(`  tier: number;`);
lines.push(`  iconInstance: string | null;`);
lines.push(`}`);
lines.push(``);
lines.push(`export const STOCK_DYNASTY_ROLES: Record<string, StockDynastyRole> = {`);
for (const r of roles) lines.push(`  ${q(r.hex)}: { name: ${q(r.name)}, precedence: ${r.precedence} },`);
lines.push(`};`);
lines.push(``);
lines.push(`/** Ideal/skill encouragement MARKERS — trait ids on the actively-played dynasty's`);
lines.push(` *  members (distinct from the ideal/skill VALUES the dynasty record stores). */`);
lines.push(`export const STOCK_DYNASTY_IDEAL_MARKERS: Record<string, string> = {`);
for (const i of ideals) lines.push(`  ${q(i.hex)}: ${q(i.name)},`);
lines.push(`};`);
lines.push(``);
lines.push(`/** Dynasty IDEAL values — the tuning ids stored in the save's definition record`);
lines.push(` *  (field 7). Key = uid (hex). Every dynasty (premade included) carries 0..n of these. */`);
lines.push(`export const STOCK_DYNASTY_IDEALS: Record<string, string> = {`);
for (const v of idealValues) lines.push(`  ${q(v.hex)}: ${q(v.name)},`);
lines.push(`};`);
lines.push(``);
lines.push(`/** Dynasty SKILL values — tuning ids stored alongside ideals in the same field-7 list. */`);
lines.push(`export const STOCK_DYNASTY_SKILLS: Record<string, string> = {`);
for (const v of skillValues) lines.push(`  ${q(v.hex)}: ${q(v.name)},`);
lines.push(`};`);
lines.push(``);
lines.push(`export const STOCK_DYNASTY_PERKS: Record<string, StockDynastyPerk> = {`);
for (const p of perks) lines.push(`  ${q(p.hex)}: { name: ${q(p.name)}, category: ${q(p.category)}, tier: ${p.tier}, iconInstance: ${p.iconInstance ? q(p.iconInstance) : 'null'} },`);
lines.push(`};`);
lines.push(``);
lines.push(`/** Resolve a sim's displayed dynasty role from their trait ids (hex strings). */`);
lines.push(`export function resolveDynastyRole(traitHexIds: string[]): string | null {`);
lines.push(`  let best: StockDynastyRole | null = null;`);
lines.push(`  for (const id of traitHexIds) {`);
lines.push(`    const r = STOCK_DYNASTY_ROLES[id];`);
lines.push(`    if (r && (!best || r.precedence > best.precedence)) best = r;`);
lines.push(`  }`);
lines.push(`  return best ? best.name : null;`);
lines.push(`}`);
lines.push(``);
lines.push(`/** A sim's unlocked dynasty perks, resolved from trait ids (hex strings). */`);
lines.push(`export function resolveDynastyPerks(traitHexIds: string[]): StockDynastyPerk[] {`);
lines.push(`  return traitHexIds.map((id) => STOCK_DYNASTY_PERKS[id]).filter((p): p is StockDynastyPerk => !!p);`);
lines.push(`}`);
lines.push(``);
lines.push(`export interface StockCrestPiece {`);
lines.push(`  /** filename in /dynasty-crests/<asset>.png */`);
lines.push(`  asset: string;`);
lines.push(`  kind: 'bg' | 'fg';`);
lines.push(`  style?: number;`);
lines.push(`  color?: string;`);
lines.push(`  symbol?: string;`);
lines.push(`}`);
lines.push(``);
lines.push(`/** Crest resource-instance hash (16-char hex, as stored varint-encoded in the save) -> piece. */`);
lines.push(`export const STOCK_DYNASTY_CRESTS: Record<string, StockCrestPiece> = {`);
for (const c of crests) lines.push(`  ${q(c.hash)}: { asset: ${q(c.asset)}, kind: ${q(c.kind)}${c.kind === 'bg' ? `, style: ${c.style}, color: ${q(c.color!)}` : `, symbol: ${q(c.symbol!)}`} },`);
lines.push(`};`);
lines.push(``);
lines.push(`/** Resolve a dynasty crest from its two save hashes (fg symbol over bg shape/color). */`);
lines.push(`export function resolveCrest(bgHash: string | null, fgHash: string | null): { bg: StockCrestPiece | null; fg: StockCrestPiece | null } {`);
lines.push(`  return {`);
lines.push(`    bg: bgHash ? STOCK_DYNASTY_CRESTS[bgHash.toLowerCase().padStart(16, '0')] ?? null : null,`);
lines.push(`    fg: fgHash ? STOCK_DYNASTY_CRESTS[fgHash.toLowerCase().padStart(16, '0')] ?? null : null,`);
lines.push(`  };`);
lines.push(`}`);
lines.push(``);
lines.push(`/** Split a dynasty's field-7 value-id list (hex) into named ideals + skills. */`);
lines.push(`export function resolveDynastyValues(valueHexIds: string[]): { ideals: string[]; skills: string[] } {`);
lines.push(`  const ideals: string[] = [];`);
lines.push(`  const skills: string[] = [];`);
lines.push(`  for (const id of valueHexIds) {`);
lines.push(`    if (STOCK_DYNASTY_IDEALS[id]) ideals.push(STOCK_DYNASTY_IDEALS[id]);`);
lines.push(`    else if (STOCK_DYNASTY_SKILLS[id]) skills.push(STOCK_DYNASTY_SKILLS[id]);`);
lines.push(`  }`);
lines.push(`  return { ideals, skills };`);
lines.push(`}`);
lines.push(``);

writeFileSync(OUTPUT, lines.join('\n'));
console.log(`Wrote ${OUTPUT}: ${roles.length} roles, ${ideals.length} ideal markers, ${perks.length} perks, ${idealValues.length} ideals, ${skillValues.length} skills, ${crests.length} crest pieces.`);
