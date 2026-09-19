# Planner coherence invariants

The planner represents a **valid future save** — a game state you could actually
reach — not a free-form whiteboard. Any combination that can never exist in the
game must never exist in the planner.

These invariants are the single shared definition that **two enforcement points**
uphold:

- **Authoring** — the editor prevents you from creating an impossible state.
- **Re-sync** — reconciliation never produces one. See the principle below.

## Reconciliation principle

> **An achievable plan persists; a plan that reality makes impossible yields to
> reality — with a notice.**

- Renaming a lot is achievable → it sticks (even if the save still has the
  default). This is why lots reconcile statelessly (see `diffLots`): planner vs
  save vs seed-default, no baseline.
- A household moving onto a lot you'd planned a business onto makes that plan
  **impossible** (violates B2) → the business plan yields, and the user is told
  *why* ("Bob moved in, so the business plan on that lot was cleared").

The key distinction from the old silent-revert bug: silently dropping an
**achievable** edit for no reason is bad; yielding an **impossible** plan to
reality *with a visible cause* is correct.

## Lot categories

Source: `getLotCategory` in `src/data/worlds.ts`.

- **home** — Residential, Tiny Home Residential, Apartment, Penthouse,
  Haunted House, Residential Rental
- **rental** — Rental, Vacation Rental
- **venue** — everything else, including **Small Business Venue**

## Households

- **H1** Households live only on `home`-category lots.
- **H2** 1 household per home lot; **6** per Residential Rental; 0 on
  rental/venue lots.

## Businesses

Two distinct shapes — a *home business* on a residence, and a *dedicated* venue:

- **B1** A business sits only on **Residential**, **Tiny Home Residential**, or
  **Small Business Venue**. Never Residential Rental, never any other type.
  (A sim living in a rental must use a Small Business Venue.)
- **B2** **Home business** (Residential / Tiny Home): the lot has a resident
  household, and **every** business on it is owned by a **member of that
  household**. — Bob+Mike (married, both resident, one business each) ✓;
  Mike's business on Bob's lot ✗.
- **B3** **Dedicated** (Small Business Venue): no household lives there; the
  owner can be **anyone** (absentee owner OK). A residential lot bought purely
  to run a business auto-converts to Small Business Venue; a business run from
  the home you live in keeps the lot **Residential**.
- **B4** Multiple businesses per lot are allowed (one per resident-owner).
- **B5** A sim owns **at most one** business.
- **B6** A business **always** has an owner — no ownerless/dangling business.
  (The create flow assigns one; there is no valid "⚠ no owner" end state.)

## Clubs

- **C1** Multiple clubs may share one hangout lot.
- **C2** Ineligible hangout types: **Rental, Vacation Rental, University
  Housing**. Everything else — including **Apartment** and **Residential
  Rental** — is eligible.
  - The exact allowlist should ultimately be verified against the game's
    venue-type tuning rather than memory.
  - **Re-sync yield BUILT** (`clubsToYield`): when the save reports a club's
    hangout lot as an ineligible type, the club is unassigned from it (summary:
    "N clubs removed from their hangouts"). The exact sibling of the business
    incompatible-type yield.

## Enforcement — how the two points work

**Re-sync (yield) — BUILT.** A business is unassigned from a lot the plan can no
longer put it on, from either of two reality-collisions (each colliding lot
drops once; the review summary shows "N businesses removed from their lots"):

- **Occupancy** (`businessLotsToYield`) — a game household (not including the
  owner) now lives on the lot. Keys off *game* household occupancy, so
  purely-planned states are left for the editor to prevent. Covers both imported
  and planner-only businesses; a planner-only owner (no source_id) is never a
  save resident, so the lot yields.
- **Type** (`businessLotsOnIncompatibleType`) — the player rezoned the lot to a
  type that can't host a small business (Cafe, Retail, …), i.e. not in
  `SB_ELIGIBLE_LOT_TYPES`. The lot's *type* follows reality via the normal lot
  diff; this drops the business off it.

Separately, **venue-lot type reversion** (`venueLotsToRevert`) returns a lot the
planner still types "Small Business Venue" to the game's reported (residential)
type once a household lives there — independent of any business, so a lot
stranded as a venue after its business already moved off still self-heals
(counted as a plain lot update). All pure/tested in
`src/lib/reimport/coherence.ts`.

**Editor (prevention) — BUILT.** Relationships are authored from each entity's
own editor; the lot editor shows them read-only ("On this lot" panel with
jump-links). A business can no longer be placed from the lot editor at all, so
an impossible placement can't be authored there.

- **Businesses are authored only from the business editor, owner-first** (not the
  lot editor). Because a business has an owner, its valid lots derive from the
  owner and the impossibility can't be born:
  - the owner's **own home** (occupied by the owner's household) → home business,
    lot **stays Residential**;
  - any **empty SB-eligible lot** → dedicated venue, **auto-converts to Small
    Business Venue**.
  - A lot occupied by *someone else's* household, and ineligible types, are not
    offered.
  - **The conversion is the business's doing, so it undoes when the business
    leaves** — removing the last business reverts the type (to default / reality),
    so no orphaned "Small Business Venue" gets stuck across re-imports.
- **Clubs are authored only from the club editor** (consistency — clubs have no
  coherence trap, but the dual-authoring pattern is the same).
- **Lot editor** owns the lot's *own* fields (name, type, status, notes, photos)
  and shows a read-only **"On this lot"** panel — households · business · club —
  each with a jump-link to its editor; empty rows show a quiet "add in X →"
  affordance rather than hiding, for discoverability.
- **Households**: authoring could likewise move to the household workspace (which
  already assigns lots), making the lot editor a pure viewer. Lower-risk to leave
  dual (no coherence trap) — a conscious scope choice, leaning "move it too".

## Notes on provenance

Confirmed by the project owner (Sims domain expert), 2026-07-24. The Bob+Mike
home-business lot **stays Residential** in the save — verified against a real
save — so the planner's existing shape already represents home businesses
correctly; no new lot type is needed.
