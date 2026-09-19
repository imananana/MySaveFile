/**
 * Household ORIGIN classification — "Yours vs EA vs Mod".
 *
 * Primary axis is HouseholdData.f9 (ParsedHousehold.playerEngaged): present iff the save
 * owner created / CAS-edited / moved a sim into / played the household. This was found by
 * differential field discovery and validated against ground truth across several saves
 * (built/edited households + adopted townies all carry f9; untouched EA premades, generated
 * townies, and scripted role NPCs do not). The gallery creator stamp (f20/f21) is a strict
 * subset of f9 and is used only for attribution detail, never to bucket.
 *
 * Sub-labels lean on the bundled catalogs (stockPremadeSurnames, stockRoleTraits), which are
 * generated from the full SimTemplate tuning by scripts/diagnostics/buildProvenanceCatalogs.ts.
 */
import { readVarint, readFixed64LE, readString } from './protobuf';
import { PREMADE_SURNAMES, PREMADE_HOUSEHOLD_NAMES, PREMADE_SOLO_FIRST_NAMES } from '../../data/stockPremadeSurnames';
import { ROLE_TRAITS } from '../../data/stockRoleTraits';
import type { ParsedHousehold, ParsedSim, HouseholdOrigin } from './types';

// System/mod stamps that name a generator, not a human creator.
const MOD_STAMPS = new Set(['mc_population']);

/**
 * Owner = the account that last saved this file. Sim records carry it at field 23
 * (wt1 fixed64, last-saver), uniform across the save. We sample sim anchors and take
 * the dominant value (cheap — stops after a bounded number of sims).
 */
export function extractSaveOwnerAccount(buf: Uint8Array): bigint | null {
  const tally = new Map<bigint, number>();
  let sampled = 0;
  for (let i = 0; i + 40 < buf.length && sampled < 200; i++) {
    if (buf[i] !== 0x09) continue;
    let p = i + 9;
    if (buf[p] !== 0x11) continue; p += 9;            // f2 lotId
    if (buf[p] !== 0x18) continue; p++;               // f3 ts (varint)
    let n: number; try { [, n] = readVarint(buf, p); } catch { continue; } p = n;
    if (buf[p] !== 0x21) continue; p += 9;            // f4 hhId
    if (buf[p] !== 0x2a) continue; p++;               // f5 first name (string)
    try { [, p] = readString(buf, p); } catch { continue; }
    if (buf[p] === 0x32) { p++; try { [, p] = readString(buf, p); } catch { /* */ } } // f6 last name
    if (buf[p] !== 0x38) continue;                    // f7 gender — confirms a sim record
    // walk the body for f23 (last-saver acct)
    let q = p; const end = Math.min(buf.length, p + 30000); let saver: bigint | null = null;
    while (q < end) {
      if (buf[q] === 0) break; let t: bigint, m: number; try { [t, m] = readVarint(buf, q); } catch { break; } q = m;
      const fn = Number(t >> 3n), wt = Number(t & 7n);
      if (wt === 0) { const [, x] = readVarint(buf, q); q = x; }
      else if (wt === 1) { if (fn === 23) { saver = readFixed64LE(buf, q); break; } q += 8; }
      else if (wt === 2) { const [l, x] = readVarint(buf, q); q = x + Number(l); }
      else if (wt === 5) q += 4; else break;
    }
    if (saver && saver !== 0n) { tally.set(saver, (tally.get(saver) ?? 0) + 1); sampled++; }
  }
  let best: bigint | null = null, bestN = 0;
  for (const [acct, n] of tally) if (n > bestN) { best = acct; bestN = n; }
  return best;
}

/** Classify one household's origin. `simsById` resolves member surnames + role traits. */
export function classifyHousehold(
  hh: ParsedHousehold,
  simsById: Map<bigint, ParsedSim>,
  ownerAccountId: bigint | null,
): HouseholdOrigin {
  const members = hh.simIds.map((id) => simsById.get(id)).filter((s): s is ParsedSim => !!s);
  const isPremade =
    members.some((m) => m.lastName && PREMADE_SURNAMES.has(m.lastName.toLowerCase())) ||
    // Surname-less premades (Baby Ariel, Mayor Whiskers, the Batuu cast…):
    // tuning defines them first-name-only, so the surname catalog misses them.
    // Empty-surname requirement keeps generated townies (always first+last) out.
    members.some((m) => !m.lastName && m.firstName && PREMADE_SOLO_FIRST_NAMES.has(m.firstName.toLowerCase())) ||
    PREMADE_SURNAMES.has(hh.name.toLowerCase()) ||
    PREMADE_HOUSEHOLD_NAMES.has(hh.name.toLowerCase());
  const roleNpc =
    members.flatMap((m) => m.traitIds).map((t) => ROLE_TRAITS['0x' + t.toString(16)]).find(Boolean) ?? null;

  const creator = hh.creatorName;
  const c = (creator ?? '').toLowerCase();
  const isOwnerBuild = ownerAccountId != null && hh.creatorAccountId === ownerAccountId;

  if (hh.playerEngaged) {
    // YOURS: the owner engaged this household. Sub-label by how it got here.
    const downloaded = !!creator && !MOD_STAMPS.has(c) && !isOwnerBuild;
    const sub = downloaded ? 'downloaded' : isPremade ? 'adopted-ea' : 'built';
    return { bucket: 'yours', sub, creator: downloaded ? creator : null, isOwnerBuild, roleNpc };
  }
  if (MOD_STAMPS.has(c)) {
    return { bucket: 'mod', sub: 'mod-gen', creator, isOwnerBuild: false, roleNpc };
  }
  // EA: never engaged by the owner.
  const sub = isPremade ? 'premade' : roleNpc ? 'service' : 'townie';
  return { bucket: 'ea', sub, creator: null, isOwnerBuild: false, roleNpc };
}
