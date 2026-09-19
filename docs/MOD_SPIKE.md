# Companion-Mod Spike — Build Plan & Runbook

**Status:** planned, not yet built. This is a ~1-day throwaway proof, not a product.
**Goal (the one question):** Can a Sims 4 script mod write **career + degree + skill** onto a Sim who is **NOT** in the active household, have it **survive a save/reload**, and leave the rest of the save **intact**?

The answer decides product shape:
- **Skills stick on a dormant Sim →** the full "design in planner → apply in bulk" loop is viable. Build it.
- **Skills don't stick →** ship careers + degrees (+ clubs) as bulk, and skills fall back to *apply-on-load* (apply the moment the game instantiates that Sim — still zero manual clicking, just lazy instead of bulk).

Context: [[project_companion_mod_idea]]. Careers/degrees are low-risk (degrees are just traits; careers are how townies get jobs). **Skills are the wildcard** and the make-or-break item.

---

## Environment (confirmed with user 2026-06-20)

- Script mods enabled, many mods already active — dropping a `.ts4script` is a non-issue.
- **Test save: `Slot_00000003.save`** (we've used it throughout; rotating backups present: `.ver0–4`).
- Latest game patch; all gameplay packs installed (only build/buy/CAS kits missing) → University present, so degrees are testable.
- **Targets:** iconic EA premade **adults** (must be young-adult+ — toddlers/children/infants can't hold careers/degrees/most skills). All in `Slot_00000003`.

### Real sim_ids (pulled from the save — this is the ID join, the moat)

| Sim | sim_id (decimal) | Lifestage | Current career | Use for |
|---|---|---|---|---|
| Bob Pancakes | 159058256118089870 | youngAdult | Culinary L2 | test **changing** an existing career |
| Eliza Pancakes | 159058256118089871 | youngAdult | — | test **adding** a career |
| Don Lothario | 159058256118161987 | youngAdult | — | test **degree trait** |
| Dina Caliente | 159058256118161985 | youngAdult | — | test **skill** (the decisive wildcard) |
| Bella Goth | 159058256118090319 | youngAdult | Secret Agent L1 | spare (extra career-change check) |

> ⚠️ Earlier draft listed the Alfaros — dropped because only Taylor is an adult (Chana=child, Jorge=toddler, Jaime=infant). Lifestage matters: the spike must target young-adult+ Sims.
> Regenerate anytime: `npx tsx scripts/diagnostics/dumpSpikeTargets.ts pancake lothario caliente goth` (pass name substrings); `dumpAdults.ts` lists all alive adults.
> In-game, `sim_info.sim_id` equals these exactly — that's how the mod finds the Sim with zero ambiguity.

---

## What gets built (the spike artifact)

A single console **cheat command** registered by a tiny script mod. No UI, no plan file yet — values are hardcoded. We trigger it from the live-mode cheat console so we don't have to click any Sim.

- **Trigger:** live mode, open cheat console (`Ctrl+Shift+C`), `testingcheats on`, then type `spike.apply`.
- **What it does, per hardcoded sim_id:**
  1. `services.sim_info_manager().get(sim_id)` → the SimInfo (works for *any* Sim in the save, not just active household — this is the bulk assumption under test).
  2. **Career:** `sim_info.career_tracker.add_career(<career_instance>)` (e.g. give Eliza a career; bump/replace Bob's).
  3. **Degree:** `sim_info.add_trait(<degree_trait_instance>)` (earned degrees are traits — our parser proved this).
  4. **Skill:** best-effort set a skill statistic to a level (the finicky part; exact API may need a couple iterations against decompiled EA scripts).
  5. Log every step's success/failure to a file next to the save (e.g. `spike_log.txt`) so we have a record even if the console scrolls.
- **Safety rails baked in:** None-guard every tuning lookup; never raise into the game loop; additive only; touch only the listed sim_ids.

> Honesty note: the exact skill/career API calls are **best-effort for the spike** — that's literally what we're testing. They are NOT confirmed mappings and won't be presented as facts until the spike (or decompiled-script evidence) confirms them. This is the one place "exploratory" is allowed precisely because the output is a yes/no, not shipped behavior.

---

## Pass / fail criteria

Run the loop: load `Slot_00000003` → `spike.apply` → **save** → quit to menu → **reload** → inspect.

1. ✅/❌ **Career** set on Eliza (added) and Bob (changed) after reload.
2. ✅/❌ **Degree trait** present on Don Lothario after reload.
3. ✅/❌ **Skill** present at the set level on Dina Caliente after reload. ← *the decisive one*
4. ✅/❌ **Nothing else changed** — other Sims, households, money, relationships look untouched; no corruption; game loads normally.
5. ✅/❌ Worked on Sims who were **never the active household** during apply.

We can verify 1–3 two ways: in-game (click the Sim after reload) **and** by re-importing the save into the planner and checking the diff — a nice end-to-end of the whole loop.

---

## Your runbook (what the user does)

1. **Back up first.** Copy `Slot_00000003.save` somewhere safe (we also have `.ver0–4` rotating backups, but make an explicit one). Confirm the copy exists.
2. Drop the provided `spike.ts4script` into `Documents/Electronic Arts/The Sims 4/Mods/`.
3. Launch, load `Slot_00000003`, enter **live mode** (any lot).
4. `Ctrl+Shift+C` → `testingcheats on` → `spike.apply` → look for an "OK" line in the console.
5. **Save** the game. **Quit to main menu.** **Reload** `Slot_00000003`.
6. Click each target Sim (Bob & Eliza Pancakes, Don Lothario, Dina Caliente) and report what you see — career panel, traits/degree, skill panel. Screenshots of before/after are gold.
7. Tell me if anything *else* looks off (other Sims, money, weirdness, LastException popups). Send `spike_log.txt` if present.

If skills don't show but careers/degrees do → that's still a clear, useful result (we pivot skills to apply-on-load). A LastException or failed load → we stop, you restore the backup, I debug.

---

## Plan-file JSON schema (sketch — for when the spike passes)

Once apply works, the planner exports this and the mod consumes it. Keyed by `sim_id` (the join). Versioned + pack-gated for safety.

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-20T00:00:00Z",
  "game": { "minVersion": "1.x.x", "requiredPacks": ["EP08", "GP12"] },
  "options": { "additiveOnly": true, "dryRun": false },
  "sims": [
    {
      "simId": "159058256118089871",          // string to avoid JS bigint loss
      "name": "Eliza Pancakes",                // human-readable, for the dry-run preview only
      "career": { "tuningId": "0x....", "name": "Culinary", "level": 5 },
      "earnedDegrees": [ { "traitId": "0x....", "name": "Culinary Arts (Distinguished)" } ],
      "skills": [ { "tuningId": "0x....", "name": "Cooking", "level": 8 } ],
      "traits": [],                             // CAS traits (already authorable today)
      "aspirationId": null
    }
  ]
}
```

- **String IDs** everywhere (sim_id and tuning ids) — JS numbers can't hold 64-bit ids.
- **`requiredPacks` + `minVersion`** → the mod refuses / warns on mismatch instead of half-applying.
- **`dryRun`** → mod previews "will set X on N sims, skip M (missing pack / sim not found)" before touching anything.
- Names are for the preview only; the mod never matches on names, only `simId`.

---

## Next steps (in order)

1. **Write `spike.ts4script`** (the draft mod above) — the actual "begin that work" step.
2. User runs the runbook on `Slot_00000003`.
3. Record the result (skills stick? y/n) back into [[project_companion_mod_idea]] → it gates the V1 mod scope.
