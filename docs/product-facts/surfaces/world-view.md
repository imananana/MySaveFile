# World view

**Route** `/saves/:saveFileId/world/:worldName` ·
**Tier** 1 ·
**Requires** no pack to open; a soft banner appears when the world's own pack
isn't marked owned, and the lot-type picker only offers types from packs you own ·
**Polish** shippable and photographable ·
**Verified** 2026-08-12 by reading every file for this surface end to end —
`WorldView.tsx`, `WorldMap.tsx`, `LotCard.tsx`, `LotEditModal.tsx`,
`ApartmentBuildingModal.tsx`, `lotEdit/BuiltPhotoStrip.tsx`,
`lotEdit/InspoPhotoSection.tsx`, `worlds.ts`, `lotPins.ts`, `lotIcons.ts`,
`lotTypePacks.ts`, `usePlannableWorlds.ts`, `Sidebar.tsx`, the store
(`useSaveFile.ts`, `mappers.ts`) and the server's lot route, plus the sync rules
(`diff.ts`, `snapshot.ts`, `snapshotBuilders.ts`, `coherence.ts`,
`GameReimport.tsx`) — and by driving the page: hovering pins, opening the lot
editor on an occupied lot, an empty lot, an apartment unit and a fixed-type lot,
opening the apartment picker, and following a `?lot=` deep link.

## Why it exists

This is where a save stops being a list and becomes a place. Every world in The
Sims 4 is a fixed set of lots, and a player's plan for that world is really a
plan for each of them: what goes there, who lives there, and whether it's been
built yet. The world view puts the game's own map in front of you with your plan
drawn on top, so you can see at a glance which corner of a world you've
actually finished.

## What you see

**A header** — the world's icon, its name, the pack it came with, and how many
lots it has. Then three controls: a plum **Inspo** button, a green **Showcase**
button, and a quiet **Disable world**. The two colours follow the app's grammar
rather than reversing it — plum is your hand, and inspo is reference you
gathered; green is the save and what's built, and a showcase photo is the thing
that moves a lot to **Built**.

**A world that's switched off says so at the top of the page**, in the same
callout shape an unowned pack uses — *<world> is switched off for this save.* and
an **Enable world** button. The world's art greys out, its name dims, and a
**DISABLED** marker joins the line under it. **Disable world** disappears from
the header while it's off, so the only way back on is the one in the banner. If you arrived from a Household, Sim,
Club, Holiday, Small Business or Custom Venue, a small back-link to that page
sits above the title; there's no generic back-to-Home link.

**The map** — the world's own art from the game, with a pin on every lot. It
collapses behind a **Hide** / **Show** toggle.

Each pin is a white disc carrying the game's own venue icon for that lot type.
A dark badge on the corner shows how many households are on it (`9+` above
nine); venues never get one. Hovering shows the lot's name, its type, its size,
and an occupancy line — the household's name for a home, `N households` for a
rental, `N / M units occupied` for an apartment building. Pins are stacked by
height so a lot in the foreground paints over one behind it.

**Apartment units share one pin.** Every unit in a building is its own lot in the
planner, but they collapse to a single pin named after the building, and its
badge counts occupied units. San Myshuno's 30 lots become 18 pins this way.

**Then the neighbourhoods** — one section per neighbourhood, in the world's own
order, each with a plum heading and a count. A handful of lots belong to no
neighbourhood — Magnolia Promenade's Police Station and Willow Creek Hospital,
Mt. Komorebi's Peak — and they gather under **Other**. The game's own data labels
those lots with an internal placeholder, *Hidden Lot*, which is never shown: one
shared label covers every place it would otherwise surface — here, your Showcase,
the **public** showcase, inline on Clubs and Small Businesses, and as a
neighbourhood on Home. It's display-only, so the stored value stays the game's and
neighbourhood captions still resolve. Inside a section, a card per lot:

- A white strip at the top naming the plan status — **Unplanned**, **Planned**
  or **Built** — with a matching dot. The whole card is tinted to match, so a
  neighbourhood reads as a build-progress heatmap: plain white for untouched,
  plum for planned, green for built.
- The cover photo, if the lot has showcase photos.
- The lot's icon, its name, and its size. A small plum dot on the icon means a
  small business is on the lot.
- The lot type, then the business name, any clubs that hang out there, and a
  **Venue:** line when the lot is a Custom Venue.

## What you can do

**With the world**

- Jump to the world's **Inspo** board or its **Showcase**.
- **Disable world** — switch the whole world off for this save. A banner takes
  the top of the page, the world's art greys out, its name dims and a
  **DISABLED** marker joins the line under it; in the sidebar it greys out with
  an eye-slash and a *disabled in this save* tooltip. Reversible from the
  banner's **Enable world**. The world stays reachable; what it
  loses is its **lot and world content** everywhere else in the app — the lot
  pickers, coverage maths, the randomiser. **Sims are never filtered by it**: a
  disabled world's residents still count everywhere they did before. Reversible
  from the same button, now reading **Enable world**.
- Collapse the map.

**With a lot** — click its card or its pin. Everything saves as you go; there is
no Save button.

- Set **Status** to Unplanned, Planned or Built.
- **Rename** it. A purple ↺ appears once the name differs from **your save**,
  and puts the save's name back. A lot your *game* renamed reads as clean.
- Change its **lot type**, with the same ↺ against the same save value. The list
  only offers types from packs you own, plus whatever the lot is already set to.
- **Read off the lot's original name.** Once a lot no longer goes by the name it
  shipped with — whether you renamed it or your game did — that original appears
  beside the size as *Originally <name>*. It's the name the lot is listed under
  in the gallery, so it stays reachable rather than being overwritten.
- **Move in household** — search your households and pick one — or **Create
  household**, which opens the sim builder with this lot already chosen.
- **Move out** a household.
- Attach **inspo photos**: pick from your pool, pull one across from the world's
  own board, or upload new ones straight onto the lot. Remove one with the ✕.
- Attach **showcase photos**: upload with a caption and a gallery creator, then
  edit or delete either afterwards. The first one becomes the card's cover.
- Write a **Description** (public — it shows on a shared showcase) and **Notes**
  (private). Both are collapsed until they have text.
- **Reset lot** — a *factory* reset, not a revert. The name and type go back to
  what the lot shipped with in the game — **not** to your save — status, notes
  and description are cleared, and everyone living there moves out and is left
  without a lot. It does not put your save's household back, and it doesn't
  touch photos, the business or the club. The confirm spells all of that out
  and names the lot.

**Status looks after itself.** Anything you do to a lot — renaming it, retyping
it, writing a note or a description, moving a household in, assigning inspo —
moves it from Unplanned to Planned. A showcase photo moves it to Built. It only
ever moves up: a status you set by hand isn't downgraded by a lesser action
later.

**On this lot** — a business, a club hangout and a custom venue are shown here
with an arrow that opens the relevant manager in a new tab. Read-only on this
screen. The business row appears on lot types that could host one, or whenever
one is already attached; the club row likewise. The **Custom venue** cell appears
only while the lot's type is **Custom Venue**, because a lot of any other type
can't run a schedule — pick that type from the list and the cell turns up
immediately. Businesses come with Businesses & Hobbies, club hangouts with Get
Together and venues with Adventure Awaits, so without those packs the row isn't
offered — and when none applies, the whole section goes. Anything already
attached still shows either way.

## What you can't

- **Add or delete a lot.** Every save starts with all 402 lots from all 30
  worlds already seeded, and a sync never adds or removes one. There is no
  concept of an empty plot you create.
- **Change a lot's size, or which neighbourhood it's in.** Both come from a
  built-in table, not from your save.
- **Retype an apartment unit** — it reads *type can't change* — or any of the
  game's special lots: Police Station, Hospital, High School, Auditorium, the
  Komorebi summit, the secret labs and ruins. They read *fixed type*.
- **Put two households on a lot**, except a Residential Rental, which holds six.
  Households already on a lot are hidden from the search, and a move that would
  overfill a lot is refused outright with *"<lot> is full"* — including from
  other screens. A sync is the one exception: your save is reality, so it moves
  a household in regardless and any household you'd parked there steps aside.
- **Put a household on a venue at all.** Occupancy only appears on home types.
- **Edit the business or the club here.** They're shown, and they link out.
- **See every lot the game has.** Eight lots across seven worlds are hidden on
  purpose — Sylvan Glade, the Forgotten Grotto, the Magic Realm, Sixam, the
  hermit's hut, the acting studio, FutureSim Labs and the Netherworld — because
  there's nothing to plan on them. The game's *editable* specials do show, and
  do count: the Police Station, the Hospital, the High School, the Komorebi
  summit and the rest. The count beside the world in the sidebar is this same
  set, so it always matches the page.
- **Have the status reflect what's in your save.** Status is your build
  progress, not the game's. A lot the game already has a household living on
  still reads **Unplanned** until you do something to it — occupancy is shown on
  the lot card itself, and a status is never set on your behalf, because a status
  the app chose is one it would then have to argue with you about on every sync.
- **Move a pin.** Positions are fixed; all 30 worlds are fully pinned.
- **Undo moving the save's household out, from here.** That revert lives on the
  Households page, behind **Edit**, as the ↺ beside the lot. Moving a household
  out is a local, symmetric act; reverting *a lot* is not — putting a household
  back pulls them off wherever they are now, which leaves that lot diverging from
  the save and invites a revert there, and so on, with no natural stopping point.
  The revert belongs to the household, which lives in exactly one place.

Not desktop-only. The page, the map, the cards and the lot editor all work on a
phone.

## How it relates to sync

**Two lot fields mirror your save**, and they are the only two the sync ever
looks at: the lot's **name** and its **type**.

They reconcile field by field, against what the save last reported for that lot:

- If you changed it and the save didn't, **your edit stays**.
- Otherwise the save wins.
- Because it's per-field, a lot you renamed whose type the game changed keeps
  your name and takes the new type.

**Everything else on this screen is yours and is never overwritten**: status,
notes, the description, inspo photos and showcase photos.

**Three things on a lot are decided elsewhere.** Who lives there follows the
household sync, which club hangs out there follows the club sync, and which
business is on it is reconciled per business. The lot is where you see them, not
where the sync resolves them.

**Size, neighbourhood, the map art and the pins never sync at all.** They're
built into the app, not read from your save. Size, the map art and the pins are
looked up live, so they're identical in every save. The neighbourhood is the one
that's copied in when the save is created, so correcting one in the built-in
table reaches new saves at once and existing saves when the catch-up pass runs.

**Three ways the plan yields to reality**, applied silently on sync:

- A lot you typed **Small Business Venue** that a real household has since moved
  onto takes the game's reported type instead — a venue can't have residents.
- A **club** loses its hangout when the save reports that lot as a Rental,
  Vacation Rental or University Housing.
- A **business** is dropped from a lot that a household other than its owner now
  occupies, or from a lot the game rezoned to something a business can't sit on.

**You are never asked to choose.** No review list, no per-lot approval. The sync
screen reports a lot count and applies the lot.

## Needs confirming

- **Where exactly a disabled world disappears to.** What the gate does is stated
  accurately above, from its own source, but the per-screen consequences — Home,
  Diversity, the public showcase — belong to those surfaces and were not driven
  for this file. Each should confirm its own behaviour when it's written.
