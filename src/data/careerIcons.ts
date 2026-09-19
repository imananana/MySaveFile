// Career icon files in /public/career-icons/ are named by the career's tuning id
// (hex, no 0x), joined EXACTLY through the career's trunk track:
//   CareerTuning <T n="start_track"> -> CareerTrackTuning <T n="icon"> ResourceKey
// (see scripts/diagnostics/buildCareerIcons.ts). Resolve career icons by ID, never
// by name/slug. Careers whose trunk track declares no icon have no file here.
export const CAREER_ICON_IDS = new Set<string>([
  '19e94', '19fda', '19fdc', '1a2de', '1a2f7', '21021', '210c3', '213b3',
  '240f', '2d72f', '2d891', '2e2cf', '2f2b2', '30a6a', '316f3', '320a0',
  '3235e', '32376', '325d', '327c7', '32ad0', '32adb', '32af7', '32e15',
  '32f53', '32f61', '32f79', '32f8b', '32fea', '32ff1', '346fe', '35004',
  '35310', '359c7', '35ef1', '36842', '38d3f', '38d69', '3c9fb', '3dab1',
  '3ef8e', '42df7', '42df8', '4387a', '4387b', '4387c', '4387d', '43c9e',
  '43c9f', '56416', '59884', '5c2f2', '5c317', '6b344', '6d17', '6d19',
  '6d1a', '6d1b', '6d1c', '6d1d', '6e980', '71d80', '8955', '8992',
  '8993', '8994', '8995',
]);

/** /career-icons/<idHex>.png for a career tuning id, or null if we have no art. */
export function careerIconUrlById(idHex: string): string | null {
  const k = idHex.replace(/^0x/, '').toLowerCase();
  return CAREER_ICON_IDS.has(k) ? `/career-icons/${k}.png` : null;
}
