# Randomizer

**Route** `/saves/:saveFileId/randomizer` · sidebar, under **TOOLS** ·
**Tier** 2 ·
**Requires** no pack. Ownership narrows what can be rolled: a trait or
aspiration from a pack you don't own never comes up, and the world roller only
offers worlds you own ·
**Not desktop-gated** — this page opens on a phone, unlike Households and Sims ·
**Polish** shippable and photographable ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`Randomizer.tsx`, `LotRoller.tsx`, the roll library (`randomizer.ts`), the name
/ trait / aspiration catalogs, the pack-assignment lookups, the store and its
API (`useSaveFile.ts`, `server/src/routes/relationships.ts`), and all three sync
paths whole (`diff.ts`, `coherence.ts`, `silentRefresh.ts`,
`householdRealization.ts`, `GameReimport.tsx`) — and by driving it: every mode,
a roll from each preset, a Custom composition, per-field rerolls, two households
saved and inspected in the database and then removed, the world roller's locks
held across repeated rerolls, and a full roll on a base-game-only account to see
what a small library actually gets offered. Catalog figures below are counted
from the data: **1,086 female and 1,077 male first names, 3,156 surnames, 97
traits, 88 aspirations**.

## Why it exists

The blank page is the hardest part of planning a save. You know you want to fill
Willow Creek and you have no idea who lives at number four. This page answers
that for you — it invents a household, or it hands you a build prompt, or it
picks the next lot to work on — so the plan starts from something instead of
nothing. It is deliberately a slot machine rather than a builder: you pull it
until you like what comes out, adjust the bits you don't, and keep it.

## What you see

**A three-tab toggle** at the top — **Household · World · Lot** — and nothing
else shared between them. Each mode is its own screen.

**Household** is two columns, and both open on their control at the same height.
On the left, a card of preset buttons led by **Surprise me** on a plum-tinted
pill, then two labelled groups — **PRESETS**, holding the nine shapes, and
**FREE FORM**, holding **Custom**. The one you've picked expands with a line
describing it — *2 parents + 1–6 kids, shared surname* — and the rest stay one
line each. Below the list, two controls appear when they apply: a
**Composition** block of seven counters (Elder down to Infant) with a running
**N / 8 sims**, and a **Couple type** row of **Random · Mixed · Same-sex**.

On the right, a full-width **Roll household** button, and under it either
*Ready when you are* — *Pick a preset on the left and hit roll. Names, traits,
and aspirations pull straight from the game* — or the household you rolled.

**A rolled household** leads with the preset in small caps (or **SURPRISE →
MULTI-GENERATIONAL** when the dice picked for you), then its name in large type,
a sim count — **3 sims · 2 kept on the next roll** once anything is held — and a
green **Save to My Households**. Then a card per sim: a round gender mark (green
for male, purple for female), the full name, the life stage with its in-game
icon, and three round buttons — reroll this sim, a padlock that keeps them, and
remove. A kept sim's whole card turns green with a filled padlock. Under that,
**Aspiration** as a single chip with its real icon, and **Traits** as a row of
chips with theirs. Each row has its own reroll, and hovering a single trait chip
reveals a swap button for just that one.

On a phone the two columns stack with the roll card **first**, so the button and
its result are the first things under the tabs and the presets sit below them.

**World** is one centred card. **Roll a world** produces three slots — **World**,
**Lot type** with a category dot, and **Size** — each with a reroll and a
padlock. A locked slot is tinted and survives every subsequent roll.

**Lot** is the same card, headed **THIS LOT, AS IT IS NOW**, showing a real lot
from your save: its name and world, what it currently is, and its size. Below
it, **Open in editor**.

## What you can do

### Choosing what to roll

- **Pick one of nine preset shapes**: Solo · Couple · Nuclear family · Single
  parent · Roommates · Siblings · Multi-generational · Adult child + parent(s) ·
  Empty nesters. Each has its own rules — Couple is two young adults or adults
  who share a surname on a coin flip; Roommates is two to eight adults with
  independent surnames; Multi-generational picks one of three believable shapes
  behind the scenes.
- **Surprise me** draws one of those nine at random and tells you which it
  landed on.
- **Custom** lets you set the count for each life stage yourself, from Elder to
  Infant, and choose whether they share a surname. The suggestion flips to *on*
  as soon as there's a child or teen in the mix, and you can override it.
- **Couple type** — Random, Mixed or Same-sex — applies to the pair in Couple,
  Nuclear family and Multi-generational, and to whatever Surprise me lands on.
  It shapes only the couple; every other sim is a straight coin flip.

### The household you rolled

- **Roll again** for a completely fresh one.
- **Rename any sim.** Click the name and both halves become editable.
- **Reroll a whole sim** into a different person — as different as the household
  shape allows. A solo sim or a roommate changes everything, gender and age
  included. A child stays a child but changes age within the child ages. An
  elder stays an elder, and a sim in a **Custom** household keeps the age you
  asked for. Half of a couple keeps the gender your **Mixed** or **Same-sex**
  setting requires, and changes freely under **Random**. The surname changes
  only where surnames are independent — a household that shares one keeps it,
  because that name is the household's own.
- **Reroll just the aspiration**, **reroll all traits**, or **swap a single
  trait**, which deliberately avoids landing on one they already have.
- **Keep any sim, or several, and roll again.** The padlock holds that sim
  exactly; everyone unlocked re-rolls under their own role's rules. The
  household's shape holds too — same roles, same number of sims — so a child you
  kept in a family of four can't come back in a family of two. The sims you kept
  anchor the rest: they set the surname in a household that shares one, and a
  kept partner fixes what **Mixed** or **Same-sex** requires of the other. The
  padlock governs **Roll again** only; a sim's own reroll still works while
  they're held. Changing preset or composition clears every lock, since those
  sims are about to be gone.
- **Remove a sim** from the household before you keep it.

### Keeping it

- **Save to My Households** creates it and takes you straight to it in the
  household manager. It arrives under **My Households** with **§20,000** plus
  **§2,000** for each sim beyond the first — the same starting funds as building
  one by hand.

### Rolling a build prompt

- **Roll a world** for a world, a lot type and a footprint to design around.
- **Lock any of the three** and keep rolling the others. The slots stay
  consistent with each other: a locked lot type only draws worlds that can have
  it, and a size is always one that really exists in the world shown.

### Picking a lot to work on

- **Roll a lot** for a real, still-unplanned lot from your save, then **Open in
  editor** to go straight to it.

## What you can't

- **Roll an occult, a ghost, or a pet.** Every sim comes out mortal and human.
- **Roll a career, skills, a portrait, notes or a description.** Those are all
  set afterwards, in Households.
- **Choose a specific trait or aspiration.** You can only reroll until you like
  one; the picker lives in the household editor.
- **Change the number of sims once anything is kept.** A lock freezes the
  household's shape, so **Roll again** can't hand you more or fewer children
  until you unlock or start over.
- **Assign a lot** at roll time. A rolled household arrives without one.
- **Roll into an existing household**, or reroll the members of one you already
  have.
- **Roll anything else in the app** — no clubs, holidays, small businesses,
  custom venues or dynasties.
- **Undo a roll, replay one, or set a seed.** Once you roll again the previous
  household is gone.
- **Save an empty household.** Remove the last sim and the button is dead.

## How it relates to sync

**Everything this page makes is yours, and the sync can't see it.** A rolled
household and its sims carry no record of your save, so the comparison that
decides what a re-sync changes never looks at them: they are never counted on
the sync screen, never updated from the game, and never removed for being
absent from it. Rolling twenty households and syncing changes nothing about
them.

**It writes no family bonds.** A rolled household is a set of sims sharing an
address and usually a surname — nothing records who is married to whom or
descended from whom. That is why none of them ever appear in the family tree,
which is the archive of what your *save* remembers.

**Pack ownership is read when you roll, and never again.** The trait and
aspiration pools are filtered to packs you own at the moment the dice land, and
the result is then a plain stored value. Turning a pack off later doesn't
disturb a sim you already rolled.

**Three things a re-sync does do to a rolled household**, all of them silent:

| What happened | What the sync does |
|---|---|
| You gave it a lot, then actually built that household in the game | The plan and the real household become one record. It keeps its planner identity, its notes and its funds target, and takes the save's name, members and lot. **Its invented sims are dropped** — the real roster replaces them. |
| You removed every sim from it | The empty household is deleted |
| A real household moves onto the lot you parked it on | Reality takes the lot; your household survives without one |

**Its funds stay where you set them.** A household the save knows has its money
refreshed from the game on every sync. A rolled one has no save record to match,
so its §20,000 is a planning figure that stands until the household becomes real
through the first row above.

## Limitations

- **Two adults you meant as roommates read as a Couple** on the Diversity page.
  Nothing in the planner can record which one they are, so the audit takes the
  likelier reading of the shape. The same goes for an elder and an adult you
  meant as an age-gap couple, which reads as *Adult child + parents*.
- **The preview is a flat list.** It shows five sims; it doesn't say — because
  the plan doesn't record — which of them you were imagining as a couple.
- **World and Lot modes leave most of the page empty** — a narrow centred card
  on a wide screen, where Household mode fills the width.
- **Surprise me never lands on Custom**, only on the nine presets.
- **A small library narrows the personality pools sharply.** With the base game
  alone, 57 of 97 traits and 31 of 88 aspirations remain rollable, and children
  drop from nine aspirations to four. No life stage ever runs out, so a sim is
  never left blank.
- **Rolled households can reach eight sims, and nothing warns you at seven.**
  The count only turns red in Custom, and only once you go past eight.
