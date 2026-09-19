# Dynasties

**Route** `/saves/:saveFileId/dynasties` ·
**Tier** 2 ·
**Requires** **Royalty & Legacy (EP21)** for dynasties to mean anything in your
game. The gate is soft: without the pack the page still opens and works in full,
with a banner reading *Royalty & Legacy isn't marked as owned. You can plan here,
but you'd need the pack to actually use Dynasties in-game.* Dynasties from a save
need a save; one you write yourself needs nothing ·
**Desktop only** — below the breakpoint, on a touch device, the page is replaced
by *The dynasties tool works best on desktop* ·
**Polish** shippable and photographable ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`DynastyManager.tsx`, the parts it draws with (`DynastyCrest.tsx`, `SimCard.tsx`
for the avatars, `EntityText.tsx`, `MasterDetail.tsx`, `OverviewTiles.tsx`,
`PlannerPill.tsx`, `DesktopOnly.tsx`, `PackNotOwnedBanner.tsx`), its catalogs
(`stockDynasties.ts`, `dynastyProgression.ts`), the store and API
(`useSaveFile.ts`, `mappers.ts`, `api.ts`, `types/index.ts`,
`server/src/routes/dynasties.ts`, `saveFiles.ts`), and all three sync paths whole
(`GameImport.tsx`, `GameReimport.tsx`, `diff.ts`, `snapshot.ts`,
`snapshotBuilders.ts`, `silentRefresh.ts`) — plus the three other screens a
dynasty appears on (`Sims.tsx`, `SimPanel.tsx`, `FocusPanel.tsx`). And by driving
the page: a dynasty from a save opened, one of your own opened, the crest
designer, the member picker, the role menu (including handing Head to someone
else), the ideals and skills pickers, and both relation pickers. Figures below
are read off the running page: **13 dynasties** — 8 from the save, 5 written in
the planner — **26 members**, largest **5** (*Capp*), **3 alliances**.

## Why it exists

A dynasty in Royalty & Legacy is a family line with a rank: who heads it, who
inherits, who's fallen out of favour, what the line stands for, and who it counts
as friend or enemy. The game shows you one dynasty at a time and keeps prestige
and unity as bars you can't read a number off.

This page puts every dynasty in your save side by side with the ones you intend
to found, so a succession plan — the head, the heir, the ideals the line is meant
to hold to — can be written down before any of it happens.

## What you see

**The rail**, on the left: a **Dynasties** title, a green **+ NEW DYNASTY**
button, a **Search dynasties...** box with a clear ✕, and then every dynasty
alphabetically as its **crest** and its name. The selected one takes a soft green
tint and a green bar down its left edge; up and down arrows move the selection. A
dynasty you wrote carries a plum **PLANNER** pill.

**Dynasties at a glance**, when nothing is selected. A wide lead tile carrying
the total with a two-colour bar — **N from save** in green, **N planned** in plum
— over three tiles: **Members** (*sims in a dynasty*), **Largest**, which names
the dynasty as well as counting it, and **Alliances** (*between dynasties*).

A plan with no dynasties at all shows a single card instead: **No dynasties yet**
· *Imported dynasties come from the Royalty & Legacy pack — found one in-game,
then re-sync. Or build your own from scratch.*

**A dynasty from your save.** The header is the crest at full size, the eyebrow
**DYNASTY**, the name, a member count, and **Remove** pushed to the right. If the
save carries a description it sits below in its own card, **DESCRIPTION · from
save**. Then, in order:

| Section | What's in it |
|---|---|
| **Prestige** and **Unity** | two stat cards. Prestige is **Level N** over a ten-star rating with the raw points below; Unity is a shield reading **Crisis**, **Neutral** or **Stability**, with the raw score out of 130 |
| **Members** | one row per sim — portrait or a gender-tinted monogram, the name, and a **HEAD** / **HEIR** / **FOUNDER** / **BLACK SHEEP** / **MEMBER** pill. Ordered by rank, then by succession order. Past eight it collapses behind **Show all N members** |
| **Ideals** and **Skills** | two cards of icon'd chips |
| **Alliances** and **Rivalries** | two cards, each chip carrying the other dynasty's crest and name (**No alliances** / **No rivalries** when empty) |

**NOTES · private** closes the page.

**A dynasty you wrote.** The same header, with the crest and the name both
editable — the crest takes a hover overlay reading **Edit**, the name a dashed
underline and a pencil. Prestige, Unity and the description are absent entirely:
they're things the game awards, so there's nothing to author. Members, Ideals,
Skills, Alliances and Rivalries all become editors.

**Where a dynasty shows up elsewhere.** On the **sim roster**, as a **DYNASTY**
column carrying the crest and name, which is also a sort and a filter. In
**Households**, a sim's panel has a **Dynasty** row under **MEMBERSHIPS**. On the
**family tree**, the focused sim's panel shows their crest, dynasty and role.
Nothing else in the app mentions dynasties: not Home, not the world view, not any
public page.

## What you can do

### The list

- **Search** by name, and **create** a dynasty — **+ NEW DYNASTY** makes one
  called *New dynasty*, gives it a **random crest**, and opens it.
- **Move between dynasties with the arrow keys.**

### Any dynasty, yours or the save's

- **Write notes.** Private, planner-only, saved when you click away.
- **Remove it** — *Delete "<name>"?* with a red Delete. Removing one that came
  from your save doesn't touch the save; it takes the dynasty out of the plan.
- **Open a member**, which jumps to that sim on the roster with their panel
  already open.

### A dynasty you wrote

- **Name it.**
- **Design its crest.** A live preview with **Randomize**, then three rows:
  **6 colours**, **10 shapes** (each drawn in the colour you picked, because the
  shapes have no names worth showing) and **28 symbols**. **Apply crest** commits.
- **Members**: **+ Add members** opens every sim on the roster grouped by
  household — the group heading names the world — searchable by sim, household or
  world, tick as many as you like. The first sim added becomes **Head**;
  everyone after is a **Member**. Click anyone's role pill to change it among
  Head, Heir, Founder, Black Sheep and Member. Head, Heir and Founder are
  one-per-dynasty, so handing one over stands the previous holder down and says
  so — *Fia is no longer Head.* ✕ removes a member.
- **Ideals** and **Skills**: **Choose ideals** / **Choose skills** open a
  two-column grid with a search box and a running **N / 3** — **13 ideals** and
  **59 skills**, three of each at most, which is what the game allows. Each chip
  has its own ✕.
- **Alliances** and **Rivalries**: **Add allies** / **Add rivals** open a list of
  every other dynasty, imported ones included, with crests. A dynasty already on
  the opposite list is flagged **rival** / **ally**, and picking it moves it
  across rather than putting it on both. Between two dynasties you wrote the
  relationship is **reciprocal** — naming one an ally makes the pairing mutual.

## What you can't

- **Change anything the save gave you.** On a dynasty from your save the name,
  crest, description, members, roles, ideals, skills, prestige, unity, alliances
  and rivalries are all read-only. Notes are the exception.
- **Push any of it back to the game.** A dynasty you write here is a plan, not a
  save edit — you still have to found it in-game.
- **Set prestige or unity.** They're earned, read-only, and shown only on a
  dynasty that came from your save.
- **Go past three ideals or three skills.**
- **Put one sim in two dynasties.** A sim already in one is shown greyed in the
  picker, labelled with where they belong.
- **Make an imported dynasty reciprocate.** Naming one an ally of a dynasty you
  wrote records it on your side only; the imported one's own list is the save's
  to write.
- **Add a sim who isn't on the roster** — tree-only ancestors and culled sims
  aren't offered.
- **Pick a crest for a dynasty from your save**, or read a shape's name.
- **See a dynasty's perks, its aspiration progress, or the succession order as a
  number.** None of that is surfaced.
- **Open the page on a phone.**

## How it relates to sync

Every dynasty is one of two things, and the page never mixes them: **a dynasty
read out of your save**, or **a dynasty you wrote**.

**What the save owns.** For a dynasty that came from your save, eight things ride
in the comparison on every sync — **description, head, members (with their roles
and succession order), ideals and skills, crest, prestige, unity and perks** —
and where the game has moved on, the game wins. Three more are **applied whole
rather than compared**: its **name**, its **alliances** and its **rivalries**.
Either way the dynasty counts as changed on the sync screen, and it counts
**once**.

The **name** is settled by comparing the planner's copy directly against the
save's, rather than against what the save said last time. That's what lets a
rename that went missing on some earlier sync put itself right on the next one.

Members, ideals, skills and perks are sorted into a fixed order before they're
compared, because the game rewrites those lists in a different order between
saves. Members are matched by the sim's game id, not by name, so a sim renamed
in-game doesn't read as a different person.

**What you own.** Notes. They are never read, never compared and never
overwritten.

**What a re-sync does.**

| What happened in game | What the plan does |
|---|---|
| You founded a dynasty | It arrives, with whichever members are already in the plan |
| You renamed it | Adopted |
| Sims joined or left it | Adopted |
| The head died and the heir succeeded | Adopted — roles come from each sim's traits |
| It gained prestige, or unity moved | Adopted |
| You changed its ideals, skills or crest | Adopted |
| It allied with or turned on another dynasty | Adopted whole, and the dynasty counts on the sync screen |
| The dynasty ended | It leaves the plan |
| A member is no longer in the save | They drop off the dynasty |

**A dynasty you wrote is invisible to sync.** It is never updated, never renamed
and never removed, no matter what the save says — it has no game id, so nothing
in the save can match it.

On the sync screen dynasties are a single count — *N dynasties* — meaning how
many arrived, changed and ended together. Nothing is optional; every sync applies
in full.

**On a first import** every dynasty in the save comes in, and the review names
them (*8 dynasties*). A member the import couldn't place is dropped without
comment, so a dynasty can arrive with fewer members than the game shows.

**Elsewhere in the save's life**: a `.s4plan` export carries dynasties whole and
a restore rebuilds them with their members re-pointed at the restored sims and
their alliances re-pointed at the restored dynasties; duplicating a save copies
them; **Reset planner data** deletes them.

## Limitations

- **Perks are stored but never shown.** Each imported dynasty carries the numbers
  the game writes for its unlocked perks, but they aren't in a form the planner
  can turn into perk names, so nothing about perks appears on the page.
- **The list marks what you wrote, not what came from the save.** A dynasty you
  created carries a plum **PLANNER** pill; one from your save carries nothing. On
  the dynasty itself the signal is what's missing — no edit affordances, and no
  Prestige or Unity cards.
- **A member is a name, a face and a role.** No lifestage, no household, no age —
  and a member you delete from the plan simply vanishes from the dynasty rather
  than leaving a marker.
- **Portraits are a bonus, not a guarantee.** A member shows their assigned
  portrait if there is one and a gender-tinted monogram otherwise; nothing
  distinguishes "no portrait" from "portraits failed to load".
- **A role is read off the sim, not off the dynasty.** Head, Heir, Founder and
  Black Sheep are traits each member carries, and the planner reads whichever
  ranks highest. So a member with no role trait at all is simply a **Member**,
  and the page can't distinguish that from a role it failed to recognise.
- **An imported dynasty can show two Heirs.** The editor treats Head, Heir and
  Founder as one-per-dynasty and stands the previous holder down; the save is
  under no such rule, and a dynasty from your game may arrive with the same role
  on more than one member. It's shown as it stands rather than corrected.
- **A relationship with a dynasty that isn't in your plan still counts.** It
  shows as a neutral shield reading *Unknown dynasty* rather than being dropped.
- **Prestige stars are a rating, not a bar.** Ten levels are shown as ten stars,
  so a dynasty most of the way to the next level looks identical to one that just
  reached the current one; only the raw points underneath separate them.
- **Dynasties are private.** They appear on no public page and on no showcase.
