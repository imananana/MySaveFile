# Small Businesses

**Route** `/saves/:saveFileId/small-businesses` ·
**Tier** 2 ·
**Requires** **Businesses & Hobbies (EP18)** for small businesses to mean
anything in your game. The gate is soft: without the pack the page still opens
and works in full, with a banner reading *Businesses & Hobbies isn't marked as
owned. You can plan here, but you'd need the pack to actually use Small
Businesses in-game.* Businesses from a save need a save; one you write yourself
needs nothing ·
**Desktop only** — below the breakpoint, on a touch device, the page is replaced
by *The small business tool works best on desktop* ·
**Polish** shippable and photographable ·
**Verified** 2026-08-14 by reading every file for this surface end to end —
`pages/SmallBusinesses.tsx`, the shared parts it draws with
(`RequirementEditor.tsx`, `IconPicker.tsx`, `PackNotOwnedBanner.tsx`,
`DesktopOnly.tsx`), its catalogs (`worlds.ts`, `venueLabels.ts`,
`stockBusinessPerks.ts`, `criteriaCatalogs.ts`, `smallBusinessIcons.ts`), the
store and API (`useSaveFile.ts`, `api.ts`, `types/index.ts`,
`server/src/routes/smallBusinesses.ts`), and all three sync paths whole
(`GameImport.tsx`, `GameReimport.tsx`, `diff.ts`, `snapshot.ts`,
`snapshotBuilders.ts`, `silentRefresh.ts`, `coherence.ts`). And by driving the
page: a business from a save opened, one of your own opened, the owner picker,
the employee picker, the location picker, the requirement builder, and a
business deleted (then restored). And by driving a full re-sync with a business
staged to hold a location the save doesn't have: the location was dropped and the
record of the save's locations refreshed, in one write. Figures below are read
off the running page:
**11 businesses** — 4 from the save, 7 written in the planner — **2 employees**,
**6 locations**, top renown ★★★ *Koffieboon*.

## Why it exists

A small business in Businesses & Hobbies is a bundle of decisions — who owns it,
who works there, what customers can do, who's allowed in, what it charges — that
the game only shows you while you're standing in the business, one at a time.
Renown and alignment aren't shown as numbers anywhere.

This page lays every business in your save side by side with the ones you intend
to open, so the whole trading side of a save is one screen: who runs what, out of
which lot, for whom.

## What you see

**The rail**, on the left: a **Small Businesses** title, a green **+ NEW
BUSINESS** button, a **Search businesses...** box with a clear ✕, and then every
business alphabetically as an icon and a name. The selected one takes a soft
green tint and a green bar down its left edge; up and down arrows move the
selection. A business you wrote carries a plum **PLANNER** pill. A search with
no hits gives **No matches** and a **Clear search** link.

**Small Businesses at a glance**, when nothing is selected. A wide lead tile
carrying the total with a two-colour bar — **N from save** in green, **N
planned** in plum — over three tiles: **Employees** (*sims employed*), **Lots**
(*across your businesses*), and **Top renown**, shown as stars and naming the
business that holds it.

A plan with no businesses at all shows a single card instead: **No small
businesses yet** · *Track shops your sims run from home or from a Small Business
Venue lot — bakeries, salons, retail. Set an owner, employees, offerings, and
pricing.*

**A business.** The header is the icon at full size, the eyebrow **SMALL
BUSINESS**, the name, and one line under it — a pin with the location count and
a figure with the employee count — then **Remove** pushed to the right. If the
save carries a description it sits below in its own card, **DESCRIPTION · from
save**.

On a business from your save, two stat cards follow: **Renown** as five stars
with its rank name (*Neighborhood Gem*, *Rank 3 / 5*) and **Alignment** as a
shield with its name (*Neutral*, *Level 4 / 7*).

Then one white card, divided into sections by hairlines:

| Section | What's in it |
|---|---|
| **Owner & Employees** | one row per person, name on the left, an **OWNER** or **EMPLOYEE** pill on the right. Owner first |
| **Customer Requirements** | one chip per requirement — the type in small caps, each accepted value with its real in-game icon, and a **required** / **optional** toggle |
| **Business Activities** | what customers can do here, as icon'd chips |
| **Fees & Pricing** | **Entrance fee** (No fee / Hourly / One-time) and **Price modifier** (−50% … +100%) |
| **Locations** | one card per lot — name, world, current lot type — the name opening that lot in its world |

**NOTES · private** closes the page. A section with nothing in it is simply
absent on a business from your save, and present-but-empty on one of your own.

**Where a business shows up elsewhere.** On the lot it occupies, in the world
view and the lot editor. Nothing else in the app mentions businesses: not Home,
not the sim roster, not the showcase.

## What you can do

### The list

- **Search** by name, and **create** a business — **+ NEW BUSINESS** makes one
  called *New business* and opens it straight away.
- **Move between businesses with the arrow keys.**

### Any business, yours or the save's

- **Write notes.** Private, planner-only, saved when you click away.
- **Remove it** — *Delete "<name>"?* with a red Delete. Removing one that came
  from your save doesn't touch the save; it takes the business out of the plan.
- **Open the owner or an employee**, which jumps to that sim on the roster with
  their panel already open.
- **Open a location**, which jumps to its world with the lot editor open.

### A business you wrote

Everything about it is yours to set:

- **Name and icon.** Click the name to type; click the tile to pick from the
  30-icon library, or **Add icon** if it hasn't got one.
- **Owner**: **Set owner** opens every sim on the roster grouped by household,
  searchable. Child and older only — no toddlers, infants, newborns or pets.
  **Change** swaps them; ✕ clears the business back to having no owner.
- **Employees**: **+ Add employee** once an owner is set, from the same grouped
  picker. Teen and older only.
- **Customer requirements**: **+ Add requirement** → pick a category → pick
  values. Nine categories — Supervised customer, Age, Skill, Trait, Career,
  Occult, Marital status, Financial status, Celebrity level. Skill, Trait and
  Career open a searchable catalog (65 skills, 82 traits, 60 careers, filtered to
  the packs you own); the rest offer fixed lists. One requirement per category,
  holding as many values as you like — they mean *any of* — and choosing a
  category you already use re-opens it with your picks ticked rather than
  refusing. Each requirement can be **required** or **optional**, and a
  Supervised customer requirement can also say **caregiver stays**.
- **Business activities**: **+ Add activity** opens the catalog — 231
  activities, filter pills for the nine in-game groups, a search box, and a
  running **N / 5**. **Done** replaces the set wholesale.
- **Fees & pricing**: No fee, Hourly or One-time, and a price modifier of −50%,
  −25%, +0%, +50% or +100%. Choosing **No fee** zeroes the modifier and locks it,
  which is what the game does.
- **Locations**: **+ Add location** once an owner is set. There are two ways a
  business gets a lot, and the picker offers both:
  - **The owner's own home**, at the top when they have one. Any home they own —
    a house, a tiny home, an apartment, a penthouse, a haunted house — and the
    lot keeps the type it already has. Not a For Rent unit: there they're a
    tenant, not the owner.
  - **Any empty lot**, grouped by world and showing its current type. Picking one
    converts it to a **Small Business Venue**, which is what buying a lot for a
    business does in-game.

  If the owner has no home yet and you pick an empty home lot, the page asks
  which you meant: **Home business** or **Standalone business** — and warns you,
  by name, that the first one moves that household in: *Assigning the business to
  this lot will move the Acosta household in.* Taking a business off a lot gives the
  lot its old type back, whether you remove the location or delete the whole
  business.

## What you can't

- **Change anything the save gave you.** On a business from your save the name,
  icon, description, owner, employees, requirements, activities, fees, pricing
  and locations are all read-only. Notes are the exception.
- **Push any of it back to the game.** A business you write here is a plan, not a
  save edit — you still have to open it in-game.
- **Go past five requirements or five activities.**
- **Give one sim two business roles.** A sim who already owns or works at any
  business is not offered by either picker.
- **Place a business before it has an owner.** **Add location** stays disabled
  until one is set.
- **Run one out of a For Rent unit.** Every other home counts, but a tenant
  doesn't own the lot.
- **Buy a lot that isn't for sale**: an apartment, university housing, an
  occupied lot that isn't the owner's own home, or any of the game's special lots
  (hospital, police station, high school, the secret lots). An apartment is the
  one worth knowing — you can run a business from the apartment you *live in*,
  but you can never buy one and turn it into a venue.
- **Set renown, alignment or perk points.** They're earned in-game, read-only
  here, and shown only on a business from your save.
- **See a business's takings, its perks, or its opening hours.** None of that is
  surfaced.
- **Open the page on a phone.**

## How it relates to sync

Every business is one of two things, and the page never mixes them: **a business
read out of your save**, or **a business you wrote**.

**What the save owns.** For a business that came from your save, four things are
compared against it on every sync — **name, icon, description and owner**. Eight
more are **applied whole rather than compared field by field**: the employees,
the customer requirements, the activities, the fee mode, the price modifier, the
renown, the alignment and the perk points. Either way the business counts as
changed on the sync screen, and it counts **once**.

**Its locations are reconciled, not adopted.** The lot set is the one part of a
business that isn't simply taken from the save. Against the lots the save
reported at the *previous* sync:

| What happened | What the plan does |
|---|---|
| The game put the business on a new lot | Adopted |
| The game took it off a lot it used to have | Dropped |
| You added a lot the game never had | Kept |

So a location you planned survives every sync, and only the game actually moving
the business overrides you. The reconciled locations and the record of what the
save reported are written in one go, so a sync that fails partway leaves the
locations for the next sync to sort out rather than stranding them — which
matters here more than anywhere, because a business from your save has no
location controls on the page for you to put right by hand.

**What you own.** Notes. They are never read, never compared and never
overwritten.

**What a re-sync does.**

| What happened in game | What the plan does |
|---|---|
| You opened a new business | It arrives, with its owner, staff and lots |
| You renamed it, changed its icon or description | Adopted |
| You hired or fired someone | Adopted |
| You changed requirements, activities, fees or pricing | Adopted whole |
| It gained renown, or its alignment shifted | Adopted |
| You closed the business | It leaves the plan |

**Where a plan gives way to reality.** Two things can make a planned location
impossible, and both yield on sync — for businesses you wrote as well as ones
from your save:

- **A household moved onto the lot** and the owner isn't one of them. The
  business lets that lot go; a lot the planner had typed as a Small Business
  Venue takes back the type the save reports, because a venue can't have
  residents. That correction is independent of any business, so a lot left
  stranded as a venue after its business already moved off is fixed too.
- **The lot was rezoned** to something a business can't occupy — anything that
  is neither a home somebody owns (house, tiny home, apartment, penthouse,
  haunted house) nor a Small Business Venue. The business lets the lot go even if
  nobody lives there.

**A business you wrote is otherwise invisible to sync.** It is never updated,
never renamed and never removed, no matter what the save says.

On the sync screen businesses are a single count — *N small businesses* —
meaning how many moved, new, changed and closed together. Nothing is optional;
every sync applies in full.

**On a first import** every business in the save comes in, and the review names
them (*4 small businesses*). An owner or employee the import couldn't place is
dropped without comment, so a business can arrive with fewer staff than the game
shows.

**Elsewhere in the save's life**: a `.s4plan` export carries businesses whole and
a restore rebuilds them with their people re-pointed at the restored sims;
duplicating a save copies them; **Reset planner data** deletes them.

## Limitations

- **The list marks what you wrote, not what came from the save.** A business you
  created carries a plum **PLANNER** pill; one from your save carries nothing. On
  the business itself the only signal is what's missing — no edit affordances.
- **The icon library holds 30 business icons.** A business whose icon isn't one
  of them falls back to a question mark, and one with no icon at all shows a blank
  space in the list.
- **A person is a name and nothing else** — no portrait, no lifestage, no
  household, and an employee you delete from the plan leaves a *deleted sim* row
  until you take them off the business.
- **Renown and alignment are the owner's, not the business's.** The game stores
  both as hidden traits on the owning sim, which is also why one sim can only
  hold one business.
- **Perk points are stored but never shown.**
- **A requirement the catalog doesn't recognise shows its raw number** under the
  label *Filter*, rather than a guess.
- **Businesses are private.** They appear on no public page and on no showcase.
- **A lot only comes back if the planner was what converted it.** Taking a
  business off a lot restores the type the *save* last reported for it. A lot the
  game itself calls a Small Business Venue stays one, correctly — there's nothing
  to undo.
