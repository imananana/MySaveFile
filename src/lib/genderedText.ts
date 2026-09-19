/**
 * Resolve EA's gendered localization tokens in tuning display strings.
 *
 * Aspiration and trait flavor text occasionally embed gendered variants
 * inline using the EA template syntax:
 *
 *   "{F0.Lady}{M0.Lord} of the Knits"   → female: "Lady of the Knits"
 *                                        → male:   "Lord of the Knits"
 *   "Master {F0.Actress}{M0.Actor}"      → female: "Master Actress"
 *                                        → male:   "Master Actor"
 *
 * The token format is `{Fn.X}` (use X if the n-th sim is female) and
 * `{Mn.Y}` (use Y if male), where n is a 0-based sim index in the
 * containing message — for aspirations/traits the subject sim is always
 * index 0, so we ignore n.
 *
 * Currently used by the randomizer and household roster to display
 * gendered aspiration names. Pure function; safe everywhere.
 */
export function resolveGenderedText(template: string, gender: 'male' | 'female'): string {
  return template.replace(/\{([FM])\d+\.([^}]+)\}/g, (_match, marker, text) => {
    if (marker === 'F' && gender === 'female') return text;
    if (marker === 'M' && gender === 'male') return text;
    return '';
  });
}
