/**
 * Coherence enforcement for re-sync — the "yield" half of the model in
 * docs/planner-coherence-invariants.md: a plan that reality makes impossible
 * yields to reality.
 *
 * Currently covers the business↔lot reality-collision (invariant B2): after a
 * re-sync moves real households around, a business planned onto a residential lot
 * that a household (NOT including the owner) now occupies can no longer be a home
 * business there, so it's unassigned from that lot.
 *
 * Scope is deliberately "reality-collisions only" — states you author by hand are
 * prevented at authoring time (the editor), not policed here. So this only fires
 * where a *game* household occupies the lot; purely-planned situations are left
 * alone. Pure + unit-tested so the same rule can back editor prevention later.
 */

/**
 * The lots a business must yield: each of its (post-reconciliation) lots that a
 * game household occupies without the owner being a member.
 *
 * Applies to BOTH imported and planner-only businesses — a business you planned
 * onto an empty lot collides just the same when a real household later moves
 * onto it. The owner may be a planner-only sim with no source_id yet; such an
 * owner is by definition not among the save's residents, so any game-occupied
 * lot yields (the plan can't survive reality moving in).
 *
 * @param hasOwner       whether the business has an owner set at all
 * @param ownerSourceId  the owner's sim source_id (hex), or null when the owner
 *        is a planner-only sim not present in the save
 * @param businessLots   the business's lot_keys after lot reconciliation
 * @param residentSourcesByLot  lot_key → set of resident sim source_ids (hex)
 *        drawn from the incoming save (game households only)
 */
export function businessLotsToYield(
  hasOwner: boolean,
  ownerSourceId: string | null,
  businessLots: string[],
  residentSourcesByLot: Map<string, Set<string>>,
): string[] {
  // No owner at all is a B6 concern handled at authoring time, not a B2
  // reality-collision.
  if (!hasOwner) return [];
  return businessLots.filter((lot) => {
    const residents = residentSourcesByLot.get(lot);
    // Only a lot a game household actually occupies is a collision. An empty or
    // plan-only-occupied lot is left alone (authoring-time concern).
    if (!residents || residents.size === 0) return false;
    // Owner living there → legit home business, no yield. Owner is planner-only
    // (no source_id) → never a save resident → yields.
    return ownerSourceId === null || !residents.has(ownerSourceId);
  });
}

/**
 * Lots a business must yield because their game-reported type can no longer host
 * a small business at all — e.g. the player rezoned a dedicated venue lot into a
 * Cafe or Retail venue. Independent of residency: a Cafe with nobody on it still
 * can't hold the business. Only Residential / Tiny Home / Small Business Venue
 * types keep a business (the residency collision on residential lots is handled
 * separately by businessLotsToYield).
 *
 * @param businessLots    the business's lot_keys (planner side)
 * @param gameTypeByLot   lot_key → the save's reported lot type
 * @param isEligibleType  predicate: can this lot type host a small business?
 */
export function businessLotsOnIncompatibleType(
  businessLots: string[],
  gameTypeByLot: Map<string, string>,
  isEligibleType: (type: string) => boolean,
): string[] {
  return businessLots.filter((lot) => {
    const gameType = gameTypeByLot.get(lot);
    if (gameType === undefined) return false; // unknown to the save — can't judge
    return !isEligibleType(gameType);
  });
}

/**
 * Clubs whose hangout lot can no longer be a hangout — the save reports the lot
 * as a club-ineligible type (Rental / Vacation Rental / University Housing; see
 * isClubHangoutEligible / coherence invariant C2). The club is unassigned from
 * the lot. The exact sibling of businessLotsOnIncompatibleType: it keys off the
 * save's reported type, so a lot the game turned into a Vacation Rental drops
 * its clubs even though the lot-type merge would keep the planner's value.
 *
 * Only specific-lot hangouts collide — a general-venue hangout (hangoutVenueTypeId,
 * no assignedLotKey) isn't lot-bound, so pass its lot as null and it's skipped.
 *
 * @param clubLotByClubId  club planner id → its assigned hangout lot_key (or null)
 * @param gameTypeByLot    lot_key → the save's reported lot type
 * @param isEligibleType   predicate: can this lot type host a club hangout?
 */
export function clubsToYield(
  clubLotByClubId: Map<string, string | null>,
  gameTypeByLot: Map<string, string>,
  isEligibleType: (type: string) => boolean,
): { clubId: string; lotKey: string }[] {
  const out: { clubId: string; lotKey: string }[] = [];
  for (const [clubId, lotKey] of clubLotByClubId) {
    if (!lotKey) continue; // no specific-lot hangout — nothing to yield
    const gameType = gameTypeByLot.get(lotKey);
    if (gameType === undefined) continue; // unknown to the save — can't judge
    if (!isEligibleType(gameType)) out.push({ clubId, lotKey });
  }
  return out;
}

/**
 * Lots a PLANNER-authored custom venue must let go of, and why. A venue you
 * built keeps its name, roles and schedule whatever happens — only its claim on
 * a lot can become impossible, and there are exactly two ways for that:
 *
 *  - 'taken'   — the save now reports a custom venue on that very lot. Identity
 *                here is the lot, so the two can't both hold it; the real one
 *                takes the address and your design stays, lot-less, ready to go
 *                somewhere else. Without this the sync tries to create a second
 *                venue on the lot, the unique constraint refuses it, and the
 *                same failure repeats on every future sync.
 *  - 'retyped' — the lot's type, after the lot merge, is no longer 'Custom
 *                Venue'. A venue lot IS that type, so a lot the game rezoned
 *                can't run a schedule any more.
 *
 * Deliberately takes the RESOLVED post-merge lot type, not the save's raw one: a
 * lot the planner itself converted reads as Residential in the save while the
 * merge correctly keeps the planner's Custom Venue, and judging on the raw value
 * would make every planned venue yield its lot on the very first sync.
 *
 * @param plannerVenues     planner-authored venues that hold a lot
 * @param venueLotKeysInSave lot_keys the incoming save reports a custom venue on
 * @param resolvedTypeByLot lot_key → the lot type this sync will end up writing
 */
export function venueLotsToRelease(
  plannerVenues: { venueId: string; lotKey: string }[],
  venueLotKeysInSave: Set<string>,
  resolvedTypeByLot: Map<string, string>,
): { venueId: string; lotKey: string; reason: 'taken' | 'retyped' }[] {
  const out: { venueId: string; lotKey: string; reason: 'taken' | 'retyped' }[] = [];
  for (const { venueId, lotKey } of plannerVenues) {
    if (venueLotKeysInSave.has(lotKey)) { out.push({ venueId, lotKey, reason: 'taken' }); continue; }
    const type = resolvedTypeByLot.get(lotKey);
    if (type !== undefined && type !== 'Custom Venue') out.push({ venueId, lotKey, reason: 'retyped' });
  }
  return out;
}

/**
 * Lots whose dedicated-venue type must yield to reality. A "Small Business
 * Venue" is an absentee lot — it can't host residents. If a game household now
 * lives on a lot the planner types as a Small Business Venue, the venue
 * conversion is impossible, and the lot takes the game's reported (residential)
 * type instead.
 *
 * Deliberately independent of any business: the type is a property of the lot,
 * not of whatever business happened to sit on it. So a lot left stranded as a
 * venue after its business already moved off (or was yielded in an earlier
 * sync) still gets corrected here. This also means the diffLots "keep planner
 * edit when the save matches the seed default" rule can't strand a venue on an
 * occupied lot — residency makes the venue type impossible, full stop.
 *
 * @param plannerVenueLots  lot_keys the planner currently types 'Small Business Venue'
 * @param residentSourcesByLot lot_key → resident sim source_ids (game households)
 * @param gameTypeByLot     lot_key → the save's reported lot type
 */
export function venueLotsToRevert(
  plannerVenueLots: string[],
  residentSourcesByLot: Map<string, Set<string>>,
  gameTypeByLot: Map<string, string>,
): { lotKey: string; gameType: string }[] {
  const out: { lotKey: string; gameType: string }[] = [];
  for (const lotKey of plannerVenueLots) {
    const residents = residentSourcesByLot.get(lotKey);
    if (!residents || residents.size === 0) continue; // empty venue is fine
    const gameType = gameTypeByLot.get(lotKey);
    // Only revert to a *known, different* real type. If the save still reports
    // the lot as a venue (shouldn't happen with residents), leave it alone.
    if (gameType && gameType !== 'Small Business Venue') out.push({ lotKey, gameType });
  }
  return out;
}
