# Import

**Route** no route of its own — a modal, opened from **+ New save** on `/saves`,
from the first-run **Import from Sims 4 save** button, or from **New save** in
the top bar's My Saves menu ·
**Tier** 1 ·
**Requires** no pack ·
**Polish** shippable ·
**Verified** 2026-08-12 by reading end to end: `GameImport.tsx` (all 1,014
lines), every file in `src/components/gameImport/`, `familyImport.ts`,
`provenance.ts`, `detectPacks.ts`, the entry points (`SaveFilePicker.tsx`,
`NewSaveChooser.tsx`, `TopBar.tsx`, `ImportDesktopSheet.tsx`), the landing
(`FirstImportCelebration.tsx`) and the store (`saveFiles.ts`, `lots.ts`) — then
importing a real 426-lot save end to end and reading back everything it wrote.
Every count on the review step and the celebration was screenshotted against that
save's stored rows, and the failure path was driven by blocking the household
writes mid-import

> **This is the first thing anyone does.** It is the only screen in the product
> that every single user meets, and the one that decides whether the planner is
> worth the trouble. Everything after it is editing what this screen produced.

## Why it exists

Every planner before this one started you at an empty page. A Sims save holds
hundreds of households, four hundred lots, clubs, businesses, holidays and a
family tree going back generations — nobody is going to type that in, so nobody
ever did, and the plan stayed a wishlist.

Import reads your `.save` file and builds the plan for you. The real one, with
your families in it, in a few seconds.

## What you see

Four steps in one modal, then a landing.

**Import from Sims 4 save.** A card headed **Where your saves live** giving both
paths — Windows `C:\Users\[Your Username]\Documents\Electronic Arts\The Sims
4\saves` and Mac `Documents/Electronic Arts/The Sims 4/saves` — wrapped at the
separators so neither runs off the edge. Then a green note with a shield: *Your
save file is read **locally in your browser** — the raw file is never uploaded.
Only the extracted records (lots, sims, households) are sent to the planner's
server.* Cancel, and **Choose save file**.

**This step is skipped entirely on a first run**, where the same guidance is
already on the page you're standing on and the button there opens the OS dialog
directly. It survives for later imports, which start from a modal rather than
from a page with room to say it. The first-run page itself waits for the save
list to load before rendering — until then `/saves` shows only the header and a
loader, so the manager's chrome never flashes ahead of the import door.

**On Chrome and Edge the dialog is aimed at your saves folder.** This modal, the
first-run hero and the sync modal share one dialog identity, and the browser
remembers a folder per identity — so the first pick teaches it where your saves
live and every later one opens there, without drifting to wherever a photo was
last uploaded from. It never remembers the *file*, only the folder, because Save
As is normal and which save you're importing stays a choice. Firefox and Safari
get the plain file input, unchanged. Full behaviour in `save-files.md`.

It deliberately gives no advice about *which* save to pick. Save numbers don't
run in a dependable order, and sending someone to the wrong one is worse than
making them look.

**Reading save file…** — a spinner over *Parsing DBPF container…*.

**Everything in this save.** The title promises completeness, so the screen
delivers it: this is the only moment you meet every concept the planner
understands at once.

It opens with the save's own identity, not a control: the **save's name** in
bold with its **slot filename** underneath (**Family Tree Save** /
`Slot_00000003.save`). That pair is the actual decision on this screen — *is
this the right save?* — and the slot is how you tell two of your own apart.

**You can't rename here, on purpose.** Renaming already lives on the planner's
title and on `/saves`, and offering a third place to do it stops you mid-import
to name something you haven't seen yet. The plan takes the save's own name and
you can change it whenever you like.

Then one flat two-column grid, every concept the planner understands with its
number: **209** households, **485** sims, **6** lot changes, **11** clubs, **3**
small businesses, **4** holidays, **9** dynasties, **4** custom venues, **59**
family tree records. Cancel, and **Import**.

**Only what's actually there appears.** A base-game save with no clubs,
businesses, holidays, dynasties or custom venues shows three entries, not nine
with zeroes, and the modal is shorter for it.

Households and sims are *in* that grid rather than ranked above it. Giving them
their own larger tier put a second type size and a second alignment on a card
that is, in the end, a list of what's in a file. Each entry reads as a phrase
with a flush left edge, not a right-aligned column of figures — a column of
209 / 6 / 3 / 9 / 59 straightens its right edge but staggers the left one, and
five rows of that draw a shape down the card that has nothing to do with the
content.

No sub-counts, and no persuasion. *(3 renamed · 5 retyped)*, *· 315
connections* and *· 3 presets* were detail nobody can act on at the one moment
nothing is optional, and they were most of the noise. The button says **Import**
rather than *Import 209 households*, because households are a fraction of what
it imports.

The lot count is per **planner lot**, not per record in the save: a multi-unit
building is several records that all land on one lot, and it counts once.

**Importing…** — a spinner and a running label, with no close button. It names
each stage as it goes: creating the save file, applying lot changes, **Importing
180 of 209 households…**, the family tree, clubs, dynasties, small businesses,
holidays, custom venues, venue presets.

**Your save is linked.** You land on the planner's Home and a centred overlay
fires once — the bobbing plumbob, *"Your save is linked."*, one quiet line —
*Sync any time to keep your plan up to date as you play* — and **Let's go!**

**No counts.** You read them on the review screen and then pressed Import, so
restating them makes a celebration into a receipt, and at headline size they
shouted over the two things that are actually the moment. What's there instead
is the only thing worth saying here that isn't a repeat: that syncing exists —
which is what *linked* is hinting at, and which a new user has no other way to
learn at this point.

This is the only screen in the app that gets the plumbob and its glow. It
dismisses itself after five seconds, and clears its own flag so a refresh
doesn't replay it.

**On a phone** the whole flow is replaced by **Import on desktop**, which
explains that the `.save` lives on the computer where the game is installed and
offers **Copy link** and **Email me this link** to carry the session over.

## What you can do

**With the file**

- Pick any `.save` from anywhere on your computer
- Pick a different one after a wrong-file error, without leaving the modal

**With the save you're about to create**

- Rename it before it exists — it starts as the save's own name, not the filename
- Cancel at any point before **Import**

That is the entire surface. **There is nothing to select, tick or exclude** —
every household in the file comes in, because deciding 209 times before you've
seen anything is not a decision anyone can make.

## What you can't

- **Choose which households to import.** Full ingest, by design. Sorting happens
  afterwards on the Households screen, where you can see who they are.
- **Import into a planner save you already have.** This always creates a new one.
  Linking an existing hand-built plan to a `.save` is re-sync's first-link path.
- **Import on a phone.** You get the "continue on desktop" sheet.
- **Import anything but a `.save`.** A `.package` is the same container format so
  it parses happily and yields nothing; that's caught and named as **Wrong file
  type** — *The file you're looking for ends in `.save`* — rather than walking you
  to a review screen listing zero of everything. Same words for a file that isn't
  a Sims file at all, because the fix is the same.
- **Undo it.** There's no rollback; you delete the save from `/saves` instead,
  and it sits in the trash for 30 days. If the import itself falls over partway,
  the message names the save it left behind and offers to **Delete it** for you.
- **Get separate lots for a multi-unit building.** The planner has one row per
  lot, so the save's five Fern Park units land on one Newcrest lot. Its name and
  type are merged from all of them: a unit you renamed wins over a stock-named
  one, whatever order they're read in.

## What comes in

**Everything the parser can reach**, on a real save of mine:

| | |
|---|---|
| Households | 209 — 27 **Yours** (19 built, 8 premades you've played), 182 Rest of Town (161 premade, 18 townie, 3 service) |
| Sims | 485 on the roster, plus 41 tree-only relatives and 18 **Unknown** ancestor stubs |
| Per sim | name, gender, lifestage, species, pet breed, occult, ghost state, cause of death, traits, aspiration, university enrolment, career, skills |
| Family tree | 59 records (41 relatives, 18 **Unknown** ancestors) and 315 connections |
| Lots | all 402 are seeded into every save; the import writes only the names and types the save disagrees with, and assigns households — 120 lots occupied |
| Clubs | 11, with members, leader, criteria, rules and hangout lot |
| Small businesses | 3, with owner, employees, customer criteria, fee mode, pricing and perks |
| Holidays | 4, with traditions, time off and decorations, plus the 7-day season length |
| Dynasties | 9, with members, crest, prestige, alliances and rivalries |
| Custom venues | 4, plus 3 saved presets |

Households are labelled as they come in, using the save's own authorship marker:
a household you built, downloaded or have played becomes **Yours**, everything
else lands in **Rest of Town**.

**Which packs you own is read off the save and added to what we already know**,
so the traits, aspirations, careers and skills you're offered afterwards are the
right ones. It's worked out while the file is being read but only **written when
the import runs** — cancel at the review and your pack list is untouched. That
matters more here than anywhere: this is usually the first detection you'll ever
have, and going from nothing detected to something detected is what narrows the
planner from the whole library down to what this save proves. It only ever adds
packs, never removes them, and you can override any of it in Pack Settings.

## How it relates to sync

**Import is what makes re-sync possible.** As it writes each record it also
stores a snapshot of exactly what the save said at that moment. Re-sync compares
against those snapshots, which is how it can later tell *the game changed this*
from *you changed this* and leave your edits alone. Households, sims, clubs,
businesses, holidays, dynasties and custom venues all get one; lots get one only
where the save differed from the stock world.

**A lot's snapshot is written exactly once**, from the merged records rather than
one per record. It has to be: a multi-unit building's units would otherwise
overwrite each other's snapshot in turn, and a stock-named unit landing last would
stamp its name into a lot the game had renamed — leaving the next re-sync to read
the game's rename as yours. Import and re-sync resolve lots through one shared
rule, so the two can't drift apart.

**Renamed apartment units land on the right unit.** The units of one apartment
building are told apart in the save only by name, so a renamed unit is placed
by elimination among its building's units, and the import stores each unit's
save-internal id — the identity every later sync uses to follow that unit
through any rename.

**The save is stamped as linked and synced.** The filename and the save's own
name are stored, and the sync clock starts at creation — so a fresh import reads
**Synced today** on the save list rather than "never".

**The season length is written twice** — as your plan's length and as the
imported baseline — so they start out matching, and only diverge when you
deliberately change one.

**Records that fail are skipped, not fatal.** Every sim, club, business, holiday,
dynasty and venue is written independently, and one that fails is dropped
silently rather than stopping the import. The family tree is additive and can
never fail the import.

**If the import as a whole falls over, it says what it left behind.** The save
file is created in the very first step, so a failure at household 40 of 209
leaves a real, half-filled save on your account. The message names it — *"Family
Tree Save" was created, with part of your save in it* — with a **Delete it**
button that bins it (recoverable for 30 days, like any deleted save). Only a
failure creating the save file itself says nothing was saved, because only then is
it true.
