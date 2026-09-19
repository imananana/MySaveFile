# Showcase

**Route** `/s/:slug` (public) · `/saves/:id/showcase` (the owner's in-app entry,
same page) ·
**Tier** 1 ·
**Requires** no pack ·
**Polish** in build — front page, world views, edit mode, the share model,
link unfurls (including the save's own cover as the unfurl image) and the
mobile pass are live in code ·
**Verified** 2026-09-10 by building it: every behaviour below was driven
headlessly against the dev app (slug mint, rename redirect, live-off revoke,
feature/hide/flip round-trips) and screenshotted; the unfurl image was
rendered in production mode for all three cover kinds, both palettes and a
67-character save name, and its cache, fallback and old-image cleanup checked
(`src/pages/showcase/ShowcasePage.tsx`, `ShowcaseWorldView.tsx`, `derive.ts`,
`Covers.tsx`, `ShowcaseOgFrame.tsx`, `server/src/routes/public.ts`,
`server/src/lib/showcasePayload.ts`, `showcaseSlug.ts`, `ogCover.ts`,
`ogRender.ts`)

One public page per save. The page shows **reality only** — the delivered
`.save`: its worlds, lots, households and sims, dressed with showcase-authored
extras (blurbs, featured picks, order). Planner goals, private notes and
planned values never appear and are never sent to the browser.

## The link

- The address is **`mysavefile.com/s/<slug>`**, and the slug **follows the
  save's name**: renaming the save re-mints the link, and **every previous
  slug redirects to the current one, forever**. A save keeps its whole slug
  history; renaming back to an old name reuses the exact old slug.
- Name collisions: the first save to go Live owns the clean slug; later saves
  with the same name get `-2`, `-3`…. An old slug is never given away.
- **Live** is the only publish switch, on the edit bar. Off = the link (and
  every old slug) renders the branded **"No showcase here!"** page — identical
  to a link that never existed, so nobody can probe what exists. Toggling Live
  back on restores the same link.
- World views are **in-page**: browsing worlds never changes the URL. There is
  exactly one shareable address per save.
- Pasting the link into Discord/Tumblr/iMessage unfurls it: the save's name,
  **"A Sims 4 save file by <creator>."** and nothing else — counts belong on
  the cover, not in text — with a green card stripe. Only Live pages unfurl;
  a not-live link unfurls like any unknown page.
- The picture on that card is **the creator's own cover** — their poster,
  postcard or photo, the same art the page opens with, drawn at the 1200×630
  every platform crops to. It is made the first time someone shares the link
  and remade whenever the cover changes: a new name, a different cover or
  palette, a swapped photo, new worlds or new numbers. Nothing to press, and
  no way to have a card that disagrees with the page. A save keeps exactly one
  stored card; the previous one is deleted when it changes. If it can't be
  drawn, the link still unfurls with the MySaveFile default card.

## What a visitor sees

Front page, top to bottom: the **cover** (their uploaded photo full-bleed with
the save name overlaid, or a generated **poster**/**postcard** cover that
stretches edge-to-edge and carries the name itself — the title sizes itself to
the name, so a two-word save and a run-on sentence both sit inside the card);
the **creator band** — one composed block, flat on the page, its content
capped at 1280 and centered: the creator's 96px avatar and name on the left,
the description as real prose beside them, the Download button at the end,
and a caption line across the bottom holding the stats at one corner
(*worlds · households · packs · required mods · updated N days ago* —
"updated" is the last sync of the `.save`, not page edits) and the social
chips at the other — real links only, so a creator with five links gets a
clean row, not a crowded name. The **Sims Gallery handle is identity, not a
link**: it renders as plain *Gallery @handle* text under the creator's name
(never as a pill — pill dress said "clickable" about the one entry that
isn't). Under a **photo** hero the identity sits on the image itself — name,
Gallery handle, then the link pills — so the band carries only the description.
The households number — here and on the generated covers — counts the
creator's **own** households (the planner's "Yours"), not the ~190 EA premades
and townies every full save carries; a full-townie-replacement save still gets
its big number, because everything in it is theirs. Per-world counts stay the
full resident roster, since that's the list the world page shows. A save with
no authored households yet drops the stat from the line, and the cover falls
back to lots built, then packs (its second stat is never zero). Then a sticky
**crest nav** of the shown worlds, the doorway into the tour — its crests
size to the save (up to ~60px for a handful of worlds, compact for a
30-world wall); then alternating **world
chapters** (lead image — their map shot, a lot-photo collage, a household
collage, or the world's own map art tagged *auto map*, wearing the planner's
real lot pins (white disc, lot-type icon, occupancy count; decorative here —
the whole card is the Visit target). Every lot the world holds gets a pin, all
at the same weight, placed against the map art itself so they sit on their
lots at any card size, however much of the art the card's shape crops away —
plus name, lot/household counts, blurb,
up to 6 lot thumbs, and a **Visit** pill); **The households** band (the
featured cast, up to 12 — portrait cards, and a household without a portrait
gets a **short card led by its cast** as overlapping initial circles in the
gender colours, never an empty box; portrait cards group before cast cards,
and every portrait box shows the whole portrait letterboxed on the stage,
never cover-cropped — heads stay on); and the
closing **Download** block — packs used as pills (5 + "+N more"), the Mods &
CC counts with **See the full list →** expanding the full Required/Recommended
list in place (past 24 entries it becomes a filterable scroll panel), and the
Download button. No download link set → Download buttons simply don't render;
the page still works.

A **world view** (via Visit or a crest): crest band with the save's name as
the way home, world hero (their photo, or the map art with the planner's lot
pins — hovering a pin names the lot with its type, size and occupants), blurb,
then **The lots**
(featured lots as big editorial cards with the lot's public description and
resident household, the rest as a photo grid — **unphotographed lots never
render**; a world with zero lot photos gets a one-line lot-type count instead)
and **The households** (featured households as big blocks — portrait, blurb,
sims as initial circles in the gender colours with first name and life stage —
above the world's full roster, where portrait cards group before cast-row
cards).

**Clicking any lot or household card opens its detail overlay** — one layer
on top of whichever page you were on: the photos big, the description (still
editable in place for the owner, same read-only rule for imported ones), a
lot's resident households, a household's full cast with life stages. A lot's
residents link to their household and a household's home lot links back, all
inside the overlay; Escape, the ✕ or the backdrop close it. Edit chips on a
card never open the overlay, and a drag never counts as a click. Which section leads is decided save-wide: any
world with more than 3 lot photos makes the whole save build-led (lots first);
the creator can flip any single world. Prev/next world cards close the page;
the first/last slot is "Back to the save".

**Which worlds show**: a world shows itself when it has at least one built
photo (map or lot); the creator can force any world shown or hidden. Planner-
disabled worlds are out entirely.

**Packs used** comes from the save's own pack detection recorded at sync;
saves that haven't synced since the feature landed fall back to only the packs
their worlds prove.

## Editing

The owner, signed in, **always sees edit mode** — there is no Edit button and
no separate editor; the public page itself grows purple affordances, and
**everything auto-saves**. The edit bar on top: **Live** toggle (front page
only — on world views it's a status dot whose tooltip says to switch from the
main page), the link, **Copy link**, **View as visitor** (a floating "Back to
editing" pill means preview is never a trap — it returns you to the page you
are actually on, still on that world, with editing back on; preview is also a
history entry, so the browser's Back button steps out of preview too, never
out of the showcase), a **download-link button** in
the same family — **Add download link** when empty, **Download link ✓** when
set; click it to paste, change or remove the URL right there (the empty slots
where the green Download button would sit offer the same thing as a dashed
purple affordance) — and the hint *Editing controls are only visible to you*.

Renaming the save from the cover title renames the **save**, not just the
page: the planner's top bar, dashboard and Save settings follow it at once,
as does any other tab that has this save open, and the slug is re-minted with
the old one redirecting. It travels the other way too — rename in the planner
and the cover, page title and link follow. What is stored is what was typed;
the postcard sets its title in capitals but never saves it that way.

One grammar everywhere: dashed-purple text is editable in place (the name —
including the title **on the generated covers themselves** — description,
**the creator name in the byline** (and the avatar beside it, via a small
upload badge — both write the creator PROFILE, so every showcase and the
planner pick the change up immediately),
world blurbs, featured lot/household blurbs — the public description fields,
shared with the planner; imported lots and households keep theirs read-only,
exactly like the planner); **★ Feature/Featured**
chips promote and demote (one featured flag per lot/household — the front
band, the peek row and the world page all read the same list, newest featured
first); a labeled **Hide** chip sends a lot to the edit-only **Other lots**
band ("no photo yet" / "hidden by you" + **Show**); **drag the tile itself**
to reorder (grip badge) — the tile follows the cursor and the other tiles
slide apart to open the gap, so letting go anywhere lands it in the slot the
gap shows; crests reorder worlds, thumbs reorder featured lots,
cards reorder the cast; section headers hold only section controls (**Move
up/Move down** swaps a world's two sections and pins it, **Shown**, **Reset
order**). Hidden worlds sit at the page bottom in edit mode, folded to a
**Hidden worlds (N)** line that opens to the rows and their reason — the same
fold the world pages use for **Other lots**. Households auto-feature: every *Yours* household with a portrait until
the creator takes over the list.

**The + Feature pop-out is the Manager's split, searchable**: a search box at
the top filters by household or world name, **My Households** listed first
and **Rest of Town** folded to a count row until opened — searching looks
through both. Within each group, households with portraits list first.

**Photos are ready before the audience arrives**: the server makes the CDN's
sized photo copies itself — when a showcase goes Live, when a photo or avatar
is uploaded, and on every deploy for all live showcases — so a first-time
visitor is never the one waiting on them.

**How much can be featured**: **12 households** for the save, and **6 lots per
world** — hard maximums, not just how many get drawn. At the maximum the add
is refused and the **+ Feature** tile's pop-out says *"You have already
featured 12 households."* (the tile itself is unchanged — being full is
something the pop-out reports, like having nothing left to offer). Nothing is
ever pushed off the page to make room for a new pick.

Featuring never *removes* anything from view either. A front-page chapter
shows **3 of its lot photos on its own**, and featuring grows that row one
slot at a time up to 6 — so featuring a lot adds it to the row rather than
hiding the rest. **Featuring decides what is in the row; dragging decides the
order.** Every thumb drags anywhere in the row, featured or not, and a drag
moves the lot in the world's own lot order (the same order the world page's
grid drag writes) — so it never features anything by accident, and never
leaves a thumb that cannot move.

**Uploads go straight to your files** — the cover picker's **Your photo**,
the world hero's **Upload a photo** chip and the chapter lead's **Upload**
chip all open the system file dialog and upload on the spot; there is no
picker of already-added photos anywhere on the page. There is no tagline
field — the save has one name and one description.

**A lead is only offered when it has something to show**: *Your photo* needs a
world photo — and the showcase's **Upload chip is the only place a world
photo comes from** (the planner's built-photo flows target lots and
households; the Photos page's world assignment is inspo, which never reaches
the showcase). Either collage needs at least two of its own pictures. **Auto
map and Upload always show**, so the row reads the same on every world.
A showcase upload slot holds ONE photo: uploading a new world hero or cover
photo **replaces the previous upload, which is deleted** — these photos exist
nowhere else in the planner, so a kept-around old one would be invisible dead
weight with no place to remove it. Only the auto map carries a corner tag —
it marks the one lead the creator hasn't authored; collages and photos are
their own content and go unlabelled.

## What it will not do

- **Show plans.** No purple values, no goals, no planned moves — the page
  describes the file you can download, not the file it might become.
- **Individual sim pages.** Households are the smallest unit; sim-assigned
  photos are excluded from the payload.
- **Host the `.save`.** Download is always the creator's own external link
  (Patreon, Sims FileShare, Drive…).
- **A separate world URL.** You can't link a world, only the save.
- **Free an old slug.** Even a save renamed years ago keeps its old links
  working; a new save reusing the old name gets a numbered slug.
