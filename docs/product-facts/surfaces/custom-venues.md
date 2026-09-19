# Custom Venues

**Route** `/saves/:saveFileId/custom-venues` ·
**Tier** 2 ·
**Requires** **Adventure Awaits (EP20)** for custom venues to mean anything in
your game. The gate is soft: without the pack the page still opens and works in
full, with a banner reading *Adventure Awaits isn't marked as owned. You can plan
here, but you'd need the pack to actually use Custom Venues in-game.* Venues from
a save need a save; one you build yourself needs nothing ·
**Desktop only** — below the breakpoint, on a touch device, the page is replaced
by *The custom venue tool works best on desktop* ·
**Polish** shippable and photographable ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`pages/CustomVenues.tsx`, the shared parts it draws with
(`RequirementEditor.tsx`, `EntityText.tsx`, `MasterDetail.tsx`,
`OverviewTiles.tsx`, `Dropdown.tsx`, `PlannerPill.tsx`, `DesktopOnly.tsx`,
`PackNotOwnedBanner.tsx`), its catalogs (`stockActivities.ts`,
`stockVenuePresets.ts`, `venueLabels.ts`, `venueIcons.ts`, `criteriaCatalogs.ts`,
`stockVenueTraits.ts`, `worlds.ts`), the store and API (`useSaveFile.ts`,
`api.ts`, `types/index.ts`, `server/src/routes/customVenues.ts`,
`server/src/routes/customVenuePresets.ts`, `saveFiles.ts`, `schema.sql`), and all
three sync paths whole (`GameImport.tsx`, `GameReimport.tsx`, `diff.ts`,
`snapshot.ts`, `snapshotBuilders.ts`, `silentRefresh.ts`, `coherence.ts`). And by
driving the page: a venue from a save opened and its roles expanded, a venue
built from scratch, the name and role editors, the requirement builder, the
activity picker, the clock, the attendance dropdown, the getaway switch, both lot
pickers, the preset picker, the replace warning, the save-as-preset dialog, and
preset detail for a Maxis schedule and for a role that came from the save.
Figures below are read off the running page: **7 venues** — 6 from the save, 1
planned — across **2 worlds**, and **53 presets** (12 schedules, 41 roles).

## Why it exists

A custom venue in Adventure Awaits is a lot that runs to a timetable: who is
there, at which hours, doing what, and who qualifies to be one of them. The game
keeps all of it inside one scheduler panel you can open a single venue at a time,
and a role's requirements sit three taps below that.

This page lays every custom venue in your save out side by side, and lets you
build the ones you intend to make — the roles, their requirements, the hours —
before you make them, so a getaway or a camp can be designed in full and then
copied into the game.

## What you see

**The rail**, on the left: a **Custom Venues** title, a **Venues | Presets**
toggle, a green **+ NEW VENUE** button, and a **Search venues...** box with a
clear ✕. Under it every venue alphabetically. One from your save leads with its
**lot** name in bold and carries the venue's own name as a quiet grey subtitle
(*Kleen Teenz After School* / *Teen After School*); one you built leads with the
venue name and carries a plum **PLANNER** pill. Up and down arrows move the
selection. A search with no hits gives **No matches** and a **Clear search** link.

**Custom Venues at a glance**, when nothing is selected. A wide lead tile
carrying the total with a two-colour bar — **N from save** in green, **N
planned** in plum — over three tiles: **Worlds** (*your venues span*), **Schedule
presets** and **Role presets** (both *your custom presets*).

A plan with no venues at all shows a single card instead: **No custom venues
yet** · *Build a custom venue or getaway — set up its roles and schedule, then
assign a lot whenever you like. Venues imported from your game show up here too.*

**A venue from your save.** The header is the venue-kind icon, the eyebrow
**CUSTOM VENUE**, and the **lot's** name as the title, which opens that lot in
its world. Under it a plum tag holding the venue's own name, a pin with the
world, and **Remove** pushed to the right.

Then two columns, the wider one first:

| Column | What's in it |
|---|---|
| **Schedule** | one boxed card per time slot. The hour leads in large bold type; the slot's main activity sits beside it; below, a tinted strip with one row per role on duty — monogram, name, and that role's activities as icons |
| **Roles** | one card per role — a monogram avatar, the name, and the headcount. It expands to **REQUIREMENTS** (one chip per type: the type in small caps, then each accepted value with its real in-game icon) and **ACTIVITIES** (icons only, names on hover) |

Roles open expanded when there are three or fewer, collapsed above that. A venue
with no schedule shows Roles alone; one with no roles says *No role data yet —
set up this venue's roles in-game, then re-sync to see them here.*

**A venue you built.** The same two columns, editable throughout. The header is
the kind icon, the eyebrow **Custom Venue** or **Getaway**, and the venue's name
as a large editable field with a dashed underline and a pencil. Under it a
control row: a **Getaway** switch with an info tooltip, a host-household picker
when it's a getaway, the lot — either a chip naming it (*lot · world*, with
**Change** and an ✕) or an **Assign a lot** / **Pick a lot** button — and
**Remove**.

**NOTES · private** closes the page either way.

**Presets.** The Presets tab replaces the list with the preset library, under a
**Schedules N | Roles N** sub-toggle. Both lists are grouped **From save** ·
**Made in planner** · **Maxis**, each row showing *N roles* for a schedule or a
headcount for a role. Nothing selected shows **Preset library** — *Reusable
schedule and role templates* — over two large counts. Opening one shows the same
Schedule / Roles layout, always expanded, headed by the name and two tags
(**SCHEDULE PRESET** or **ROLE PRESET**, then **From save** / **Made in planner**
/ **Maxis**). A preset you made in the planner also carries **Delete preset**.

**Where a custom venue shows up elsewhere.** On its lot, in both places a lot
appears. The lot editor's **On this lot** row gains a **Custom venue** cell
naming it, with an arrow that opens this page in a new tab; the lot's tile in the
world view carries a **Venue:** line under its type. Both appear only while the
lot's type is **Custom Venue** — pick that type from the lot editor's list and
the cell turns up immediately, pick anything else and it's gone, because the lot
can't run a schedule. Nothing else in the app mentions venues: not Home, not the
sim roster, not any public page.

## What you can do

### The list

- **Search** by name — and, for a venue from your save, by world — and **create**
  one: **+ NEW VENUE** makes an empty venue and opens its editor straight away.
- **Move between venues with the arrow keys.**
- **Switch to the preset library** and back.

### Any venue, yours or the save's

- **Write notes.** Private, planner-only, saved when you click away.
- **Remove it** — *Delete this custom venue?* (or *Delete this getaway?*) with a
  red Delete. Removing one that came from your save doesn't touch the save; it
  takes the venue out of the plan.
- **Open its lot**, which jumps to that world with the lot editor open.

### A venue you built

- **Name it.**
- **Make it a getaway.** A switch. A getaway is hosted by a household — a
  searchable picker appears — and is yours alone: *Getaways are hosted by a
  household and only exist while you're actively playing it in-game… it never
  syncs in from the save.* **A getaway never takes a lot**, so the lot control
  disappears while the switch is on and any lot the venue held is given back.
  Switching it off clears the host.
- **Give it a lot, or don't.** A custom venue works with no lot at all; you can
  assign, change or unassign one at any time. **The lot and the venue move
  together**: taking a lot converts it to a **Custom Venue**, and letting it go —
  by unassigning, by picking a different lot, by switching on Getaway, or by
  deleting the venue outright — hands the lot back the type your save last
  reported for it. A lot the game itself calls a Custom Venue keeps that type;
  there's nothing to undo.
- **Roles.** **+ Add role** adds one; each has a name, a sims stepper (1–20), up
  to five requirements and up to five activities. **Add from preset** appends a
  role from the library. The floppy icon saves that role as a preset of your own;
  the bin removes it, and takes it out of every time slot with it.
- **Requirements**: **+ Add requirement** → pick a category → pick values. Nine
  categories — Age, Skill, Trait, Career, Occult, Celebrity level, Gender,
  Orientation, Relationship. Skill, Trait and Career open searchable catalogs
  filtered to the packs you own; the rest offer fixed lists. One requirement per
  category, holding as many values as you like — they mean *any of* — except
  Gender, Orientation and Relationship, which take one. Choosing a category you
  already use re-opens it with your picks ticked. Each requirement is **required**
  or **optional**, toggled by clicking its pill.
- **Activities**: **+ Add activity** opens the catalog — **211 activities**,
  filter pills for the nine in-game groups (Social, Food & Drink, Art & Music,
  Fun & Games, Hobbies, Outdoor, Home, Kids, Mischief & Mayhem), a search box and
  a running **N / 5**. **Done** replaces the set wholesale.
- **The clock.** **Add Timeslot** places the first slot at **6 AM** and each
  later one three hours after the last. Any hour is pickable as long as it sits
  at least three hours from every other slot, on a 24-hour cycle — the rest are
  greyed. Eight slots is the ceiling, and the last remaining slot can't be
  deleted. The schedule always reads chronologically, so midnight sorts first.
- **Each slot** takes an optional **main activity** and a cast: **+ Add role**
  offers only roles that still fit inside the slot's 20 sims, and the count reads
  **N / 20**. The gear beside a role opens that role's activities **for this slot
  only** (up to five, seeded from what it would otherwise do), with **Reset** to
  hand it back to the role's own list.
- **Presets.** **Use a preset** replaces the whole schedule and its roles, and
  warns first — *Auto-save means there's no undo* — offering **Save current as a
  preset first**, **Replace anyway** or **Cancel**. **Save as preset** stores the
  schedule under a name of your choosing. A schedule or role you started from one
  of **your own** planner presets can **Update "X"** instead of saving a new one;
  one that came from Maxis or from your save can only be saved as new.

### The preset library

- **Browse** by kind and origin, and **search** by name.
- **Open** any preset to read its roles and schedule in full.
- **Delete** a preset you made in the planner.

## What you can't

- **Change anything the save gave you.** On a venue from your save the name, the
  roles, their requirements and activities, and every time slot are read-only.
  Notes are the exception.
- **Push any of it back to the game.** A venue you build here is a plan, not a
  save edit — you still have to set it up in-game.
- **Go past the caps**: five requirements and five activities per role, twenty
  sims per role, twenty sims in one time slot, eight time slots, and no two slots
  closer than three hours.
- **Dress a role.** The game gives a role an outfit; the planner neither authors
  one nor shows the one an imported role has.
- **Filter a role by world, marital status or financial status.** Those exist for
  clubs and small businesses; a venue role doesn't offer them.
- **Put a venue on an apartment or a penthouse**, on a hidden lot, or on a lot
  somebody lives on. A venue isn't a home.
- **Give a getaway a lot at all.** It's hosted by a household and exists only
  while you're playing it, so it has no address to give.
- **Put two venues on one lot.** A lot holds one, and a lot already taken isn't
  offered by the picker.
- **Edit or delete a Maxis preset, or one that came from your save.** They are
  reference.
- **Give a venue an icon of its own.** The two kind icons are fixed.
- **Open the page on a phone.**

## How it relates to sync

Every venue is one of two things, and the page never mixes them: **a venue read
out of your save**, or **a venue you built**.

**A venue from your save is identified by its lot** — not by a game id, the way
every other imported record here is. One lot holds one venue, so the lot is a
safe name for it.

**What the save owns.** The venue's name, its roles and its time slots — the
whole schedule — are compared against the save on every sync, and where the game
has moved on, the game wins. The venue counts **once** on the sync screen however
much of it moved.

**Order is normalised before anything is compared.** The game rewrites roles,
requirements, requirement values, activities, slots and per-slot lists in a
different order each time it saves. Both sides are sorted into a fixed order
first, so identical content compares equal; without that, every sync would report
every venue as changed.

**What you own.** Notes. They are never read, never compared and never
overwritten.

**What a re-sync does.**

| What happened in game | What the plan does |
|---|---|
| You set up a new custom venue | It arrives, on its lot |
| You renamed it | Adopted |
| You changed its roles, their requirements or their activities | Adopted |
| You changed the hours, who's on duty, or what they do in a slot | Adopted |
| You tore the venue down | It leaves the plan |
| You rebuilt the same venue on a different lot | It reads as one venue leaving and another arriving — and the notes go with the one that left |

**A venue you built is never updated, renamed or removed**, no matter what the
save says. That is a deliberate rule rather than something that falls out of the
design: identity here is the lot, and a venue you built can have one, so without
the guard every sync would read it as gone from the game and delete it.

**Its lot is the one thing it can lose.** Two things make a claim on a lot
impossible, and both hand the lot back — the venue itself, with its name, roles
and schedule, always survives:

| What happened | What the plan does |
|---|---|
| You planned a venue onto a lot, then built a venue there in game | The real one takes the lot; the one you planned keeps everything and becomes lot-less, ready for somewhere else |
| The game rezoned the lot to something that isn't a Custom Venue | The venue lets it go — that lot can't run a schedule any more |

Which lot type wins is settled first, so a lot **you** converted to a Custom
Venue isn't mistaken for one the game rezoned: your conversion survives the sync,
and only a type the save actually changed takes the lot away.

**The preset library is refreshed wholesale, outside the review.** Every sync
replaces every preset that came from your save with whatever the save holds now,
and never says so. Presets you made in the planner are left alone; the Maxis ones
aren't stored at all — they're a built-in catalog of **11 schedules and 36
roles**.

On the sync screen venues are a single count — *N custom venues* — meaning how
many arrived, changed and went, together. Nothing is optional; every sync applies
in full.

**On a first import** every custom venue in the save comes in, and the review
names them alongside the library (*4 custom venues · 6 presets*). A lot the save
reports as a Custom Venue that has no schedule on it still gets a row, as an
empty placeholder — that includes the two lots the game ships as Custom Venues,
Camp Gibbi Gibbi and Revive and Thrive Retreat.

**Elsewhere in the save's life**: a `.s4plan` export carries venues and the
preset library whole, and a restore rebuilds them with a getaway's host
re-pointed at the restored household and every *started from* label re-pointed at
the copied preset it names; duplicating a save copies the lot; **Reset planner
data** deletes both.

## Limitations

- **A venue you planned and then built for real arrives as a second venue.** The
  sync gives the lot to the one from your save and sets yours loose rather than
  merging them, because nothing tells it whether the venue you built in-game is
  the one you designed or something else entirely. Both are on the list until you
  delete the one you don't want.
- **The list marks what you built, not what came from the save.** A venue you
  created carries a plum **PLANNER** pill; one from your save carries nothing. On
  the venue itself the only signal is what's missing — no edit affordances.
- **A modded activity can be shown but never named.** An activity added by a mod
  keeps its name in the mod's own package file, which the save doesn't carry — so
  there is nothing to recover. It draws a puzzle piece where the real icon would
  go, which is as much as can honestly be said about it. Two of them are still
  two: the id behind each is kept exactly as the save wrote it, so they stay
  distinct even though neither has a name. Every one of the game's own **211**
  venue activities has its real art.
- **Outfits can't be named either.** The save records that a role has a set
  outfit, but stores the dress code and the colour as numbers with no names
  attached to them, so the most the page could honestly say is *that* there's an
  outfit — and it says nothing.
- **Removing a venue that came from your save is undone by the next sync.** The
  save still has it, so the next sync brings it back — without the notes you had
  written on it.
- **A requirement the catalog doesn't recognise shows its raw number** under the
  label *Filter*, rather than a guess.
- **Custom venues are private.** They appear on no public page and on no
  showcase.
