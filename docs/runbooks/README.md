# Runbooks

Step-by-step procedures for periodic maintenance tasks that the app needs as The Sims 4 evolves (new packs, new tuning IDs, EA UI string changes, etc.). Each runbook is self-contained — read it top-to-bottom and follow the steps.

## Index

| Runbook | When to run |
|---|---|
| [refresh-stock-traits.md](refresh-stock-traits.md) | EA ships a new pack that adds CAS personality traits. |
| [refresh-stock-aspirations.md](refresh-stock-aspirations.md) | EA ships a new pack that adds CAS-pickable aspirations. |
| [refresh-stock-names.md](refresh-stock-names.md) | EA ships a new pack that adds townie names. |

Future runbooks likely to land here:

- `refresh-club-icons.md` — when a new pack adds Get Together–style club icons.
- `refresh-holiday-icons.md` — when a new pack adds seasonal holiday icons.
- `refresh-venue-tuning-map.md` — when a new pack adds a lot type (Cafe / Bar / Penthouse / etc.).
- `refresh-stock-club-names.md` — when EA's premade Get Together clubs change names.

Anything that requires a sim 4 studio dump + a build script + a regenerated `src/data/*.ts` file probably belongs here.
