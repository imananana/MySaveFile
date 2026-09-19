# Diversity

**Route** `/saves/:saveFileId/diversity` ·
**Tier** 2 ·
**Requires** no pack. Pack ownership narrows what's *audited* — a trait,
aspiration, lot type or world belonging to a pack you don't own is left out of
the pools entirely, so the percentages describe the game you actually have ·
**Not desktop-gated** — unlike Sims and Households, this page opens on a phone:
the tab bar scrolls sideways, every grid stacks, and the population pyramid
narrows to fit ·
**Polish** shippable and photographable ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`Diversity.tsx`, `DiversityView.tsx` whole, `householdClassifier.ts` whole, the
effective-value resolver (`effective.ts`), the kinship index (`kin.ts`), the
store, and the sync rules — and by driving all six tabs and reading every
screenshot, plus a planned move set and reverted to see which numbers follow the
plan, and the classifier run over a dump of the real save with and without
family edges to see exactly which households change bucket. Figures below are read off the
running page: **392 sims**, 53% female / 47% male, **193 households**, 67 of 81
skills represented.

## Why it exists

Every other screen shows you one thing at a time — a household, a sim, a lot.
This one shows you your habits. It answers the questions you can't see from
inside a single family: that your save is 43% young adults, that ninety of your
households are one person living alone, that you have sixteen bars and one
playground, that Charisma is the most-maxed skill at every life stage but one.
It exists to be acted on — the point is to notice the lopsidedness and go fix
it, which is why the filters and the numbers matter more than the charts.

## What you see

**A filter row**, always visible above the tabs: **All ages**, **All genders**,
**All worlds**. Once any is set, a live *N match* appears beside them. The world
list holds only worlds your sims actually live in, minus any you've switched off.

**Six tabs** — **Population · Personality · Work & School · Skills ·
Households · Lots**. Each opens with a strip of two or three headline cards,
then one or more panels.

**Population.** *392 sims*, most common Young Adult (43%); *Gender balance
53% ♀ · 47% ♂*, 207 female · 185 male. Then **Demographics** — a population
pyramid by life stage, female left in plum and male right in green, with a
greyed row for a stage nobody occupies; an **Occult mix** of coloured chips
(*Mortal 365 · Vampire 3 · Spellcaster 9 · Werewolf 6 · Fairy 7 · Mermaid 2 ·
Ghost 6*); and **Pets** (*Cats 6 · Dogs 4 · Horses 4*).

**Personality.** Two **most gendered** cards — the trait and the aspiration with
the sharpest male and female skew, each with its real in-game icon (*Bro, 88%
male* · *Child of the Village, 100% female*). Then **Traits** and
**Aspirations**, each as two columns, **Most used** and **Least used**. A row is
a name, a bar split female-plum / male-green, the share of eligible sims, and
the raw count — *16%, 47/301*. A thin tick on every bar marks the **baseline**:
what that pick would score if everyone chose at random. That's what makes the
column meaningful — "most used" alone would just rank the big catalogs. Clicking
a row opens the breakdown: the baseline percentage, counts by gender, a
*skews male* / *skews female* flag when the lean is strong enough to mean
something, and a chip per life stage.

**Work & School.** *Employed 43%*, 146 of 342 working-age sims; most common
career; *University* enrolled and degrees earned. Most-gendered career and
degree cards when any clears the minimum. Then **Careers** — one bar per career
with its icon, gender-split, ranked, with *Show all* — and **Education**, listing
enrolled subjects and earned degrees side by side.

**Skills.** *Skill coverage 67 / 81 skills represented*; *Most maxed —
Charisma, 7 sims at level 10*; *Rarest skill — Diving Board, 1 sim*. Then **Most
popular by age**, a tile per life stage naming the one skill most of them have
(*Toddler Communication · Child Motor · Teen Charisma · Elder Cooking*), and a
**Skills** most/least-used pair in the same shape as Personality.

**Households.** *Most common type*; *Solo households* split by gender;
*Median funds* — the median, not the average, because a few rich households
would drag a mean somewhere no real household lives. Then **Types**, the
fifteen shapes the classifier knows (*Nuclear family, Couple, Single parent,
Multi-gen, Empty nesters, Roommates, Siblings, Solo, Adult child + parents,
Foster home, Teen parent, Solo teen, Solo child, Solo pet, Other*), and
**Sizes**, a bar per household size from one sim to eight.

**A household's type is read from the family tree where the tree knows.** Two
adults are a **Couple** if a partner bond says so, **Siblings** if they share a
parent — even one living in another house, and even when their surnames differ —
and an elder with an adult is **Adult child + parents** on a parent bond rather
than by assumption. Kinship is followed as far as a shared grandparent, so
cousins and half-siblings resolve, and no further: walk a full genealogy any
further and everyone in the save comes out related.

**Lots.** *Most balanced world*; *Most-used venue*. **Venue types** ranks
non-residential lots **Most common** against **Rarest** — homes are excluded on
purpose, since every world is mostly homes and they'd drown the signal, and a
handful of one-per-world venues are held out of *Rarest* because being unique by
design isn't a gap. Then **Lot type coverage**: how many lots you've retyped
away from their default, the most lopsided world, and a stacked bar per world
whose width is that world's size and whose segments are its category mix, scored
*categories covered / 8*. A legend with **What's in each?** expands to list
every lot type per category, and what's excluded.

## What you can do

### With the audit

- **Filter** by age, gender and world, in any combination. Every number on every
  tab moves with them, except lot coverage, which only listens to world.
- **Switch tabs.** Filters persist across them.
- **Expand any trait, aspiration or skill row** for its baseline, gender counts
  and life-stage spread.
- **Show all** on any ranked list — they're capped at ten or twelve by default.
- **Read one world on its own.** Pick a world and the Lots tab becomes a
  single-world view, adding a full breakdown of that world's lot types.
- **Open the category explainer** to see exactly which lot types count as
  Food & Drink, Business, Civic and so on.

### That's all

Nothing on this page changes anything. There is no edit, no create, no delete —
it reads your plan and reports on it.

## What you can't

- **Change anything from here.** Every insight lands somewhere else: a sim in
  Households, a lot in its world.
- **Filter by anything except age, gender and world.** Not by trait, occult,
  career, household type, or whether a sim came from the save or from you.
- **See the sims the roster doesn't show.** Off-roster family-tree records —
  culled, tree-only, stub — are excluded, as they are on the Sims page.
- **See pets anywhere but the Pets chips and household sizes.** Every other
  number on the page is humans only, deliberately: a pet has no aspiration, no
  career and no traits, and counting them would dilute every percentage.
- **Compare two saves, or the same save over time.** There's no history and no
  baseline beyond the random-chance tick on personality bars.
- **Export any of it.** No copy, no download; the numbers live on the page.

## How it relates to sync

**Nothing on this page is stored.** Every figure is derived at the moment you
look at it, from households, sims and lots. There is no Diversity record, so
nothing here is diffed, nothing is snapshotted, and nothing can be reverted or
lost. A re-sync changes these numbers only by changing what they're computed
from.

**It reports the plan, not the save.** Where you've authored something, the
audit counts what you authored: a sim planned into a career counts under that
career and not their old one; a planned skill counts as represented; a sim with
a planned move counts in the household — and the world — they're moving to; a
household's shape is read from the sims in it rather than the count the save
recorded. One value per sim, never both, because a sim counted under two careers
would inflate every percentage on the page.

**Two things stay save-only, and both for the same reason.** *Most maxed* and
anything else keyed on a **level** counts built skills alone — you can plan that
a sim learns Guitar, not that they reach level 10. And **median funds** uses a
household's target only while it's still a target; once the save has reached it
the goal is spent and the real balance is what counts.

**Pack ownership narrows the pools, and it is per-user, not per-save.** A trait
or aspiration from a pack you don't own never enters the most/least-used
columns; an unowned world and its lot types drop out of coverage. A world you've
switched off for this save drops out too.

## Limitations

- **A household you built here is classified by its shape, not its
  relationships.** Nothing in the planner authors a family bond — not creation,
  not the lot editor, not the randomizer — so a hand-built household has none.
  Two adults read as a Couple. Only a save-sourced household can be read as
  Roommates, because only there does a missing bond mean anything.
- **Two subtitles have drifted from what their columns count.** *"What your sims
  do for work"* and *"Which skills your sims have built"* now include what
  you've planned. Rewriting them in the future tense was tried and rejected.
- **A relationship label names the whole household on its strongest bond, even
  when that bond links only two of its members.** Dina and Nina Caliente live
  with Don Lothario; the house reads Siblings.
- **Levels can't be planned**, so *Most maxed* counts built skills only.
