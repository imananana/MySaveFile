# Companion-mod spike

Throwaway proof for the "apply a plan in-game" loop. Full plan + pass/fail + target sim_ids: [`docs/MOD_SPIKE.md`](../../docs/MOD_SPIKE.md).

## Files
- `spike_mod.py` — the mod source (registers `spike.apply` + `spike.verify` console commands).
- `spike.ts4script` — the built mod (a zip of `spike_mod.py`). This is what goes in the game.

## Build
```
cd scripts/mod-spike
rm -f spike.ts4script && zip -j spike.ts4script spike_mod.py
```
(`py_compile` passes on host Python for a syntax check; the game-API symbols — `sims4`, `services` — only resolve inside the game, that's expected.)

## Install & run
1. **Back up `Slot_00000003.save` first.**
2. Copy `spike.ts4script` into `~/Documents/Electronic Arts/The Sims 4/Mods/` (directly in Mods, not nested).
3. Make sure **Script mods enabled** is on (Game Options → Other) and restart the game.
4. Load `Slot_00000003`, enter live mode on any lot.
5. `Ctrl+Shift+C` → `testingcheats on` → `spike.apply`.
6. **Save**, quit to main menu, **reload** the save.
7. `Ctrl+Shift+C` → `spike.verify` — prints what stuck. Also check the Sims by hand.
8. Send back `~/Documents/Electronic Arts/The Sims 4/spike_log.txt` + screenshots.

The decisive line is whether **Dina Caliente's Cooking skill** persisted after reload.
