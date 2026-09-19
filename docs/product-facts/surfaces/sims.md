# Sims

**Route** `/saves/:saveFileId/sims` ·
**Tier** 2 ·
**Requires** no pack. Pack-specific values simply appear when the save has them —
an occult chip, a Dynasty column, a university row in the panel ·
**Desktop only** — below the breakpoint, on a touch device, the page is replaced
by a "continue on desktop" gate titled *sim roster* ·
**Polish** shippable and photographable ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`Sims.tsx`, `FocusPanel.tsx`, `SimCard.tsx`, `SetSimPhotoModal.tsx`,
`SimPanel.tsx` (where sims are actually edited), the store and API
(`useSaveFile.ts`, `server/src/routes/sims.ts`), and the sync rules (`diff.ts`,
`snapshot.ts`, `snapshotBuilders.ts`, `GameReimport.tsx` whole) — and by driving
the page: the filters panel, the Occult, Ghost, Pet, Employed and Unemployed
filters, the Traits and name sorts, the no-match empty state, a career search,
the detail panel, a `?sim=` deep link for both an on-roster and an off-roster
sim, a sim portrait assigned and removed, and a planned career, planned skill,
planned-unemployed and planned move each set on one sim, checked through the
roster, the filters and the Diversity page, and reverted. Roster numbers were
read back off the running page: **406 sims on the roster, 402 from the save and
4 planned, out of 747 sim records in the plan**.

## Why it exists

Households show you families. This shows you people. It is the only screen that
puts every sim in the save on one surface, so it answers the questions a
household can't: who in this save is a spellcaster, who never went to
university, which elders have no career, who belongs to the Goth dynasty. It is
also the save's index — a club member, a business owner or a dynasty head
clicked anywhere else in the app opens here, with that sim already selected.

## What you see

**The page title, Sims, and nothing under it.** The count in the toolbar is the
fact line, and it stays live as you filter.

**A toolbar.** A search box — *Search sims…* — with an ✕ once you've typed. A
**Filters** button that turns green while the panel is open or any filter is on,
carrying a green count pill of how many filters are set. A **Clear** link,
present only when something is filtered.

**A count summary, right-aligned.** *406 sims* on its own, or *8 of 406 sims*
once anything is filtered. When the plan contains sims you created yourself it
adds a two-dot split — a green dot and *402 save*, a plum dot and *4 planned*.
With nothing planned, the split is absent.

**The filters panel, when you open it.** Six rows of chips, then four
dropdowns:

| Group | Options |
|---|---|
| **Species** | All · Human · Pet · Cat · Dog · Horse |
| **Gender** | All · ♂ Male · ♀ Female |
| **Lifestage** | All · Newborn · Infant · Toddler · Child · Teen · Young Adult · Adult · Elder · Pet |
| **Occult** | All · None · Vampire · Alien · Mermaid · Spellcaster · Werewolf · Fairy · Ghost |
| **University** | All · Enrolled · Has degree |
| **Career** | All · Employed · Unemployed · NPC job |
| **Trait / Skill / Aspiration / Dynasty** | dropdowns, defaulting to *Any* |

An active chip is plum. The four dropdowns list **only values that exist on this
roster** — the trait and skill catalogs run to hundreds of entries, and offering
one that would return nothing is noise. The Dynasty dropdown is absent
altogether until the save has a dynasty.

**The table.** Eight sortable columns: **Sim · Gender · Lifestage · Aspiration ·
Traits · Career · Dynasty · Household**. Clicking a header sorts by it; clicking
again reverses. Sorting is by what you'd expect per column — lifestage in age
order rather than alphabetically, Traits by how many a sim has.

**A row.** A round lifestage icon, the sim's name, and a small tree button that
opens them in the family tree — not shown for pets. Gender is a pill: green
**♂ M**, plum **♀ F**. Aspiration and career carry their real in-game icons.
Traits are **icons only**, up to a fixed width, with the trait's name on hover.
A career shows its level beside it, or the word **NPC** for a service job — and
no level at all when the career is one you planned, because a level is progress
and progress only exists in the save. Dynasty shows the crest and name, with the
sim's role on hover. Everything a sim doesn't have reads **—**.

**Every column shows the plan.** Where you've authored something about a sim,
the roster shows what you authored, not what the save says — one value per
field, never both. A sim you've planned into Culinary reads *Culinary*; a sim
you've planned a move for reads their destination household; a sim you've
planned out of work reads **—**. Nothing here is a second, parallel copy of the
row: it's the same row, answering with your plan.

**Pets are thin rows and they sink.** A pet has no lifestage, aspiration, trait,
career or dynasty on the game's side, so a pet row is a name, a gender and a
household with five dashes between. Because that would scatter blank cells
through every sort, pets are pinned below humans on every sort except an
explicit **Species** sort.

**The detail panel**, docked to the right when you click a row, with a **Close**
above it. It holds, in order: the portrait (or a gender-tinted monogram) with
**Set photo** on hover; the name; *Male · Adult*; a status line; **Household**
and **Family tree** buttons; **Dynasty**; **Traits** as green chips;
**Aspiration**; **Career**; **Skills · N**, collapsed, highest level first;
**Education**; then **Parents**, **Partners**, **Siblings**, **Children** — each
a clickable list that re-points the panel at that relative — and **Notes**.

**The status line is where life and death live.** ● **Living**, ● **Ghost** with
the cause of death, ⚰ **Deceased** with the cause, or **Unknown — not in the
save** for an ancestor the game only knows by reference. A sim whose record the
save no longer holds also carries *Preserved — no longer in the save*.

**Two empty states.** With no sims at all: *No sims yet* — "Sims live inside
households. Open a household to add named sims with gender, lifestage, and
occult — or import a save and we'll pull them all in." — and a **Go to
households** button. With sims but no matches: *No sims match those filters*,
*There are 406 sims in this save — clear a filter to see them.*, and a **Clear
filters** button.

## What you can do

### With the list

- **Search** by name, and by career name — typing *Tech Guru* returns everyone
  in that career.
- **Filter** on any combination of the eleven dimensions above. Clicking an
  active chip a second time turns it off.
- **Sort** on any of the eight columns, either direction.
- **Clear** everything, from the toolbar or from the empty state.

Search, filters and sorting all read the plan, the same as the columns do.
**Employed** counts a sim you've planned into a job and drops one you've planned
out of it; the **Skill** dropdown offers a skill you've only set as a goal, and
finds the sims you set it for.

### With a sim, from here

- **Open their detail panel** by clicking the row; click it again to close.
- **Set, replace or remove their photo.** Set photo opens a picker: upload a new
  image, or pick from the photos already filed to their household. A sim in a
  household files the upload into that household's feed as well, so it can show
  on your showcase; a sim with no household — a deceased or tree-only ancestor —
  gets a photo filed to themselves alone, and the modal says so: *"Not in a
  household, so an upload here stays private to them — it won't show on your
  showcase."* One photo per sim; a new pick replaces the old.
- **Write private notes**, saved when you click away.
- **Jump to their household**, to the **family tree** focused on them, or to any
  parent, partner, sibling or child in the panel.

### Everything else about a sim

Editing a sim — name, gender, lifestage, occult, cause of death, traits,
aspiration, career, degrees, skill goals, a planned move — happens in the
per-sim editor inside **Households**, not here. See `households.md`.

## What you can't

- **Edit anything about a sim on this page except their notes and their photo.**
  Every column is read-only.
- **See the save's value once you've planned over it.** The plan wins outright:
  a sim planned into Culinary shows Culinary, and the Tech Guru job they hold
  today isn't shown here at all. Both values live in the per-sim editor in
  Households, which is also where the revert back to the save is.
- **See a level on a planned career or a planned skill.** Levels are progress,
  and progress only exists in the save. Anything counted by level — Diversity's
  *Most maxed*, for instance — is built skills only, necessarily.
- **Tell a ghost from the living in the table.** There is no status column. A
  playable ghost's row looks exactly like a living sim's; ghost-ness shows only
  in the detail panel, and via the **Ghost** filter chip.
- **See a sim's portrait in the table.** The row avatar is always the lifestage
  icon, even for a sim whose portrait you've set. The portrait appears in the
  detail panel only.
- **Read all eight columns with the panel open.** At a 1440-wide window the
  panel pushes **Career**, **Dynasty** and **Household** out of view behind a
  horizontal scroll.
- **Create or delete a sim**, or select more than one at a time.
- **See mod traits, hidden traits or degrees as trait chips.** The Traits column
  and the panel's Traits card show catalogued personality traits only. Degrees
  appear under **Education** instead; a service sim's hidden role trait appears
  only in the household editor.
- **Search by trait, aspiration, household or dynasty** — those are filters, not
  search terms.
- **See which sims have notes** without opening each one.
- **Open the page on a phone or tablet.**

## How it relates to sync

**Every column on this page is mirrored from your save.** Nothing in the table
is authored, so a re-sync can change any of it.

**Which sims appear.** The roster is the **active** sims only. A plan holds far
more sim records than it shows — 747 records for 406 rows in the reference save
— because the family tree keeps everyone the save has let go: **tree_only** (the
save still has the record, no household we track), **culled** (the record is
gone), and **stub** (an ancestor the game names but doesn't store). None of them
appear in the table, but the **detail panel still opens them** — via a relative's
name in the panel, or a `?sim=` link — and says which they are.

**What a re-sync compares, field by field:** first and last name, gender,
lifestage, species, pet subtype, pet breed, occult, ghost, which household they
belong to, personality traits, aspiration, cause of death, enrolled degree, and
career. Each is a three-way comparison against the values recorded at the last
sync, so an edit you made and the game didn't survives, and a change the game
made wins. **Each field is settled independently**, so a sim you renamed who
gained a trait in-game keeps your name and takes the trait — one field moving
never drags the rest of the sim back to the save.

**What refreshes silently, every sync, without appearing in any count:**
observed **skills** (replaced wholesale with the save's), **cause of death**, and
the whole **family-relationship set**. A sync that finds nothing else to report
says so directly — *"Skills, careers, funds and relationships refresh too"* —
which is the one place that sentence appears, so a no-change sync can't read as
"nothing happened".

**What a re-sync never touches:** your **notes**, the **photo** you set as a
sim's portrait, and every planner-authored goal — **planned career**, **planned
skill goals**, **planned move**. A planned move is the one exception with a
rule of its own: it is spent the moment the sim actually changes household
in-game, whether or not they moved where you planned.

**How the plan and the save coexist in one column.** Most sim fields hold a
single value that starts as the save's and becomes yours when you edit it —
there is nothing to choose between. Four can't work that way, because the save's
version carries progress you can't author: a career has a level, a skill has a
level, a move has a departure, funds have a balance. Those are stored twice so
the editor can offer you a revert. Everywhere else in the app — this page, the
Diversity page, the detail panel — they resolve to **one** value: yours if you
authored one, the save's if you didn't. A planned skill is the only one that
adds rather than replaces; you don't unlearn Cooking by planning Guitar. The
comparison a re-sync runs is deliberately exempt: it weighs the save's value
against the save's own baseline, so a plan can never be mistaken for something
the game did and overwritten on the next sync.

**A sim you created yourself** — one with no counterpart in the save — is
invisible to the comparison entirely. It is never updated and never removed;
it's the plum half of the count summary.

**A sim who has left the save** is deleted from the plan *unless* they matter to
the family tree — they're a ghost, a relative another sim still points at, or
already woven into the tree. Those are never deleted; they drop off the roster
into the tree instead. A sim who returns is promoted back onto the roster rather
than duplicated, keeping their notes and photo.

**Sims arrive on their own** too: a baby born since the last sync appears here
with no action from you.

## Needs confirming

- **Should a ghost be marked in the table?** The panel distinguishes living,
  ghost, deceased and unknown; the table distinguishes none of them.
- **The empty *No sims yet* state is read from the code, not driven** — the
  reference save has 406 sims. It is reachable on a plan built from scratch
  before any household has members.
