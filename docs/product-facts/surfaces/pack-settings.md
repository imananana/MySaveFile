# Pack ownership

**Route** `/saves/:saveFileId/settings/packs` · reached from **Settings →
Advanced → Pack ownership**, from the **Open Pack Settings** link on a gated
page's banner, and from the padlock on a locked world tile on Home. **Not in the
sidebar** ·
**Tier** 2 ·
**Requires** no pack. This is the page that decides what every other pack
requirement resolves to ·
**Not desktop-gated** — it opens on a phone ·
**Polish** works and is honest about its state; a plain 49-row settings list,
not a page to photograph ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`PackSettings.tsx`, the ownership store (`usePackOwnership.ts`), its API
(`api.ts`, `server/src/routes/auth.ts`, `schema.sql`), the detector
(`detectPacks.ts`), the pack catalog and lookups (`packs.ts`,
`packAssignments.ts`, `lotTypePacks.ts`), everything that reads ownership
(`Sidebar.tsx`, `Dashboard.tsx`, `usePlannableWorlds.ts`,
`PackNotOwnedBanner.tsx`), and **both sync paths whole** (`GameImport.tsx`,
`GameReimport.tsx`) — and by driving it on two accounts: one with a full
library, and one detected as base-game-only. Driven there: a pack forced on and
back to Auto (checked against the server and across a reload), both reset
actions, search, a **cancelled** sync and an **applied** one. Pack figures are
counted from the data by `scripts/diagnostics/packDetectability.ts`.

## Why it exists

The planner opens showing the whole Sims 4 library, because a new arrival should
never have to tell a website what they bought. Once you sync a save, it narrows
to the packs that save shows evidence of, so you stop being offered traits,
worlds and features you can't actually use. That inference is good, not perfect
— it can only see what a save happens to contain. This page is where you correct
it, and the only place ownership is visible at all.

## What you see

**A plum "How this works" box**, four lines, at the top: *Every pack is on until
you sync a save.* · *Syncing switches on the packs it can see evidence of in your
save. It only ever adds — and it covers all your saves, not just this one.* · *A
pack that's off is never in your way. Its pages still open; its content just
stays out of the pickers.* · *Own something we missed? Set it On yourself — that
beats everything else.*

**A one-line summary** under it: **N / 49 packs on**, then **N set on** in green
and **N set off** in red when either exists, then either *No save imported yet —
all packs on by default* or *Auto-detected from imported saves* with the date and
time detection last ran.

**A search box**, and a **Back to Auto** button when you have manual switches
set. **Start over** sits at the foot of the page.

**Four collapsible groups**, all open on arrival — **Base Game** (1) ·
**Expansion Packs** (21) · **Game Packs** (12) · **Stuff Packs & Kits** (15).

**A row per pack**: its name, its pack code in small grey type (`EP05`, `SP17`),
sometimes a badge, and a three-segment **Auto · On · Off** switch. The name is
black when the pack counts as owned and grey when it doesn't. The badge is green
**auto-detected** when a save produced evidence for it, grey **not found in
imported saves** when no save has, and absent on a pack you've set by hand.

**The switch shows what it's doing.** **On** is solid green, **Off** solid red,
and **Auto** — which is where nearly every row sits — takes soft green when it's
currently resolving to on and plain grey when it isn't. So a page of grey reads
as a locked library at a glance.

**The Base Game row has no switch** — it reads *always owned*.

## What you can do

### One pack at a time

- **Leave it on Auto**, which is the default and means *do whatever the saves
  say*: on if a synced save showed evidence of it, on if you've never synced
  anything, off otherwise.
- **Set it On.** The pack counts as owned whatever the saves say. Its worlds
  leave the sidebar's **Locked** section, its Manage entry stops being dimmed,
  and its content returns to every picker — immediately, without a reload.
- **Set it Off.** The pack counts as unowned even if a save proved you have it.
- Every flip saves itself to your account. There is no save button and no
  confirmation.

### Everything at once

- **Back to Auto** drops every manual switch and keeps what your saves detected.
  It only appears when you have switches to drop.
- **Start over**, at the foot of the page, turns every pack on and forgets what
  your saves have shown. Detection begins again from your next sync. Both ask
  first.

### Finding a pack

- **Search** matches a pack's name or its code, hides groups with no match, and
  opens any group holding one.

## What you can't

- **Set ownership per save.** This is one setting for your whole account, so a
  pack you switch off changes every save you have.
- **Turn the base game off.**
- **Re-run detection on demand.** There is no re-detect button; the only thing
  that ever writes the detected set is syncing a save.
- **Narrow the detected set.** Detection only ever adds. The only way to remove
  anything from it is **Start over**, which removes all of it at once.
- **See where a pack came from.** A row says a save proved it, never which save.
- **Reach this page without a save**, because its address lives inside one. An
  account with no saves has no route to it.
- **Find every Sims 4 pack here.** The list is the 49 packs that gate something
  in the planner; kits that only add objects, hair and clothing aren't tracked,
  so searching for one finds nothing.
- **Be blocked by any of this.** Locking is soft everywhere: a gated page still
  opens and works fully, a locked world still opens, and anything already in your
  plan from an unowned pack keeps showing. Ownership gates what you can *add*.

## How it relates to sync

**Bringing a save in is the only thing that writes this page, and it writes it
at the end** — when you press Sync, or when a first import actually runs. Not
when you pick the file. Cancel at either review screen and your pack list is
exactly as it was. This holds for both flows, first import included.

**Detection only ever adds, but the first one still narrows the app.** Every
sync unions what it finds into what you already have, so no sync can take a pack
away. That is about the *list*. The *effect* is different the first time: with
nothing detected the planner shows the whole library, so the first save you bring
in is what switches it to showing only the packs that save proves. After that,
each sync can only widen it. What it reads, per save:

| Evidence | Proves |
|---|---|
| a sim's traits, aspiration or current career | the pack that added it |
| a sim's occult state, or a cat, dog or horse | Vampires, Werewolves, Cats & Dogs… |
| the world a lot sits in | the pack that shipped that world |
| the type a lot is set to | the pack that added that lot type, when only one did |
| a club, a holiday, a small business existing | Get Together · Seasons · Businesses & Hobbies |

**The world and the lot type are not equally good evidence.** A pack that ships
a world is proved the moment you sync, because its world and its lot types are
simply there. A pack with no world of its own is only proved if you happen to
have used it — a spa exists because somebody built a spa. That is why a
small-library player can still see packs they own switched off, and why the
manual **On** switch exists.

**It is account-wide, so syncing one save changes every save.** Importing a save
someone else built adds their packs to your set, on all your plans, until you
switch them off by hand.

**Nothing flows the other way.** The sync never consults pack ownership: what a
re-sync adds, updates, removes or yields is decided without reference to it. A
world you've locked still syncs its lots; a club still arrives with Get Together
switched off. Ownership decides what you are *offered*, never what your plan
*contains*.

## Limitations

- **Detection is a floor, not a census.** It fires only on evidence a save
  happens to carry, so a pack you own but haven't used in the save you synced
  stays off until you switch it on yourself. This is the page's whole reason for
  existing, and it is not a bug that can be closed — only narrowed.
- **The weakest cases are the packs with no world.** Tiny Living is the extreme:
  its *only* evidence is a lot set to **Tiny Home Residential**, and across all
  71 saves in the development database not one exists. Spa Day and Dine Out are
  the same shape — a spa or a restaurant lot proves them, and most saves have
  neither. For these, the manual switch is the realistic answer.
- **Nothing reads the objects placed in your save**, which is where the densest
  evidence lives: a player who owns a pack almost certainly has some of its
  furniture down somewhere, even if they never built the lot type or took the
  career. The planner only ever looks at sims, lots, and whole features.
- **Skills prove nothing**, deliberately — a skill's tuning often ships in the
  base game even when the object that teaches it comes with a pack.
- **Dynasties and custom venues don't prove their pack** the way clubs, holidays
  and small businesses do.
- **A lot type two packs both add proves neither.** *Rental* comes from Outdoor
  Retreat and Jungle Adventure, so a rental lot is set aside rather than credited
  to a pack you may not own.
- **A pack you've set by hand carries no badge**, so a row you forced on and a
  row nobody has touched look alike apart from the switch itself.
- **The date is a raw machine timestamp** — *8/13/2026, 1:42:48 PM* — where
  everywhere else in the app says *6 hours ago*.
- **There's no way back.** The page has no link to Settings and no sidebar entry
  of its own; leaving it means the browser's back button.
