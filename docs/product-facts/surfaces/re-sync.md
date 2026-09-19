# Re-sync

**Route** no route of its own — a modal, opened from the top bar's sync chip,
Save settings, or a save row's ⋯ menu ·
**Tier** 1 ·
**Requires** no pack ·
**Polish** shippable; on `main`, not yet in production ·
**Verified** 2026-08-14 by reading end to end: `GameReimport.tsx`,
`householdRealization.ts`, `familyImport.ts`, the server's household- and
sim-delete routes, `SimPanel.tsx` (where a move destination is created), the sync
rules (`diff.ts`, `snapshot.ts`, `plannedMoveSync.ts`, `coherence.ts`,
`silentRefresh.ts`) and the store (`useSaveFile.ts`) — then driving a **full
sync** end to end with a real 15MB save: 25 households renamed in the planner
first, and all 25 renames still in place afterwards while every game-owned field
matched the save. The counting rules are covered by unit tests
(`silentRefresh.test.ts`); the per-field merge reaching the database is covered
by `diff.test.ts`. Re-driven the same day against the same save with a lot and a
business staged to force real work through both: a planner rename with an
agreeing baseline was left alone, a rename the save had moved past took the
save's value with its baseline refreshed, and a business location the save never
had was dropped with its baseline refreshed — each a single write

> **This is the product.** Everything else is a planner; this is the part that
> keeps a plan alive while you keep playing. If one thing gets described
> correctly, make it this.

## Why it exists

You plan in the app and then go and play. The game moves on — babies, moves,
promotions, someone dies, you build a house. Without a way to pull that back in,
a plan is out of date the first time you load the save, and every planner that
came before solved this by making you re-enter everything.

Re-sync is the answer: hand it your save file again and the plan catches up,
keeping everything you wrote.

## What you see

Five steps in one modal, headed simply **Sync**. One word, no subtitle — this
is the screen you see most, so it earns the least. What a sync does to your
notes, photos, inspo and descriptions is a promise you need once, not every
week, so it lives on **`/help/syncing`**, linked from the footer's left half as
**How syncing works**. The import modal carries the same link as **How
importing works**.

That page is the only place two facts now live: what a sync never touches, and
that a different save file removes what's missing from it. It is written from
the surface sheets rather than from `GameReimport.tsx` — a sync writes to nine
surfaces and pointedly doesn't write to five more, and no single source file
knows both halves.

**The explainer is two pages.** `/help/syncing` is the friendly one — three
parts, *Your first sync* · *Every re-sync* · *Anything else* — and it stays
short on purpose. `/help/syncing/advanced` is the full merge reference behind
it: the ownership tiers, the three-way mechanic, compared-field-by-field vs
applied-whole, what yields, adoption, and a **collapsed accordion per surface**
(sixteen of them, all shut on arrival). Both sync modals link only to the first
page; the second is reached from inside it.

That second page is transcribed from marketing's merge reference, **minus three
things that must stay out**: internal provenance (which `PRODUCT_FACTS` revision
it companions, the note that public help copy is a "known liability"), citations
to documents no reader can open, and the copy-desk style guide — whose substance
survives as *Words that mean different things*, because Import ≠ Sync ≠ Restore
genuinely helps a reader.

**Controls say "Sync"; prose says "re-sync" when it means the repeat.** These
don't conflict, and neither one should be swept into the other. A control names
an action, and pressing this one is the same action every week, so it keeps one
name — the way a browser's reload button is called Reload whether or not the
page has been loaded before. Prose has the opposite need: the loop is **sync →
plan → re-sync**, three distinct beats, and flattening the third into "sync"
erases the difference between filling an empty plan and merging into a full one.
The first beat's button is **Import**, deliberately — that first act brings a
save in rather than keeping two things in step.

**Pick.** If this save is already linked, a card reading **Previously imported
from** with the filename and the save's own name. If it isn't linked yet, a note
explaining that nothing you've already built here will be matched against the
save's records, and a checkbox — **Duplicate this planner first** — that runs the
sync on a copy and leaves your original untouched.

**Analyzing.** Brief; the parse itself is under half a second.

**Review.** A short label, **Changed since your last sync**, then every concept
on one dot-separated line — *76 households · 58 sims · 14 lots · 1 small
business · 2 holidays · 9 dynasties · 6 custom venues · 31 family tree updates*
— numbers bold, nouns quiet. A season-length line if it changed. Cancel, and
**Sync**.

**Each number is how many THINGS moved, not how many changes were made to
them**: a club that was renamed, gained two members and lost its hangout is one
club. Only concepts that changed appear.

It's a status line rather than a stat block on purpose. Nine boxed rows with a
hairline under each read as an inventory of a place, and you are looking at this
screen every week — the numbers here are a status, not an event. The events are
the first import and the moment your save is linked, and those keep the big
numbers.

If nothing reached a count, the screen says **No new households, sims or lots**
and promises the rest still refreshes — because it does. That sentence, *Skills,
careers, funds and relationships refresh too*, appears **only** in that case:
it exists so a no-change sync isn't a lie, and everywhere else it was noise.

A line appears above the counts only when something is off: **Different save
file detected** / *Could be a Save As. Your plan is backed up first.* — stated flat,
because a Save As is a normal thing to do and not a mistake to be warned about.
On a first link, that what you already built won't be merged.

**Applying.** A running label — updating lots, adding households, syncing the
family tree — and *Don't close this window.*

**Synced.** A green tick and the word, for a second and a half, then the modal
hands back. No counts: you read them one screen ago and pressed the button, so
repeating them is a receipt for a receipt. No plumbob either — that belongs to
the first time a save is linked. A **first** link skips this and gets the
celebration instead; two congratulations in a row is one too many.

## What you can do

- Sync a linked save, or link a `.save` file to a plan you built by hand
- On a first link, run the sync on a **duplicate** and keep your original
- Cancel at any point before **Sync**

That's the whole surface. **There is nothing to choose, tick, review or approve**
— by design, because you'd be doing it every single sync forever.

## What you can't

- **Pick and choose which changes to take.** Sync applies wholesale.
- **Undo a sync from inside the app.** What you get instead is a backup — see
  below — which you restore from the save list.
- **Sync on a phone.** You get a "continue on desktop" sheet, because the file
  lives on your computer.
- **Sync from a `.package`.** It's the same container format so it parses
  happily and yields nothing; that's caught and named as the wrong file rather
  than reported as everything in your save vanishing.

## How it works

**A backup is taken first, every time.** Before anything is written, the whole
plan is copied into the trash. **If that backup can't be made, the sync stops
rather than proceeding without one.** Backups live 7 days. The one exception is
the first-link **Duplicate this planner first** option, which needs no backup
because it never writes to your original at all — and if the copy can't be made,
that sync stops too.

**What comes from your save**, refreshed every sync: households and their
members, names, descriptions, lots; sims' names, gender, lifestage, occult,
ghost state, cause of death, traits, aspiration, university, career; clubs;
small businesses; holidays; dynasties; custom venues; and the lot names and types.

**What's yours and survives**: notes, photos, inspo, descriptions you wrote,
funds targets, planned moves, planned skills, authored careers, and everything
you created in the planner. Records you made here have no counterpart in the save
and are invisible to the comparison entirely.

**If you edited something and the game didn't touch it, your edit stands** —
**field by field, not record by record**. Each field is settled on its own
against what the save said last time, and the record is then written as the
merge of those answers. So a household you renamed whose members changed in-game
keeps your name and takes the new members; a lot you renamed whose type the game
changed keeps your name and takes the new type. Being counted on the sync screen
doesn't put the rest of a record at risk — the count says *this thing moved*, not
*this thing was replaced*.

**A renamed apartment unit is still the same lot.** The units of one apartment
building share the building's identity in the save and are told apart only by
their names — so the sync also remembers each unit's own save-internal id.
Rename one unit in-game, or every unit of the building at once, and each
change lands on its own planner lot. Only a building whose units were *all*
renamed before the planner ever saw it can't be told apart: those names are
placed across the building's units in a stable order, and from that sync on
each unit is tracked exactly — a later in-game rename moves the right one.

**Two things refresh without ever appearing in a count**, because they drift
every time you play and counting them would report your whole save every sync:
**skills** and **household funds** (causes of death ride along with them). This
is why the screen promises they refresh even when it reports nothing new — and
why "no changes" would be a lie.

**Everything else that refreshes does reach the count**, even though it's applied
without being compared field by field: club rules, requirements, leader and
invite setting; business staff, pricing, standing and which lots the game moved
it onto; holiday traditions, day off and decorations; dynasty alliances and
rivalries. A session where you only rewrote one club's rules reports **1 club**.

Two more happen quietly on every sync. **Which packs you own is read off the save
and added to what we already know**, so the trait, aspiration, career and skill
lists you're offered stay right. And **a household's label is re-derived**, so a
premade you've started playing, editing or moving sims into moves itself from
Rest of Town into Yours without you doing anything.

**Planned moves resolve themselves.** A planned move clears the moment that sim
actually changes household in the game — whether or not they went where you
planned, because moving is deliberate and reality outranks a plan. It doesn't
clear if the sim has vanished from the save, and never on a first sync.

**Plans that reality makes impossible yield, quietly.** A business on a lot a
family has moved onto, or on a lot you rezoned to something a business can't
occupy, comes off that lot. A club loses a hangout the game turned into a rental.
A lot you'd typed as a business venue that now has residents takes the game's
type back.

**A household you planned that becomes real is adopted, not duplicated.** There
are two ways to have a **Plan-only** household: you named one as a move
destination (which starts with no members and no lot — it exists because a sim
points at it), or you built one yourself. Either way, once you make it for real
in the game, the sync matches your record to the new one — by your movers
turning up in it together, or by it appearing on the lot you'd assigned. Your
record then *becomes* that household, keeping your notes and funds target and
taking the save's name, members and description, instead of leaving you with two
copies of the same family.

**Sims you invented inside it are deleted when that happens.** The save's roster
replaces them wholesale; there's no attempt to pair an invented sim with the real
one who matches. Notes on the household survive — notes on those invented sims
don't. Nothing on screen reports this, which is deliberate: the household and
everything you wrote about it come through intact, and a count of replaced
placeholders would be noise on a screen whose job is to be calm.

Adoption runs only on a save you've synced before — never on a first link — and
only against households that are brand new in that sync. Movers joining a family
your plan already knew about never trigger it; that family already has its own
identity.

**A named destination nobody is moving to any more is deleted.** Once a Plan-only
household has no members *and* no planned moves still pointing at it, it's spent
scaffolding and goes silently. A household you built by hand always keeps at
least one sim, so this only ever clears the empty name-only boxes.

**Your family tree is the archive the game doesn't keep.** Sims who leave the
save but matter to the tree — the dead, anyone a living sim is related to — move
off the roster into the tree rather than being deleted. Missing ancestors are
created, including the game's dangling "Unknown" ones, and the tree reaches
*through* an Unknown, so a grandparent who is in the save stays connected to a
grandchild even when the parent between them isn't. The walk covers humans only:
a pet is never an ancestor and never a stub. Relationships you added by hand are
never touched by the sync.

**A link you drew by hand belongs to the two sims it joins.** Delete a
*household* and the tree is protected — every member who appears in any family
relationship is kept as a tree-only record, and only the unrelated ones go.
Delete a *sim* and their links go with them, hand-drawn ones included: a sim you
deliberately deleted doesn't linger in your tree. That applies to the invented
sims an adopted household loses, so a link you drew to one of those placeholders
goes when the placeholder does. Links between sims that still exist are unaffected,
and so is everything you wrote about the household itself.

**Seasons mirror until you override.** The save's season length is adopted only
when it actually changed since the last sync, so a length you set by hand isn't
undone every time.

**The link follows your save.** The filename and the save's name are re-stamped
each sync, so an in-game *Save As* doesn't leave the plan pointing at a file you
no longer use. The plan adopts the save's name on a first link, and afterwards
only while you haven't renamed it yourself.

**A partial failure doesn't roll anything back.** You're told how many changes
didn't go through, everything else stays applied, and syncing again retries the
rest. Retrying works because what a record *becomes* and what it records *the
save as having said* are written together in a single go. A change that didn't
land therefore leaves nothing behind claiming it did, so the next sync still
sees it as outstanding rather than treating it as already agreed.

**"Your save is linked" only celebrates a first link**, never a routine sync.

## Limitations

- **No sync is written down.** The plan keeps no record of what any past sync
  did — no history, no log, nothing in the database. Each entity stores only what
  the save last said about it, so once a sync lands, the previous values are
  gone. The one durable trace is the backup in the trash, and that's a whole copy
  of the plan rather than an account of what changed.
- **A count doesn't say what moved.** *4 holidays* means four holidays are
  different; whether that was their traditions, their day off, their decorations
  or their place in the calendar isn't stated, and can't be recovered afterwards
  — traditions, day off and decorations aren't in a stored snapshot to compare
  against. While a sync is running it names each one in the browser console
  (`[sync] holiday "Harvestfest" refreshed: traditions, timeOff`), which answers
  the question in the moment but keeps nothing.
