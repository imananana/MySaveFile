# Holidays

**Route** `/saves/:saveFileId/holidays` ·
**Tier** 2 ·
**Requires** **Seasons (EP05)** for holidays to mean anything in your game. The
gate is soft: without the pack the page still opens and works in full, with a
banner reading *Seasons isn't marked as owned. You can plan here, but you'd need
the pack to actually use Holidays in-game.* Holidays from a save need a save; a
holiday you write yourself needs nothing ·
**Desktop only** — below the breakpoint, on a touch device, the page is replaced
by *The holiday tool works best on desktop* ·
**Polish** shippable and photographable ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`HolidayManager.tsx`, the shared parts it draws with (`IconPicker.tsx`,
`PackNotOwnedBanner.tsx`, `DesktopOnly.tsx`), its catalogs (`stockHolidays.ts`,
`stockTraditions.ts`, `stockHolidayTraditions.ts`, `stockHolidayDefaults.ts`,
`holidayIcons.ts`), the store and API (`useSaveFile.ts`, `mappers.ts`, `api.ts`,
`types/index.ts`, `server/src/routes/holidays.ts`, `saveFiles.ts`), the parser
(`lib/parser/holidays.ts` + its tests), and all three sync paths whole
(`GameImport.tsx`, `GameReimport.tsx`, `diff.ts`, `snapshot.ts`,
`snapshotBuilders.ts`, `silentRefresh.ts`). And by driving the page: the
calendar at 7-day and 28-day seasons, a holiday from a save opened, a holiday of
your own opened, the season buttons, the day grid, the **No day yet** toggle,
the tradition picker, the icon picker, a forced day collision, and a season
filled to capacity. Figures below are read off the running page: **8 holidays**
— 6 from the save, 2 written in the planner.

## Why it exists

Seasons gives you a calendar you can only see one season at a time, from inside
the game, and holidays you can only edit one at a time on the day you're
standing in. What you actually want to decide — how the year is shaped, which
holidays fall where, which ones you'll invent — is a whole-year question.

This page puts the four seasons on one screen, with every holiday on the day it
falls, and lets you write down the holidays you intend to create before you
create them: the traditions, the décor, whether anyone gets the day off.

## What you see

**The rail**, on the left: a **Holidays** title, a **Seasons** row with a
three-way length switch (**7d · 14d · 28d**), a green **+ NEW HOLIDAY** button,
and a **Search holidays...** box with a clear ✕. Under it every holiday grouped
by season, each group under a coloured season chip, sorted by day: icon, name,
and the day it falls on. The selected one takes a soft green tint and a green
bar down its left edge; up and down arrows move the selection. A holiday you
wrote carries a plum **PLANNER** pill.

Anything off the calendar collects under a final **Unassigned** group. Search
narrows this list only — the calendar is the year and always shows all of it.

**The calendar**, when nothing is selected. Four cards, one per season, each in
its own colour — Spring pink, Summer yellow, Fall orange, Winter blue — with the
season's icon, the name, *N holidays · N days*, and a **N/N** badge. Under it a
grid of day tiles, seven across and one row per week: a day with a holiday shows
its icon and name on a white tile, an empty day shows a **+**. Clicking a
holiday opens it; clicking an empty day creates one there.

Below the four seasons, and only when something is in it, an **Unassigned** tray
— *N* · *not on the calendar — open one to pick a day* — holding each one as a
chip with its icon, its name, and either its intended season and day or the
reason it isn't placed.

**A holiday.** A **← Back to calendar** button, then the icon at full size, the
eyebrow **HOLIDAY**, the name, and one line under it reading *Season, Day N*,
with **Remove** pushed to the right. On a holiday you wrote the icon tile and
the name are both editable in place.

Then one white card, divided into sections by hairlines:

| Section | What's in it |
|---|---|
| **Season** | four buttons, icon and name, the current one filled in its season colour. Only on a holiday you wrote |
| **Day** | every day of the season as a numbered tile — the chosen one green, days another holiday holds struck through and unclickable — with *N days per season* under it and a **No day yet** toggle on the label row. Only on a holiday you wrote |
| **Day off work & school** | *Sims get the day off to celebrate*, as a checkbox |
| **Decoration theme** | *Seasonal décor while it's active* — a dropdown on a holiday you wrote, the theme's name on one from your save |
| **Traditions** | one chip per tradition, icon and name, with an ✕ on a holiday you wrote, then **+ Add tradition** and a running **N / 5** |

**NOTES · private** closes the page.

**Where a holiday shows up elsewhere.** Nowhere. Not Home, not the world view,
not a lot, not a sim, not the showcase. The import and re-sync screens count
them (*N holidays*), and the sidebar links here. That's all.

## What you can do

### The list and the calendar

- **Search** by name.
- **Create a holiday** — **+ NEW HOLIDAY** makes one called *New holiday* and
  opens it. It lands on the first free day of the first season that has one; if
  the whole year is full it arrives with no day at all.
- **Create one on a specific day** — click any empty tile on the calendar.
- **Move between holidays with the arrow keys.**
- **Change how long a season is** — 7, 14 or 28 days. The whole calendar
  redraws, and every holiday from your save moves to the day the game would put
  it on at that length. Holidays you wrote keep their day.

### Any holiday, yours or the save's

- **Write notes.** Private, planner-only, saved when you click away.
- **Remove it** — *Delete "<name>"?* with a red Delete. Removing one that came
  from your save doesn't touch the save; it takes the holiday out of the plan,
  and the next sync brings it back.

### A holiday you wrote

- **Name and icon.** Click the name to type; click the tile to pick from the
  holiday-icon library, or **Add icon** if it hasn't got one. **None** is a
  choice in the picker.
- **Season and day.** Four season buttons and a grid of every day. A day another
  holiday already holds is struck through and can't be picked, so two holidays
  can never share a day. Moving it to a season whose day is taken sends it to
  that season's first free day.
- **Take it off the calendar** with **No day yet**, and put it back with the
  same toggle — it returns to the first free day of its season. It keeps the
  season and day it had while it waits.
- **Day off work & school**, on or off.
- **Decoration theme** — None, or one of six: Harvestfest, Love Day, New Year's,
  Spooky, Spring, Winterfest.
- **Traditions**: **+ Add tradition** opens the catalog — 56 traditions,
  alphabetical, each with its real in-game icon, a search box, and a running
  **N / 5**. Ticking is an edit-set: what you leave ticked when you press
  **Done** is the new list. Each chip also has its own ✕.

## What you can't

- **Change anything the save gave you.** On a holiday from your save the name,
  icon, season, day, day-off, décor theme and traditions are all read-only.
  Notes are the exception. You can't plan to move Winterfest.
- **Push any of it back to the game.** A holiday you write here is a plan, not a
  save edit — you still have to make it in-game.
- **Go past five traditions**, which is the game's own cap.
- **Put two holidays on the same day.**
- **Set the day off for work and school separately** — it's one switch.
- **See who a holiday's traditions apply to, or a holiday's weather.** Neither is
  surfaced.
- **Open the page on a phone.**

## How it relates to sync

Every holiday is one of two things, and the page never mixes them: **a holiday
read out of your save**, or **a holiday you wrote**.

**What the save owns.** For a holiday that came from your save, two things are
compared against it on every sync — **name and icon** — plus its **placement**,
which is compared as the full set of dates the game holds for it (one per season
length) rather than a single day, so a plan being drawn at a different length
than the save never reads as a change. Four more are **applied whole rather than
compared field by field**: the traditions, the day off, the decoration theme,
and the day it falls on at your plan's length. Either way the holiday counts as
changed on the sync screen, and it counts **once**.

**Where a holiday's name comes from.** The Sims stores a name only for a holiday
you have edited or made yourself, so the four it puts on the calendar —
Winterfest, Love Day, Harvestfest, New Year's Eve — arrive as bare dates and are
named from a table the planner keeps. Every other holiday carries its own name
in the save, and a stored name always wins: a holiday you renamed reads as you
renamed it, and a save played in another language reads in that language
(*Noël*, *Réveillon du Nouvel An*, *Festival das Flores*). Across every save
we've imported, nothing has ever arrived unnamed.

**What you own.** Notes. They are never read, never compared and never
overwritten.

**What a re-sync does.**

| What happened in game | What the plan does |
|---|---|
| You made a new holiday | It arrives, on its day, with its traditions |
| You renamed it or changed its icon | Adopted |
| You added or removed a tradition | Adopted |
| You turned the day off on or off, or changed the décor | Adopted |
| You moved it to another day | Adopted |
| You deleted the holiday | It leaves the plan |
| You changed how long a season is | The plan adopts that length, and every holiday from the save moves to its day for it |

**A holiday you wrote is invisible to sync.** It is never updated, never renamed
and never removed, no matter what the save says.

**Season length is mirrored until you override it.** The plan carries its own
length — the one the calendar draws — and the length the save had at the last
sync. A sync adopts the save's length only when the save's length actually
changed since then, so a length you picked here survives every routine sync but
gives way to a real in-game change. When the two differ, an ⓘ next to
**Seasons** in the rail says so: *Your plan (N days) is different to your save
(N days).*

**Two holidays can want the same day, and the save wins.** A holiday from your
save owns its date. If one arrives on a day a holiday you wrote already holds,
yours is set aside — it keeps its day and its settings, and shows in
**Unassigned** reading *Conflict with <name>*, with *Pick a different day below,
or extend the season length.* on the holiday itself. Nothing is deleted and
nothing is rewritten: free the day or lengthen the season and it returns by
itself. The same happens to a holiday whose day no longer exists after you
shorten the seasons — *Doesn't fit N-day seasons*.

On the sync screen holidays are a single count — *N holidays* — meaning how many
holidays moved, new, changed and gone together. Nothing is optional; every sync
applies in full.

**On a first import** every holiday in the save comes in, and the review names
them alongside the season length (*N holidays · 📅 7-day seasons*).

**Elsewhere in the save's life**: a `.s4plan` export carries holidays whole,
a restore rebuilds them, duplicating a save copies them, and **Reset planner
data** deletes them.

## Limitations

- **The list marks what you wrote, not what came from the save.** A holiday you
  created carries a plum **PLANNER** pill; one from your save carries nothing.
  On the holiday itself the only signal is what's missing — no season buttons,
  no day grid, no edit affordances.
- **The icon library holds 30 holiday icons.** A holiday whose icon isn't one of
  them falls back to a question mark.
- **The game's surprise holidays never reach the planner.** The Lottery, Prank
  Day, Talk Like a Pirate Day and five more are events The Sims fires at you, not
  entries on the calendar, so nothing about them can be planned or recorded here.
- **Day off is one switch, not two.** The game tracks time off work and time off
  school separately; the planner reads a holiday as having the day off when
  either is set, and writes both together.
- **A decoration theme the catalog doesn't recognise shows its raw number** —
  *Theme #184879* — rather than a guess.
- **A holiday from your save can't be moved, even as a plan.** Its date is the
  save's, so there is no way to write down "this year I'll hold Harvestfest on
  day 2."
- **The tradition catalog is a flat alphabetical list.** No categories, no
  filter pills — unlike the club activity picker next door, which groups its
  231 activities nine ways.
- **Holidays are private.** They appear on no public page and on no showcase.
