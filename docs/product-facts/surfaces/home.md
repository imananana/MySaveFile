# Home

**Route** `/saves/:saveFileId` ·
**Tier** 1 ·
**Requires** no pack. Pack ownership changes how a world is *marked* here, never
whether you can open it ·
**Polish** shippable and photographable ·
**Verified** 2026-08-12 by reading every file for this surface end to end —
`Dashboard.tsx`, `WorldProgressBar.tsx`, `Sidebar.tsx`, `TopBar.tsx`,
`MobileBanner.tsx`, `FirstImportCelebration.tsx`, `WarnCallout.tsx`,
`worlds.ts`, `packs.ts`, `relativeTime.ts`, the store (`useSaveFile.ts`,
`usePackOwnership.ts`, `mappers.ts`), the server's save-file route, and the sync
rules (`GameReimport.tsx` whole) — and by driving the page: both world views,
all four Lot Types tables, renaming the save with Enter and with Escape, a
world switched off, two packs forced off, and the stale-sync nudge. The lot
totals were read back off the running page and reconciled against the header:
**379 = 379** with every pack owned, **352 = 352** with two packs locked.

## Why it exists

A plan is bigger than any one screen: thirty worlds, four hundred lots, and
everyone who lives in them. Home is the one place you see all of it at once — how
much of your save is actually built, which worlds you've started, and which
you've never touched. It is also where your plan meets your game: the button
that pulls in everything you've played since last time lives here.

## What you see

**The save's name as the page title**, with a pencil that appears when you hover
it. Under it, one line of facts about this save: how many **worlds**, how many
**lots**, what percent is **built**, what percent is **planned**, and — once a
`.save` is linked — **how long ago you last synced**. The first four describe
the world you can actually plan, so a world drops out of all of them if you've
switched it off *or* if its pack isn't one you own.

**The sync age is always shown**, never at a threshold, so nothing appears to
scold you for playing at your own pace. It sits quiet while recent and firms up
from grey to solid black once a month has passed — the same words in the same
place, weight doing the work. A plan with no `.save` linked omits it entirely,
because *synced never* says nothing.

**A green button, top right.** On a plan linked to a `.save` it reads **Sync
from save**; on one that has never been linked it reads **Import save**. The
top bar carries the same button, with the time since the last sync on it —
*Sync · 4 days ago*.

**A plan with nothing in it yet gets a card instead of the button.** When a
save has never been linked *and* nothing has been authored — no household, no
planned lot — a card sits under the stats line: **Import your own save file!**
*Your sims, households, and lots will show up here.* — with a green **Import
save** button on its right. The
header button steps aside while the card is up, so the screen offers the
action once. The card retires itself the moment anything exists — a linked
save, a household, one planned lot — and never comes back, so a deliberate
from-scratch plan is never nagged.

**Two tabs — Worlds and Lot types** — and, on Worlds, a tile/list toggle.

**Worlds, as tiles.** A card per world, its artwork floating above the card:
the world's name, the pack it came with, a three-part progress bar, and
**`N / M built`**. The bar is green for built, plum for planned, grey for the
rest, and a legend under the grid says so.

**Worlds, as a list.** A table instead: **World · Pack · Neighborhoods · Lots ·
Progress**, with the same bar and count. The Neighborhoods column lists the
neighbourhoods that actually hold a lot you can plan, so worlds whose specials
belong to no neighbourhood — Magnolia Promenade, Mt. Komorebi — read
**Other** rather than the game's internal placeholder.

**A grey tile means one of two things, and it says which.** Neither reports
progress — a bar and a *0 / 15 built* on a world that counts toward nothing is
a number about nothing, so the reason sits in that space instead.

- **Switched off in this save** — greyed, reading **Disabled**, with a **red**
  toggle. It sinks to the end of the grid, and to the bottom of the sidebar's
  world list, where it also carries an eye-slash.
- **From a pack you don't own** — greyed, with a **padlock** badge in the corner
  and **Requires Cats & Dogs** where the progress would be. It keeps its place
  in release order. The sidebar goes further and lifts these worlds out of the
  list entirely, into a collapsed **Locked (N)** section.

**Lot types.** Four tables — **Home**, **Rental**, **Venue** and **Other** — one
row per lot type: **Type · Total · Built · Planned · Unplanned · Progress**.

Every lot is counted under the type it is **now**, so retyping a house to a
nightclub moves it out of Residential and into Nightclub, total included. That
also means the tab describes *your* save rather than the game's catalogue: a
type shows up here because you have one, not because EA shipped one. Vacation
Rentals are counted as Rentals, and the four tables together always add up to
the lot count in the header.

**Other** holds the game's fixtures — the Police Station, Willow Creek Hospital,
Copperdale High School and its Auditorium, the Komorebi summit, Myshuno Meadows,
the StrangerVille lab, Windenburg's Ancient Ruins, the Bluffs and Von Haunt
Estate. They're plannable and they're on their world pages, but they aren't a
kind of build, so they sit apart under a neutral heading rather than among the
venues.

**A celebration, once.** The first time a plan is linked to a `.save`, Home
opens with a centred card — a glowing plumbob, *"Your save is linked."*, one
quiet line (*Sync any time to keep your plan up to date as you play*) and a
**Let's go!** button. No counts: they were on the import screen a moment
earlier, and repeating them turns a celebration into a receipt. It clears
itself after five seconds and never returns.

This is the only screen in the app with the plumbob and its glow, and a routine
sync gets no fanfare — spending either here is what keeps them worth something.

## What you can do

**With the save**

- **Rename it** — click the title and type. Enter saves, clicking away saves,
  Escape abandons the edit. There is no Save button.
- **Sync from your save**, or **link a `.save`** for the first time. Both open
  the same sync window.

**With a world**

- **Open it** — the whole tile, or the whole row, is the link. A padlocked world
  opens just like any other.
- **Switch it off for this save** — the toggle. Its lots, and its world content,
  drop out of the four numbers, out of the Lot Types tab, out of the lot pickers
  and out of the randomiser. **Sims are never filtered by it.** Reversible from
  the same toggle.
- On a padlocked world the toggle doesn't switch anything — it asks whether to
  open **Pack Settings** so you can mark the pack as owned.

**With the view**

- Switch between **Worlds** and **Lot types**. The tab lives in the address, so
  the sidebar's **Home** link always brings you back to Worlds.
- Switch the worlds between **tiles** and **list**.

## What you can't

- **Add, remove or reorder a world.** All thirty are always here, in the order
  the game released them, and a sync never adds or removes one.
- **Change anything about a lot from here.** Every number on this page is a
  read-out; the lot editor lives on the world page.
- **Set or clear a status.** The built and planned percentages only move when
  you move a lot, on its own world page.
- **Reach a world's inspo board or showcase from here** — those buttons are on
  the world page.
- **Dismiss the sync age.** There is nothing to dismiss — it's a fact on a line
  of facts, not a banner, and it costs no more room than *379 lots* does.

Not desktop-only. The page, both world views and the Lot Types tables all work
on a phone, and the tables scroll sideways rather than squashing.

## How it relates to sync

**Nothing on this page is a mirror of your save.** Every number is derived from
lots, and the two fields Home itself owns — the save's name and which worlds are
switched off — are yours.

- **The four numbers are built from lot statuses, and status never syncs.** A
  sync can rename and retype lots, but it never sets a status, so *% built*
  and *% planned* only ever move because you moved them.
- **Worlds you've switched off stay switched off.** That list is never read or
  written by a sync.
- **The save's name follows your `.save`'s name — until you rename it.** On the
  first link it takes the game's name, and on later syncs it keeps up with an
  in-game rename, but only while the two still match. Renaming it here is
  permanent: from then on the two names go their own ways.
- **The file it's linked to re-points on every sync** to whichever `.save` you
  just picked, so an in-game *Save As* is followed rather than flagged.
- **Last synced** is stamped at the end of every successful sync. That stamp is
  what the top bar reads and what the age on the stats line counts from.
- **Syncing can unlock worlds, and can never lock one.** Every sync adds the
  packs it can detect in your save to what you're treated as owning, and removes
  nothing — so padlocks only ever disappear, and the four numbers only ever grow
  as a result.

The sync itself — what it compares, what it keeps, what it overwrites — belongs
to `re-sync.md`. Home is only its front door.
