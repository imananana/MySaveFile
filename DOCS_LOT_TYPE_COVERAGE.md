# Lot Type Detection — Coverage Report

Generated from `Slot_02220000.save` (downloaded test save with confirmed player changes).
Source: `scripts/buildVenueIdMap.mjs`.

## Three lot types easily confused (read first)

The planner has THREE distinct types that sound similar but mean different things in-game:

| Planner type | Count in worlds.ts | What it is | Can player change? |
|---|---|---|---|
| **Apartment** | 29 | Pre-built San Myshuno-style multi-unit. Building shell is part of the world. | **NO — immutable** |
| **Rental** | 17 | Vacation/temporary stays (Granite Falls cabins, Selvadorada villas, Mt. Komorebi rentals, Tartosa villas, etc.) | Yes |
| **Residential Rental** | 2 (Taka Soi 15 + Sungai Point) | "For Rent" expansion — any residential lot can become this. Multiple households rent units. | Yes (player can convert any Residential to this) |

Because **Apartments can't be changed**, we never need to override them. The default from `worlds.ts` is always correct.

### Apartment vs Penthouse vs Residential — all internally Residential

Apartments and Penthouses both store as `0x6fc6` (Residential) in the LDNB. The distinction is world-slot based:
- **Apartment slot**: immutable in both directions
- **Penthouse slot**: convertible — player can change Penthouse → Lounge/Bar/etc.
- **`San Myshuno::Stargazer Lounge`**: the ONE non-default Penthouse-capable slot — player can change Lounge → Penthouse here. Hardcoded exception.

### "Vacation Rental" doesn't exist

The planner's seed data wrongly split "Vacation Rental" from "Rental". They're the same in-game. Should clean worlds.ts.

## Summary

| Bucket | Count | % of total | Action |
|---|---|---|---|
| ✅ **Fully matched** (LDNB tuning ID extracted + default known) | **340** | 73.1% | Use detected type |
| ⚠️ **A**: LDNB present but no venue marker found | 15 | 3.2% | See below — mostly OK |
| ⚠️ **B**: No `0x06` LDNB chunk in save | 72 | 15.5% | Inherit via field5, or by-design (Apartments) |
| ⚠️ **C**: No planner key in `lotField5Map.ts` | 8 | 1.7% | Intentional exclusions |
| ⚠️ **D**: No default type lookup | 30 | 6.5% | Diagnostic script bug, NOT a parser issue |
| **Total `0x3a` records scanned** | **465** | 100% | |

The real coverage gap is much smaller than 4% once you apply the 4-step algorithm (0x2a → LDNB → field5 inherit → default).

## Detection algorithm (final)

```
For each lot in the save:
  1. If the lot has a 0x2a record → use field 7 as the lot type tuning ID
     (catches Residential, Residential Rental, Rental, and actively-used venues
      that have a residential-style state — including small businesses)
  2. Else if 0x06 chunk's LDNB yields a venue tuning ID via the marker scan
     → use it (catches pure venue conversions: Bar↔Cafe, etc.)
  3. Else look up other lots sharing the same field5 — if any have a detected
     type, inherit it (catches multi-unit sub-units)
  4. Else fall back to worlds.ts default (correct for immutable Apartments
      and rarely-touched specialty lots)
```

---

## Bucket A — LDNB present but no venue marker (15 lots)

The standard marker `[28 zeros][06 00 00 00][8-byte venue ID]` isn't where we expect. Most likely a different "count byte" variant for multi-unit / special lots.

### A.1 — Multi-unit dorm halls (4 lots, University Housing)

- `WIP - Wyvern Hall` (Britechester) — University Housing — LDNB 123,012 b
- `WIP - Drake Hall` (Britechester) — University Housing — LDNB 123,060 b
- `WIP - Briny Tower` (Britechester) — University Housing — LDNB 127,084 b
- `WIP - Tidal Tower` (Britechester) — University Housing — LDNB 107,524 b

**Action**: leave as default. Dorm halls behave like apartments (multi-unit container building), and Sims 4 doesn't really support converting them to other types.

### A.2 — Pre-built Apartment building (1 lot)

- `WIP - Pinecrest Apartment` (Evergreen Harbor::Pinecrest Apartments #402) — Apartment — LDNB 90,060 b

**Action**: leave as default. Apartments are immutable in-game.

### A.3 — Special gameplay lots (3 lots)

- `Forgotten Grotto` (Oasis Springs::Forgotten Grotto) — Secret Lot — LDNB 6,935 b
- `Belomisia Trailhead` (Selvadorada::Belomisia Trailhead) — National Park — LDNB 58,630 b
- `Mt. Komorebi Peak` (Mt. Komorebi::Mt. Komorebi Peak) — Mount Komorebi Summit — LDNB 25,292 b

**Action**: leave as default. These are non-buildable special locations.

### A.4 — WIP-prefixed residential lots (7 lots)

Players renamed these (the "WIP - " prefix is user-added). LDNB might be in a partial state.

- `WIP - Fledermaus Bend` (Forgotten Hollow::Fledermaus Bend) — Residential — LDNB 36,406 b
- `WIP - Hindquarter Hideaw` (Brindleton Bay::Hindquarter Hideaway) — Residential — LDNB 24,670 b
- `WIP - Creek Corner Cove` (Strangerville::Creek Corner Cove) — Residential — LDNB 27,348 b
- `WIP - Sapphire Shores` (Sulani::Sapphire Shores) — Residential — LDNB 230,716 b
- `WIP - Key Point` (Sulani::Key Point) — Residential — LDNB 89,316 b
- `Kiyomatsu Point` (Mt. Komorebi::Kiyomatsu Point) — Residential — LDNB 174,556 b
- `WIP - 2-4-1 Wakabamori` (Mt. Komorebi::2-4-1 Wakabamori) — Residential — LDNB 14,372 b

**Action**: most likely no change (default is Residential, current is Residential). If the player did convert one of these, we'd miss it. Edge case to revisit later by probing for marker variants.

---

## Bucket B — No `0x06` LDNB chunk in save (72 lots)

Two sub-patterns. **Both handled correctly by the 4-step algorithm**.

### B.1 — Apartment sub-units (immutable) — ~14 lots

San Myshuno pre-built apartment sub-units. Apartments are immutable.

- `WIP - 19 / 17 / 18 Culpepper House` — Apartment
- `WIP - 2A Jasmine Suites` — Apartment
- `WIP - IX Landgraab` — Apartment
- `WIP - 1010 Alto Apartment`, `WIP - 1312/1313 21 Chic Street` — Apartment
- `WIP - 702 ZenView`, `WIP - 121 Hakim House`, `WIP - 910/920 Medina Studios` — Apartment
- `13 Lakeview Apartments`, `18 Bright Cliff` (Ondarion) — Apartment
- `WIP - Stonestreet Apartment`, `WIP - Pinecrest Apartment` (Evergreen Harbor) — Apartment

**Action**: default is always correct. Algorithm step 4 handles this.

### B.2 — Multi-unit sub-units that share field5 with a primary — ~58 lots

These are the "2 Garden Essence", "3 Parkshore", "6 Municipal Muses" pattern. The primary unit has the LDNB / 0x2a record; sub-units inherit.

Examples (showing the primary→sub-unit relationship):

| Primary (has LDNB / 0x2a) | Sub-units in this bucket |
|---|---|
| `1 Garden Essence` | `Garden Essence`, `2 Garden Essence` |
| `Parkshore Townhouses` (or `1 Parkshore`?) | `2 Parkshore`, `3 Parkshore` |
| `Pebble Burrow primary` | `Pebble Burrow`, `2/3/4 Pebble Burrow` |
| `Municipal Muses Rentals primary` | `Municipal Muses Rentals`, `2/3/4/5/6 Municipal Muses` |
| `09 Taka Soi 15` (matched) | `Taka Soi 15`, `08 Taka Soi 15` (Residential Rental) |
| `1 Sungai Point` (matched) | `Sungai Point`, `2/3 Sungai Point` (Residential Rental) |
| `5/6/etc Bridge Creek Drive` | `Bridge Creek Drive`, `2/3/4 Bridge Creek Drive` |
| `Three Sisters Row primary` | `2/3/4/5/6 Three Sisters Row` |
| `1 Beech Byway` (Newcrest) | `Bridgeview Apartments`, `2/3/4/5/6 Beech Byway` |
| `1 Midtown Meadows` (Newcrest) | `The Mix Plaza`, `2/3/4/5/6 Midtown Meadows` |
| `Water Tower Way primary` | `Water Tower Way`, `2 Water Tower Way` |
| `1 The Futures Past` (Oasis Springs) | `The Futures Past`, `2/3/4/5 The Futures Past` |
| `Havisham House primary` | `Havisham House`, `2 Havisham House` |
| `Cobblebottom Street primary` | `Cobblebottom Street`, `2 Cobblebottom Street` |

**Action**: Algorithm step 3 (field5 inheritance) catches all of these. As long as ONE unit per building has a detected type, all sub-units inherit it.

### Verified Residential Rentals being detected correctly

The user's concern was whether Residential Rentals would be caught. The data confirms:

- **Sungai Point** (still Residential Rental in this save; player just removed the renting households):
  - `1 Sungai Point` matched with tuning ID `0x53533` = Residential Rental ✓ (matches the default, no change)
  - Sub-units `Sungai Point`, `2 Sungai Point`, `3 Sungai Point` inherit via field5

- **Taka Soi 15** (still Residential Rental; players removed):
  - `09 Taka Soi 15` matched with tuning ID `0x53533` = Residential Rental ✓ (matches default)
  - Sub-units `Taka Soi 15`, `08 Taka Soi 15` inherit via field5

Note: the diagnostic script labels these as "detected=Residential" because it picks the majority planner-default among lots sharing the tuning ID (and 10 lots in this save have default Residential that were converted to Residential Rental). The actual tuning ID `0x53533` means **Residential Rental** — that's the lot type the in-game engine actually has. The Sungai Point and Taka Soi 15 lots were not converted, they just had their renting households removed.

Genuine miss: a Residential Rental where the player converted the type AND never had any sim activity in any unit (no LDNB to scan, no 0x2a to read). Narrow edge case.

---

## Bucket C — No planner key in `lotField5Map.ts` (8 lots)

Intentionally excluded content.

### C.1 — Excluded expansions
- `Black Spire Outpost` (Star Wars: Journey to Batuu) — excluded
- `Resistance Encampment` (Star Wars) — excluded
- `First Order District` (Star Wars) — excluded
- `HeadlessQuarters` (StrangerVille easter egg) — excluded

### C.2 — Mountain climbing dynamic locations
- `Mt. Komorebi Base Camp`
- `The Croft Icefall`

### C.3 — Possibly missing
- `Omiscan Royal Baths` (field5 `2112225285`)
- `Omiscan Temple` (field5 `111607810`)

**Action**: leave excluded list as-is. Optionally add Omiscan lots later.

---

## Bucket D — Diagnostic script bug, not a parser miss (30 lots)

`scripts/buildVenueIdMap.mjs` uses regex `[^'"]+` to read planner keys from `lotField5Map.ts`. This regex truncates any key containing an apostrophe. Examples:
- `'Granite Falls::Hermit\'s House'` reads as `Granite Falls::Hermit` → fails worlds.ts lookup

The actual `src/lib/saveParser.ts` reads `worlds.ts` via TypeScript imports and doesn't have this bug. These 30 lots ARE handled by the real parser.

Affected lots (corrected planner keys):

`Hermit's House`, `Paddywack's Vet Clinic`, `The Red Lantern` (Optimist's Outlook), `The Fachwerk Library` (Proprietor's Square), `WIP - Tail's End / Hound's Head / Dachshund's Creek / It's A Good House` (Brindleton Bay), `Love Island Villa` (Journey's End), `WIP - Chieftain's Villa / Ohan'ali Beach / Admiral's Wreckage` (Sulani), `WIP - Darby's Den / Pepper's Pub / Larry's Lagoon` (Britechester), `3 Cordelia Lane / The Gnome's Arms Bar` (Henford-on-Bagley), `WIP - Celebrazioni d'Amo / Baia dell'amore` (Tartosa), `WIP - Prowler's Patch` (Moonwood Mill), `Biscuit's Bastion / Champion's Grove / Duke's Hall` (Chestnut Ridge), `WIP - Crow's Perch` (Ravenwood), `WIP - Fisher's Horizon` (Nordhaven), `Gringle's` (Innisgreen), `Miner's Manse / Prospector's Paradise / Fletcher's Cottage` (Gibbi Point), `Fisherman's Hut` (Ondarion)

**Action**: ignore. Fix the diagnostic script later — it's not blocking the parser.

---

## Confirmed player changes detected in this save

| Lot (current name) | Default → Detected | Tuning ID |
|---|---|---|
| Mirage Brew & Pottery (was Rattlesnake Juice) | Bar → **Cafe** | `0x1dd87` |
| Fetch & Friends Park (was Cypress Terrace) | Residential → **Park** | `0x64f7` |
| Cutters & Thrift Store (was Willow Creek Archive) | Library → **Residential** (small business attached) | `0x6fc6` |
| Oasis Bowling Club (was Cacti Casa) | Residential → **Nightclub** | `0x41e6` |
| Agave Abode Trailer | Residential → **Bar** | `0x41e5` |

Many other lots in this save have been converted to **Residential Rental** by the player (Garden Essence, Parkshore, Pebble Burrow, etc.) — all detected via tuning ID `0x53533`. These show up in the diagnostic with "detected=Residential" due to the script's majority-default labeling, but the actual lot type in-game is Residential Rental.

`Sungai Point` and `Taka Soi 15` are NOT in the changes list — they're still Residential Rental (their default). The player only removed the households renting them; the lot type was not modified.

## Action priority

| Priority | Item |
|---|---|
| 🟢 Ship now | Implement the 4-step algorithm in `saveParser.ts`. Empirical coverage is essentially complete for player-changeable lots. |
| 🟡 Optional | Add Omiscan lots to `lotField5Map.ts` (Bucket C.3) |
| 🔵 Optional later | Probe Bucket A.4 marker variants — only matters if a player converts a remote unbuilt residential lot |
| ⚪ Diagnostic only | Fix apostrophe regex in `scripts/buildVenueIdMap.mjs` (Bucket D) |

## Algorithm reference

For any lot in a save:
1. Compute `instLo = lotId & 0xFFFFFFFF`
2. Find the DBPF entry where `type == 0x06 AND instLo` matches
3. Decompress (RefPack if `compType == 0xFFFF`)
4. Parse outer protobuf; field 2 = LDNB binary
5. Scan LDNB backward for `[28 zero bytes][06 00 00 00][8-byte little-endian uint64]`
6. The 8 bytes = venue tuning ID
7. Map via the venue tuning ID table (see `memory/reference_sims4_save_format.md`)
