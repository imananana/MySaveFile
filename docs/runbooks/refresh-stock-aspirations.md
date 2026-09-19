# Runbook — Refresh `STOCK_ASPIRATIONS` after a new pack

`src/data/stockAspirations.ts` catalogs every CAS-pickable aspiration track in The Sims 4 — base game plus every pack. `primary_aspiration` on each sim stores an AspirationTrack tuning ID; this catalog resolves the ID to a display name + lifestage gating.

Like traits, this isn't automatic — refresh is a manual task after a pack release.

## When to run

- Every time EA ships a new expansion / game pack / stuff pack that adds aspirations.
- If a sim's `aspirationId` resolves to `null` from `lookupAspiration()` and you can confirm in-game it's a real CAS-pickable aspiration.

## Prerequisites

- **Sims 4 Studio** (S4S) installed and pointed at your live game install.
- The repo cloned locally with Node.js available.

## Steps

### 1. Dump aspiration tracks from S4S

**Important:** S4S's free-text search for "aspiration" pulls in *Objective* files whose names contain "Asp_" (e.g. `objective_Asp_Popularity_A1_1`). Those are the wrong things — they're the leaf goals inside each aspiration, not the track itself. You want the **AspirationTrackTuning** class specifically.

In S4S:

1. **Tools → Extract Tuning**.
2. In the search box, type: `Track_` (note capital T, trailing underscore). Results should be things like `Track_Love_A`, `Track_Knowledge_C`, `Track_Popularity_C`. Each file's `i=""` attribute is `aspiration_track`.
3. If that filter doesn't work in your S4S version, try filtering by Tuning Type / Class = `AspirationTrack` instead.
4. **Select all results.**
5. Export to a folder. The default `~/Documents/Aspirations/` is what the script defaults to — if you have stale data there from a prior wrong-type export, delete it first.

You should see ~104 `*.AspirationTrackTuning.xml` files in the export (plus their SimData siblings — those are ignored). If you see thousands of `*.ObjectiveTuning.xml` files, the type filter is wrong and you need to redo the export.

### 2. Run the build script

From the repo root:

```bash
EXPORT="$HOME/Documents/Aspirations" npx tsx scripts/diagnostics/buildStockAspirations.ts
```

The script:

1. Walks every `*.AspirationTrackTuning.xml`.
2. Extracts `<T n="display_text">…<!--Real Name--></T>` (EA's localized aspiration name) and `<T n="description_text">…<!--Flavor--></T>` (the CAS subtitle).
3. Reads `<T n="category">…<!--Asp_Cat_X--></T>` to determine lifestage eligibility:
   - `Asp_Cat_*` → teen, youngAdult, adult, elder (most aspirations)
   - `Asp_Teen` → teen-only (e.g. Goal Oriented, Live Fast)
   - `Asp_Chld_Cat_*` and `Asp_Chld_cat_*` → child-only (Whiz Kid, Rambunctious Scamp, etc.)
   - `FTUECategory`, `ChallengeCategory`, `General` → skipped (tutorial intros and challenge-mode tracks aren't normal CAS picks)
4. **Filters out `<T n="is_hidden_unlockable">True</T>`** — these are post-gameplay unlocks that don't show in CAS. Includes: Grilled Cheese (Easter egg), Soul's Journey (after death), Harmonious / Discordant Fairy (after Fairy Stories Initiation), Lone Wolf / Emissary / Wildfang / Cure Seeker (after Werewolf Initiation), and Paragon of Hope / Enforcer of Order (Star Wars faction completion). Vampire and Spellcaster aspirations are NOT in this filter — they're immediately CAS-pickable once the sim is the right occult.
5. Sorts by display name and writes `src/data/stockAspirations.ts`.

Quick sanity-check counts (as of 2026-06):

| Lifestage | Count |
|---|---|
| child      | 9  |
| teen       | 79 |
| youngAdult | 75 |
| adult      | 75 |
| elder      | 75 |

The script prints any aspiration whose category isn't in the lifestage map. If a new pack ships a new category (e.g. `Asp_Cat_Mermaid`), add it to `CATEGORY_AGES` in `buildStockAspirations.ts` and re-run.

### 3. Verify

A Bella Goth check is the easiest:

```bash
SAVE="$HOME/Documents/Electronic Arts/The Sims 4/saves/Slot_00000004.save" \
  npx tsx scripts/diagnostics/diagBellaAspiration.ts
```

If she has the Party Animal aspiration in-game, her `0x62bd` ID should resolve to `Party Animal`.

### 4. Commit

```bash
git add src/data/stockAspirations.ts
git commit -m "Refresh STOCK_ASPIRATIONS for <pack-name>"
```

## Why "Track" tuning files and not "Aspiration" tuning files?

In modern TS4, the data hierarchy is:

```
AspirationTrack (player picks ONE)
├── Aspiration_X1  ← Level 1 milestone
├── Aspiration_X2  ← Level 2
├── Aspiration_X3  ← Level 3
└── Aspiration_X4  ← Level 4 (completes the track, gives the bonus trait)
```

`SimData.primary_aspiration` stores the **track** ID. Individual aspiration milestones (each named `aspiration_<Cat>_<Letter><Num>` — e.g. `aspiration_Popularity_C2`) are an internal progression detail; the player never picks a milestone directly. So the catalog covers tracks, not milestones.

## Files this runbook touches

| File | Role |
|---|---|
| `scripts/diagnostics/buildStockAspirations.ts` | Build script. |
| `src/data/stockAspirations.ts` | Generated output. Don't hand-edit. |
| `scripts/diagnostics/diagBellaAspiration.ts` | Verification diagnostic (optional, parallel to diagBellaTraits.ts). |
| `~/Documents/Aspirations/` | Temporary S4S dump. Delete after committing. |
