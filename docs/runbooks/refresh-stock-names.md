# Runbook — Refresh `STOCK_NAMES` after a new pack

`src/data/stockNames.ts` is the English-locale name pool the household randomizer pulls from (first names by gender + a shared last-name pool). It's harvested from The Sims 4's `sim_spawner.Tuning.xml` — the same file the game itself reads when generating townies.

**Key fact**: the ENGLISH pool in this file is EA's *curated diverse-global* list — it intentionally mixes Anglo, South Asian, East Asian, Slavic, Hispanic, Arabic, etc. names so the English-locale game generates a varied townie population. We use it verbatim. Other languages in the file (JAPANESE, RUSSIAN, etc.) are native-locale pools for those territories and we ignore them.

## When to run

- Every time EA ships a pack that adds new townie names (most expansions / game packs do this, especially world-based ones like Mt. Komorebi, Tartosa, Tomarang).
- If you start noticing the randomizer rolls the same name repeatedly and want a sanity check on pool counts.

## Prerequisites

- **Sims 4 Studio** (S4S) installed and pointed at your live game install.
- The repo cloned locally with Node.js available.

## Steps

### 1. Dump the SimSpawner tuning from S4S

In S4S:

1. **Tools → Extract Tuning**.
2. Search for: `sim_spawner` (with the underscore).
3. You should see **one** result: `sims.sim_spawner` (a Tuning XML plus its SimData sibling — both come along, the script ignores the SimData).
4. Export both files to `~/Documents/Sim Names/` (or set `EXPORT=` when running the script).

That single XML contains *all 18 language pools* — we only consume the ENGLISH block.

### 2. Run the build script

From the repo root:

```bash
EXPORT="$HOME/Documents/Sim Names" npx tsx scripts/diagnostics/buildStockNames.ts
```

The script:

1. Finds `<L n="RANDOM_NAME_TUNING">` in the tuning XML.
2. Locates the `<U>` block whose `<E n="language">` is `ENGLISH`.
3. Extracts `female_first_names`, `male_first_names`, `last_names` from that block (ignores the leading LOCALE_MAPPING ENGLISH match which is a different list).
4. De-duplicates and sorts alphabetically for deterministic output.
5. Writes `src/data/stockNames.ts`.

Sanity-check counts (as of 2026-06):

| Pool | Count |
|---|---|
| Female first names | 1,086 |
| Male first names   | 1,077 |
| Last names         | 3,156 |

If counts shift significantly down after a pack, the parser likely broke — investigate before committing.

### 3. Eyeball diversity

The script prints the first 8 names from each pool. Confirm they look like a *diverse* pool, not just Anglo:

```
Sample male firsts: Aarav, Aaron, Abdullah, Abel, Abraham, Abram, Ace, Adam…
Sample last names:  Aaron, Abbott, Abel, Abernathy, Abraham, Abrams, Abreu, Acevedo…
```

If you're only seeing Anglo names ("Aaron, Abbott, Adam"), you may have accidentally grabbed the LOCALE_MAPPING ENGLISH list instead of the RANDOM_NAME_TUNING block — the script's anchor logic should prevent this but worth checking.

### 4. Commit

```bash
git add src/data/stockNames.ts
git commit -m "Refresh STOCK_NAMES for <pack-name>"
```

## Why ENGLISH only and not all 18 languages?

EA designed the ENGLISH pool to be diverse-by-curation. It already contains names like "Yamamoto", "Patel", and "Ivanov" — the global mix you'd expect in an international Sims town. The other 17 language blocks are native pools for their specific locale (the JAPANESE block has only native Japanese names, etc.) and are intended for players running those locales.

If we ever want a "thematic culture-locked household" feature (e.g. "give me a household with all Japanese names"), we'd extract those other blocks too. Not in scope for the current randomizer.

## Files this runbook touches

| File | Role |
|---|---|
| `scripts/diagnostics/buildStockNames.ts` | Build script. |
| `src/data/stockNames.ts` | Generated output. Don't hand-edit. |
| `~/Documents/Sim Names/` | Temporary S4S dump. Delete after committing. |
