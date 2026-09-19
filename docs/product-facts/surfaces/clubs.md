# Clubs

**Route** `/saves/:saveFileId/clubs` ·
**Tier** 2 ·
**Requires** **Get Together (EP02)** for clubs to mean anything in your game. The
gate is soft: without the pack the page still opens and works in full, with a
banner reading *Get Together isn't marked as owned. You can plan here, but you'd
need the pack to actually use Clubs in-game.* Clubs from a save need a save; a
club you write yourself needs nothing ·
**Desktop only** — below the breakpoint, on a touch device, the page is replaced
by *The clubs tool works best on desktop* ·
**Polish** shippable and photographable ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`ClubManager.tsx`, the shared editor parts it draws with (`RequirementEditor.tsx`,
`EntityText.tsx`, `IconPicker.tsx`, `MasterDetail.tsx`, `OverviewTiles.tsx`,
`DesktopOnly.tsx`, `PackNotOwnedBanner.tsx`), its catalogs (`clubIcons.ts`,
`stockClubs.ts`, `stockClubActivities.ts`, `clubHangoutVenues.ts`,
`criteriaCatalogs.ts`, `venueLabels.ts`, `venueTypeIcons.ts`, `worlds.ts`), the
store and API (`useSaveFile.ts`, `mappers.ts`, `api.ts`, `types/index.ts`,
`server/src/routes/clubs.ts`, `schema.sql`, `saveFiles.ts`), the parser
(`lib/parser/clubs.ts`), and all three sync paths whole (`GameImport.tsx`,
`GameReimport.tsx`, `diff.ts`, `snapshot.ts`, `snapshotBuilders.ts`,
`coherence.ts`) — plus the two other screens a club appears on
(`LotEditModal.tsx`, `SimPanel.tsx`). And by driving the page: an imported club
opened, a club of your own opened, the member picker, the requirement builder,
the activity picker, the hangout lot picker, the venue-type dropdown, a general
venue set and cleared again, the delete confirmation opened and cancelled, and
both outbound links followed to the sim they name and the lot they name. Figures
below are read off the running page: **22 clubs** — 11 from the save, 11 written
in the planner — **38 memberships**, largest club **4 people**.

## Why it exists

A club in Get Together is a standing arrangement: who's in it, who runs it, what
its members are encouraged and discouraged from doing, who's allowed to join, and
where they meet. All of that lives in one in-game panel you can only reach one
club at a time, and none of it is written down anywhere you can read while
you're planning.

This page lays every club in your save out side by side, and lets you write down
the clubs you intend to found before you found them — the requirements, the
activities, the hangout — so the plan carries the same detail the game does.

## What you see

**The rail**, on the left: a **Clubs** title, a green **+ NEW CLUB** button, and a
**Search clubs...** box with a clear ✕. Under it every club, alphabetically, as
an icon and a name; the selected one takes a soft green tint and a green bar down
its left edge. Up and down arrows move the selection. A search with no hits
gives **No matches** and a **Clear search** link.

**Clubs at a glance**, when nothing is selected. A wide lead tile carrying the
total with a two-colour bar — **N from save** in green, **N planned** in plum —
over three tiles: **Hangouts** (*of N clubs*), **Members** (*sims in a club*), and
**Largest**, which names the club as well as counting it.

A plan with no clubs at all shows a single card instead: **No clubs yet** ·
*Create a club to track its name, icon, members, and hangout lot. Import a .save
to auto-populate from Get Together stock clubs.*

**A club.** The header is the club's icon at full size, the eyebrow **CLUB**, the
name, and one line under it: an envelope icon with **Open Invitation** or **Invite
Only**, then the member count, then **Remove** pushed to the right. If the save
carries a description it sits below in its own card, **DESCRIPTION · from save**.

Then one white card, divided into sections by hairlines:

| Section | What's in it |
|---|---|
| **Membership** | Open Invitation / Invite Only, as a two-button switch. Only on a club you wrote |
| **Members** | a count against the game's limit (**· 4 / 8**, red once you pass it), then one row per sim, name on the left, a **LEADER** or **MEMBER** pill on the right |
| **Requirements** | one chip per requirement — the type in small caps, then each accepted value with its real in-game icon |
| **Activities** | **👍 Encouraged** in green and **👎 Discouraged** in plum, each a row of icon'd chips. A chip whose rule is aimed at someone in particular says so underneath — *to Teen, Young Adult*, *to Renegades* |
| **Hangout** | the lot (name, world · neighbourhood) or the venue type (*Any Karaoke Bar*) |

A section with nothing in it is simply absent on a club from your save, and
present-but-empty on one of your own. **NOTES · private** closes the page.

**Where a club shows up elsewhere.** A lot that is somebody's hangout says so in
the lot editor, under **On this lot** — a **Club hangout** cell naming every club
that meets there, with an arrow that opens this page in a new tab — and the lot's
tile in the world view carries a **Clubs:** line. In Households, a sim's panel has
a **MEMBERSHIPS** card listing their clubs as chips. Nothing else in the app
mentions clubs: not Home, not the sim roster, not the showcase.

## What you can do

### The list

- **Search** by name, and **create** a club — **+ NEW CLUB** makes one called *New
  club* and opens it straight away.
- **Move between clubs with the arrow keys.**

### Any club, yours or the save's

- **Write notes.** Private, planner-only, saved when you click away.
- **Remove it** — *Delete "<name>"?* with a red Delete. Removing a club from your
  save doesn't touch the save; it takes the club out of the plan.
- **Open a member**, which jumps to that sim on the sim roster with their panel
  already open.
- **Open the hangout lot**, which jumps to its world with the lot editor open.

### A club you wrote

Everything about it is yours to set:

- **Name and icon.** Click the name to type; click the tile to pick from the
  club-icon library, or **Add icon** if it hasn't got one.
- **Membership**: Open Invitation or Invite Only.
- **Members**: **+ Add member** opens every sim on the roster grouped by
  household, searchable, tick as many as you like. Tap a member's pill to
  **Make leader**; tap it again to stand them down. ✕ removes them.
- **Requirements**: **+ Add requirement** → pick a category → pick values.
  Age, Occult, Marital status, Financial status and Celebrity level offer fixed
  lists; Skill, Trait and Career open a searchable catalog. One requirement per
  category, holding as many values as you like — they mean *any of* — and
  choosing a category you already use re-opens it with your picks ticked rather
  than refusing. Each value has its own ✕; clicking the type label edits the
  whole set.
- **Activities**: **+ Add** under Encouraged or Discouraged opens the activity
  catalog — 231 activities, filter pills for the nine in-game groups (Social,
  Food & Drink, Art & Music, Fun & Games, Hobbies, Outdoor, Home, Kids, Mischief
  & Mayhem), a search box, and a running **N / 5**. What's in the other bucket is
  greyed out. **Done** replaces that bucket wholesale.
- **Hangout**, one of three modes: **None**, **General Venue** — a dropdown of
  32 icon'd venue types, shown as *Any Café*, *Any Gym* — or **Specific Lot**,
  which opens a lot picker with **Club member homes** at the top (only homes a
  member actually lives in) and then every eligible venue, grouped by world.
  Picking one mode clears the other.

## What you can't

- **Change anything the save gave you.** On a club from your save the name, icon,
  description, members, leader, requirements, activities, invite setting and
  hangout are all read-only. Notes are the exception.
- **Push any of it back to the game.** A club you write here is a plan, not a
  save edit — you still have to make it in-game.
- **Go past the caps**: five requirements, five encouraged activities, five
  discouraged.
- **Put one activity in both buckets.**
- **Add anyone under Child, or any pet.**
- **Set both a venue type and a lot** — the hangout is one or the other.
- **Meet on a Rental, a Vacation Rental or University Housing**, or on a home
  that isn't a member's — those lots aren't in the picker.
- **See a club's perks, its funds, or a gathering schedule.** None of that is
  surfaced.
- **Open the page on a phone.**

## How it relates to sync

Every club is one of two things, and the page never mixes them: **a club read out
of your save**, or **a club you wrote**.

**What the save owns.** For a club that came from your save, five things are
compared against it on every sync — **name, icon, description, members and the
hangout lot** — and where the game has moved on, the game wins. Five more are
**applied whole rather than compared field by field**: the leader, the
requirements, the activities, the invite setting, and a general-venue hangout.
Either way the club counts as changed on the sync screen, and it counts **once** —
a club that was renamed, gained a member and had its rules rewritten is one club.

**What you own.** Notes. They are never read, never compared and never
overwritten.

**What a re-sync does.**

| What happened in game | What the plan does |
|---|---|
| You founded a club | It arrives, with whichever members are in the plan |
| You renamed it, changed its icon or its description | Adopted |
| Sims joined or left | Adopted |
| You moved the hangout to another lot | Adopted |
| You switched the hangout to a venue type, or off | The lot is let go |
| You changed requirements, activities, the leader or who can join | Adopted whole |
| You disbanded the club | It leaves the plan |
| A member is no longer in the save | They drop off the club |
| The hangout lot became a Rental, Vacation Rental or University Housing | The club lets the lot go — a club can't meet there |

**A club you wrote is invisible to sync.** It is never updated, never renamed and
never removed, no matter what the save says — with exactly one exception: if the
lot you gave it turns into a Rental, Vacation Rental or University Housing
in-game, it yields that lot like any other club would. An impossible plan gives
way; everything else stands.

On the sync screen clubs are a single count — *N clubs* — meaning how many clubs
moved, new, changed and disbanded together. Nothing is optional; every sync
applies in full.

**On a first import** every club in the save comes in, and the review names them
(*11 clubs*). A member the import couldn't place is dropped without comment, so a
club can arrive with fewer members than the game shows.

**Elsewhere in the save's life**: a `.s4plan` export carries clubs whole and a
restore rebuilds them with their members re-pointed at the restored sims;
duplicating a save copies them; **Reset planner data** deletes them.

## Limitations

- **The list marks what you wrote, not what came from the save.** A club you
  created carries a plum **PLANNER** pill; a club from your save carries nothing,
  because most of them are. On the club itself the only signal is what's missing
  — no edit affordances.
- **Stock club names come from a list of eleven.** The Sims doesn't store the
  name of a club it shipped, so the planner keeps its own list. A stock club
  that isn't on it reads **Stock Club**.
- **The icon library holds 26 club icons.** A club whose icon isn't one of them
  falls back to a question mark. *Renegades* is a known miss — its real icon
  can't be extracted, so it wears a placeholder.
- **47 of the game's 278 club activities can't be picked** — they have no art in
  the tuning, so they're kept out of the catalog. An imported club that uses one
  still names it, without an icon.
- **A requirement the catalog doesn't recognise shows its raw number** under the
  label *Filter*, rather than a guess. A gender requirement arrives from the save
  as a trait, because that's how the game stores it.
- **Membership isn't capped, only counted.** The game allows eight and a common
  mod lifts that; the planner states the count against eight and turns it red
  past it, but never stops you.
- **A member is a name and nothing else** — no portrait, no lifestage, no
  household.
- **A member you delete from the plan leaves a *deleted sim* row** on the club
  until you take them out of it.
- **An activity's target is shown, never set.** A rule from your save says who
  it's aimed at — *to Teen, Young Adult*, *to Renegades* — but there's no way to
  aim one yourself, so an activity you add applies to anyone. An aim the planner
  doesn't recognise shows nothing at all rather than a guess.
- **An activity aimed at several ages lists them** — *to Teen, Young Adult* —
  rather than collapsing a run into *Teen–Young Adult*, because the game stores
  each age as its own entry.
- **Clubs are private.** They appear on no public page and on no showcase.
