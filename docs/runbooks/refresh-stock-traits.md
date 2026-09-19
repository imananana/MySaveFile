# Runbook — Refresh `STOCK_TRAITS` after a new pack

`src/data/stockTraits.ts` catalogs every CAS-pickable personality trait in The Sims 4 — base game plus every pack. When EA ships a new pack that adds personality traits (Get Together added "Outgoing", Vampires added "Lactose Intolerant", Horse Ranch added "Horse Lover", etc.), this catalog needs refreshing or the new traits will show up as `null` from `lookupTrait()` and won't render in the UI.

It's not automatic — refresh is a manual ~10-minute task after a pack release. This runbook is the procedure.

## When to run

- Every time EA ships a new expansion / game pack / stuff pack that touches CAS.
- If you notice a sim with a hex trait ID that resolves to `null` and you can confirm in-game it's a real CAS-pickable personality trait (not a hidden / lifestyle / reward / mod trait).
- If the in-game UI shows a localized name change for an existing trait (rare — EA sometimes renames traits like "Insane" → "Erratic").

## Prerequisites

- **Sims 4 Studio** (S4S) installed and pointed at your live game install.
- The repo cloned locally with Node.js available.

## Steps

### 1. Dump all trait tuning files from the live game

In S4S:

1. **Tools → Extract Tuning** (older versions: under "Misc Tools").
2. In the filter / search box, type `trait_` to narrow to trait files.
3. **Select all** in the result list.
4. **Export** to a folder. The default `~/Documents/Trait Export/` is fine — that's what the script defaults to.

S4S writes one XML per resource. The dump will contain `*.TraitTuning.xml`, `*.SimData.xml`, `*.BuffTuning.xml`, etc. — that's expected. The build script only reads the `*.TraitTuning.xml` files. Roughly 12,000 files / 100 MB on disk for a full pack-installed game.

### 2. Run the build script

From the repo root:

```bash
EXPORT="$HOME/Documents/Trait Export" npx tsx scripts/diagnostics/buildStockTraits.ts
```

(Or set `EXPORT=` to wherever you dumped the files.)

The script:

1. Walks every `*.TraitTuning.xml`.
2. Filters to `<E n="trait_type">PERSONALITY</E>` (the universe of CAS-pickable personality traits — base + packs).
3. Skips pet-species default traits matching `*_Default` (EA mis-labels these as PERSONALITY).
4. Extracts EA's official localized display name from the `<T n="display_name">…<!-- Real Name --></T>` XML comment (so "Insane" reads as "Erratic", "HOS_EV009Reward" reads as "Heart on Your Sleeve").
5. Extracts `<L n="ages">` for lifestage gating (infant traits, toddler traits, elder gets adult + Wise, teens can't pick Ambitious, etc.).
6. Sorts alphabetically by display name and writes the new `src/data/stockTraits.ts`.

The script also prints a `Trait count by lifestage` summary at the end. Quick sanity-check expected values (will shift if EA adds new traits):

| Lifestage | Approx count (as of 2026-06) |
|---|---|
| infant     | 6  |
| toddler    | 8  |
| child      | 46 |
| teen       | ~78 |
| youngAdult | ~81 |
| adult      | ~81 |
| elder      | ~82 (adult + Wise) |

If the counts dropped or a familiar trait disappeared, something filtered wrong — check the `trait_type distribution` block in the script output for the new pack's category names.

### 3. Verify with a known sim

```bash
SAVE="$HOME/Documents/Electronic Arts/The Sims 4/saves/Slot_00000004.save" \
  npx tsx scripts/diagnostics/diagBellaTraits.ts
```

Bella Goth's three default CAS picks (Romantic, Good, Family Oriented) should resolve. If they don't, the build script broke; revert `src/data/stockTraits.ts`, investigate, and rerun.

### 4. Commit

```bash
git add src/data/stockTraits.ts
git commit -m "Refresh STOCK_TRAITS for <pack-name>"
```

That's it. No type-check or migration needed — the catalog just expanded.

## Adding a brand-new pet species

If a new pack adds a species (e.g. raccoons in some future Cottage Living refresh), its hidden "default" trait will likely also be a `*_Default` name. The build script already skips that pattern, so no code change needed. If EA breaks the pattern, add the species to the rawName skip block in `buildStockTraits.ts`.

## What this runbook does NOT cover

- **Aspirations** — separate catalog (`STOCK_ASPIRATIONS`), separate S4S export. See `refresh-stock-aspirations.md` when that exists.
- **Hidden / lifestyle / reward traits** — intentionally filtered out by trait_type. These exist in the parser's `traitIds` field on `ParsedSim` but never resolve through `lookupTrait`. If a future feature needs to surface them (e.g. "show my sim's accumulated lifestyle traits"), add a new map alongside `STOCK_TRAITS` rather than expanding it.
- **Mod traits** — third-party trait tuning IDs will not resolve through `lookupTrait` and that is correct. Mod-added personality traits show as `null` and get filtered out at display time. If a player wants their mod traits to show up in the planner, this is a per-save extension we haven't built yet.

## Files this runbook touches

| File | Role |
|---|---|
| `scripts/diagnostics/buildStockTraits.ts` | The build script run in step 2. |
| `src/data/stockTraits.ts` | Generated output. Don't hand-edit — re-run the script. |
| `scripts/diagnostics/diagBellaTraits.ts` | Verification diagnostic. |
| `~/Documents/Trait Export/` | Temporary dump from S4S. Delete after committing if you want the disk space back. |
