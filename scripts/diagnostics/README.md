# Save format diagnostics

One-shot scripts written while reverse-engineering The Sims 4 save (DBPF)
binary format. They are **not** part of the application or its build — they
exist as a historical record of how each section of the parser was figured
out and as utilities for the next time the format changes (new packs, new
fields, etc.).

## Running one

Most assume a save file on disk and use the `parseDbpf` / `decompressRefpack`
helpers from `src/lib`. From the repo root:

```bash
SAVE=Slot_10312032.save npx tsx scripts/diagnostics/diagHouseholdDesc.ts
```

(Some accept overrides like `NEEDLE=...` for the byte string to grep for.)

## Naming convention

- `diag*` — print bytes/fields around a known anchor (used during RE)
- `build*` — generate static data tables (e.g. `buildVenueIdMap.mjs` produced
  the venue tuning ID map currently in `src/lib/saveParser.ts`)
- `check*`, `decode*`, `trace*`, `validate*` — verifying specific records

## Maintenance

Nothing here is imported by app code. If a script's purpose is no longer
clear, it's safe to delete. If you need to add a new diagnostic, drop it
here with a one-line top-of-file comment explaining what it tests.
