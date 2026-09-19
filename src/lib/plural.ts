/**
 * "1 club" / "11 clubs" — a count and its noun, in one string.
 *
 * Both irregular plurals (dynasty → dynasties, small business → small
 * businesses) and regular ones are spelled out at the call site rather than
 * derived, because the derivation is wrong often enough in this vocabulary that
 * a rule would need more exceptions than words.
 */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
