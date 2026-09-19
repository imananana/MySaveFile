# Family Tree

**Route** `/saves/:saveFileId/family` ·
**Tier** 2 ·
**Requires** no pack. It needs a save that has been imported, though — the tree
is built from family links read out of the `.save`, so a plan created from
scratch has nothing to draw ·
**Desktop only** — below the breakpoint, on a touch device, the page is replaced
by a "continue on desktop" gate titled *family tree* ·
**Polish** shippable and photographable ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`Family.tsx`, `FamilyLanding.tsx`, `SimCard.tsx`, `FocusPanel.tsx`,
`AddAncestorModal.tsx`, `EditUnionModal.tsx`, `OverflowChip.tsx`,
`SetSimPhotoModal.tsx`, the layout engine (`hourglass.ts`, `layout.ts`), the
store and API (`useSaveFile.ts`, `server/src/routes/relationships.ts`,
`sims.ts`, `schema.sql`), and both sync paths whole (`familyImport.ts`,
`GameImport.tsx`, `GameReimport.tsx`) — and by driving the page: the landing
grid, entering a family, the detail panel, a union bond opened and closed
without saving, the sim search, the canvas measured against its container on
three entry paths, a household invented and saved to confirm it produces no
family line, and a full re-sync from a real `.save` watched end to end.
Claims about ancestors were checked against the game's own files rather than the
app: nine saves parsed directly, the premade-ancestor tuning read entry by
entry, and ancestor ids compared across four pairs of saves to see what survives
a Save As. Figures below are read off the running page: **78 families**, the
largest holding **31 people**.

## Why it exists

The game forgets your ancestors. When a sim has been dead long enough, The Sims
4 culls the record and everything hanging off it — the marriage, the cause of
death, the name — leaving a grey "Unknown" silhouette in the in-game family
tree. It also hides truly dead sims away in households you can never open, so
the great-grandmother who founded the line is unreachable from anywhere in the
game.

This page is the archive the game doesn't keep. It holds ancestors after the
game has dropped them, remembers what they died of, lets you put a name to an
Unknown, and lets you record a marriage the save no longer has any record of.
For a legacy player that's the whole point of the plan: the family is the thing
being played, and it is the one part of a save that quietly degrades the longer
you play it.

## What you see

**The family grid**, when the save has more than one family line. A centred
**Family Tree** title over a **Search for a sim** box, an eyebrow counting the
lines (**78 FAMILIES**), and a grid of tiles sorted biggest-first — each a
**mini tree**, a surname, and a count line (*Capp · 31 people · 6
generations*). The mini tree is that family's real parent structure drawn as
dots and lines: dots in the gender colours (ghosts faded parchment), couples
joined by a bar with one line fanning to each child, children sitting under
their parents. Big lines are capped — the first four generations, six dots
per row — so a dynasty reads as a dense shape rather than a smudge, and the
count line carries the true size. No two tiles look alike; a four-generation
legacy looks deep and a young couple looks young. Sixteen tiles show;
**Show all 78 families** reveals the rest.

A tile is a **line**, not a surname: everyone the family links connect, however
they connect. Two families joined by a single marriage are one tile, counted
together and labelled with whichever surname is most common in them — so the
*Capp* tile holds the Montys too. Opening one lands you on the **youngest heir**,
the sim with the deepest ancestry behind them, which is why the tree you arrive
in can be headed with the other surname. That is the entry point for a *line*;
to open the tree on a particular sim, use the family-tree link on their row in
the sim roster instead. Typing two characters searches
every human in the plan and drops a list under the box, each row an avatar, a
name, and a state word — *unknown* for an in-game Unknown, *added* for one you
wrote in, *ghost* or *deceased*. A save with a single family line skips this
screen and opens straight into the tree.

**The tree.** The header carries a **← Back** button, an eyebrow reading
**FAMILY TREE · <surname>** — clickable, and how you return to the grid — and
**Viewing <name>** with the name in green. On the right, a **Find a sim** box;
single-family saves also get a **Reset** that re-centres on the family's anchor.

The canvas is warm paper with a faint dot grid, and the layout is an hourglass:
the focused sim sits in the middle, ancestors fan up, descendants fan down.
Cards are large — portrait or gender-tinted monogram (green for male, purple for
female), first name, surname, and a chip. The chip names the relationship *to
the sim you're viewing* — Great-grandfather, Grandmother, Son, Half-sister,
Ex-wife — falling back to the lifestage on the focused card itself.

Four card states carry all the meaning:

| State | Reads as |
|---|---|
| Living | white card |
| Ghost | white card, purple ghost mark — dead but still playable, still on the roster |
| Deceased | solid warm-grey card, tomb mark, greyed text |
| Unknown | dashed empty card, **+ add** |

Between couples sits a union glyph, and the glyph tier is the fact: **linked
purple rings** = married or engaged, **separated grey rings on a dashed line** =
divorced or an ended engagement, **a single circle** = partners, **a bare dotted
line** = no recorded bond at all, only shared children. Connector lines drop
from the glyph when a child belongs to both, and from one card alone when it
doesn't — so a step-child or a science baby never reads as the couple's.

A small **+** floats above any sim with no parent above them. The zoom control
sits bottom-right (**−  100%  +**). Under the canvas run the legend and one line
of hints: *drag to pan · ⌘/ctrl-scroll or pinch to zoom · click a sim to
re-center · click a ring or dotted line to edit a bond*.

**The detail panel** is always docked on the right and always describes the sim
you're viewing: portrait, name, **Male · Teen**, and a state line — **● Living**,
a ghost mark with the cause (*Ghost · Old Age*), **⚰ Deceased · Fire**, or
*Unknown — not in the save*. A sim the game has culled adds *Preserved — no
longer in the save*. Then a **Household** button when they live somewhere, the
**Dynasty** with its crest and role, **Traits** and **Aspiration** with their
real in-game icons, **Career**, **Skills** (collapsed, with a count),
**Education**, then **Parents · Partners · Siblings · Children** as clickable
lists, and **Notes** at the bottom.

## What you can do

### Moving around the tree

- **Click any sim to re-centre** — the hourglass rebuilds around them and every
  relation chip re-reads against the new focus.
- **Back** steps through the sims you clicked; the **Family Tree** eyebrow jumps
  straight back to the grid.
- **Find a sim** re-centres on anyone in the plan, including sims who aren't on
  the roster.
- **Drag to pan**, **⌘/ctrl-scroll or pinch to zoom**, or use the zoom buttons.
  Every tree opens scaled to fit its frame, so the whole line is on screen
  before you touch anything. Once you zoom by hand that scale is yours and
  survives a window resize; re-centring on someone else fits the new tree again.
- When one couple has more than eight plain children — or the focused sim more
  than six siblings — they collapse into a single **N children** chip card that
  opens a grid; everyone behind it is still one click from being centred.

### The sim you're viewing

- **Write notes.** They save when you click away, and they work on ancestors who
  aren't in the save any more.
- **Set a photo.** Upload one, or pick from the household's built photos. A sim
  with no household — a dead or preserved ancestor — gets an upload filed
  privately to them, so it never lands in a household feed or on your showcase.
- **Open their household** in the household manager.

### The tree itself

This is the only place in the app where you author family:

- **Name an Unknown.** Click a dashed card and fill in name, gender, lifestage,
  whether they're deceased, and a cause of death. The record stops being an
  Unknown and becomes yours.
- **Invent a parent.** The **+** above a top-of-line sim creates a brand-new
  ancestor and links them as that sim's parent, so a line can be extended
  upward past where the save's memory stops.
- **Record a bond.** Click a union ring — or the dotted line between two
  co-parents — and set it to Married, Engaged, Partners, Divorced, Engagement
  ended or Broken up. The modal states what the save says (*From the save:
  Married*) or admits there's nothing on record, applies your pick immediately,
  and stays open. **Remove manual bond** puts it back to exactly what the save
  says.

## What you can't

- **Edit a sim from here.** Names, traits, aspiration, career, skills and
  lifestage are all read-only on this page — sims are edited in Households.
  Notes and the photo are the exceptions.
- **Add a child, a sibling, or a partner as a new person.** Authoring only ever
  goes *upward*: fill an Unknown, or invent a parent. Upward is the past, and
  the past is settled — an ancestor you write in can never be contradicted by
  something that happens next in your game. A child or a partner is a future
  event, and inventing one would be a plan the save could go on to disagree
  with.
- **Delete anyone, or delete a link that came from the save.** Only a bond you
  set by hand can be cleared, and only back to what the save says.
- **See a household you made yourself.** Sims you invented — through the
  randomizer or the creation modal — never appear here. See *How it relates to
  sync*.
- **See pets.** The tree is humans only.
- **See friendships, romance levels, or relationship scores** — only the family
  links themselves.
- **Export or print it.** There's no PDF and no image export.
- **Open it on a phone.**
- **Start a tree from nothing.** A plan with no imported save shows *No family
  edges stored for this save yet — re-sync it from its .save file to import the
  tree*, and there is no way in from there: every authoring affordance hangs off
  a sim who is already in the tree.

## How it relates to sync

Everything on this page is one of two things, and they never mix: **links and
records read out of your save**, and **the handful of corrections you made
yourself**.

**What the save owns.** Every parent link, marriage, engagement, partnership and
ex-relationship comes from the save file. On every sync that whole set is thrown
away and rebuilt from the new one, so the tree always tells you what your save
currently says. Sims outside the households you track are pulled in too: the
import walks outward from your sims through parents, children and partners, and
brings in anyone it reaches — including the truly dead in the game's hidden
households. Dangling references it can't resolve become the Unknown cards.

**Where the dead premades come from.** A deceased premade ancestor — Cordelia
Capp, Sef Darong, Cornelia Goth — has no record of their own in your save. The
save names a template, and the name, gender, cause of death and portrait all
come from the game's own ancestor data. That detail is re-read on every sync, so
an ancestor's card is only ever as good as the template behind it.

**What you own.** A named Unknown, an invented ancestor, and a bond you set by
hand are all invisible to sync. They are never overwritten, never removed, and
never re-derived. The save's own version of a bond stays stored underneath your
correction, which is why clearing yours restores it exactly.

**What never reaches it.** A sim your save has no record of, who lives in a
household, is not in the tree at all. A household you invented or rolled has no
lineage for the tree to draw and never becomes a family line of its own — this
page shows the family your *save* remembers, not the people you've planned. The
test is on the sim rather than on their household, and that distinction does
two jobs: a real sim you move into a household you built keeps their entire
lineage, because what makes it theirs is their record in the save; and an
ancestor you wrote in by hand has no save record either, but belongs to no
household, which is exactly what separates them from an invented resident.

**What a re-sync does.**

| What happened in game | What the plan does |
|---|---|
| A sim died and went to the game's hidden dead household | Leaves the roster, keeps their cause of death, stays in the tree |
| The game culled a sim who matters to the tree | Kept and marked *Preserved — no longer in the save*, never offered for deletion |
| A culled sim came back | Returns to the roster in place, rather than arriving as a second copy |
| A sim genuinely left and matters to nobody's lineage | Removed like any other |
| New ancestors are reachable that weren't before | Created quietly |
| Causes of death changed or were missing | Refreshed |

Family work is **applied automatically** — there is nothing to approve. On the
sync screen it appears only as a count, *N family tree updates*, on the same line
as households and lots. When a sync finds nothing at all to count, the tree is
among the things covered by *Skills, careers, funds and relationships refresh
too*. A save imported before the tree existed gets its whole tree on the next
sync.

Two things it survives: **deleting a household** keeps any member the tree needs
(they leave the roster and stay in the tree), and a first import names the tree
in the review tally — *N family tree records · N connections*.

One thing it doesn't: **deleting a single sim** takes their family links with
them, including ones you drew by hand.

## Limitations

- **A tile's member count is not the number of cards you'll see.** The tile
  counts the whole line; the tree draws one sim's ancestors and descendants, so
  the 31-person *Capp* tile opens a view of eight. Re-centring on someone else
  in the line shows their share of it.
- **It climbs three generations of ancestors.** Anything above great-grandparents
  isn't drawn until you re-centre further up.
- **Relationship names flatten past three generations** — a
  great-great-grandchild is still labelled *Great-grandson*.
- **A childless partner is panel-only.** Someone the sim never had children with
  appears in the Partners list but not on the canvas.
- **The zoom control sits on top of the tree** and can overlap a card in the
  bottom-right corner.
- **Syncing an unrelated save into a plan leaves its ancestors behind.** Dead
  premades are matched by an id that belongs to the save's own lineage, so
  playing on, saving as a new file, and syncing that all match cleanly — the
  ancestors already in your plan are recognised and updated. Point the same plan
  at a *different world's* save, though, and its ancestors arrive as new people
  while the originals are kept, because preserved ancestors are never deleted.
  The leftovers lose their family links, so they can't appear in a tree; they
  show up only as a second identical name in the tree's search box.
- **Every Unknown is drawn as female.** A dangling ancestor reference has no
  gender to read, so it takes the default and renders purple — a claim the save
  never actually makes.
- **A save that predates the game's Feb-2026 family-tree patch has no premade
  ancestors at all.** The dead premades come from a genealogy record the patch
  introduced; a save written before it simply doesn't have one, and its tree
  stops at whoever the living sims remember. Three of the saves checked are in
  this state, all of them downloaded ones — a shared save often hasn't been
  re-saved in years. Opening it in the game and saving once is what fills the
  tree in.
