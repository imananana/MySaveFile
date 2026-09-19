// Skill icon files in /public/skill-icons/ are named by the skill's tuning id
// (hex, no 0x), joined EXACTLY on each StatisticTuning's <T n="icon"> ResourceKey
// (see scripts/diagnostics/buildSkillIcons.ts). Resolve skill icons by ID, never
// by name. 76/81 skills have one; the rest have no icon in their tuning.
export const SKILL_ICON_IDS = new Set<string>([
  '18e20', '19706', '19d2e', '1b51e', '1b51f', '1b520', '1cc62', '1db0c',
  '1f491', '213cc', '21a53', '2238a', '224d8', '225a2', '23611', '248a1',
  '26bc3', '272f8', '275a6', '275c4', '2a89d', '2aa5f', '2d94f', '2f08f',
  '2f8a7', '33e51', '3422c', '35145', '35f56', '36da0', '389e4', '39536',
  '3a7a1', '3bf6d', '3bf87', '3c126', '3e511', '3f6ae', '4113', '4137',
  '413a', '413b', '413c', '413d', '413e', '413f', '4140', '4141',
  '4142', '4143', '4144', '4145', '4146', '4148', '4149', '414a',
  '414e', '414f', '4150', '4151', '42f15', '4d171', '4ec94', '55afc',
  '5a02c', '5a9b9', '5ab19', '5ce4f', '6a2dd', '6b3b6', '6dea6', '6e5e3',
  '6eeb8', '6fff6', '72b9b', '99e5',
]);

/** /skill-icons/<idHex>.png for a skill tuning id, or null if we have no art.
 *  Accepts ids with or without the `0x` prefix (STOCK_SKILLS keys carry it). */
export function skillIconUrlById(idHex: string): string | null {
  const k = idHex.toLowerCase().replace(/^0x/, '');
  return SKILL_ICON_IDS.has(k) ? `/skill-icons/${k}.png` : null;
}
