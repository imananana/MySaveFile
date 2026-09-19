# Inspo

**Routes** `/saves/:saveFileId/photos` (the pool) ·
`/saves/:saveFileId/world/:worldName/inspo` (a world's board) ·
**Tier** 1 ·
**Requires** no pack ·
**Polish** the pool and the world board are shippable and photograph well. The
lot editor's **Inspo Photos** section is rougher, and consistent with the
**Showcase Photos** section beside it rather than with the rest of the app: its
**Pick** dialog puts a grid of tiles on a white body where the app tints, uses its
own empty state instead of the shared one, and hangs a typed ✕ on each thumbnail.
Its two section headings are both purple, so **Showcase Photos** reads plum there
while the world page gives Showcase the green it takes everywhere else ·
**Verified** 2026-08-12 by reading every file for this surface end to end —
`Photos.tsx`, `WorldInspo.tsx`, `lotEdit/InspoPhotoSection.tsx`, the store and
API (`api.ts`, `photoUpload.ts`, `usePlannableWorlds.ts`, the server's
`photos.ts` routes and the `photos` / `photo_assignments` / `photo_exclusions` /
`inspo_tags` tables), the sync-adjacent code (`lotMatching.ts`, `GameReimport`,
and the save copy/reset/export helpers in `saveFiles.ts`) — plus driving the
pool, a world's board, the pool drawer and the lot picker in the running app.
Every mutation was undone and the pool's state fingerprinted before and after.

> **Two things about inspo are unlike everything else in the app.**
> **The pool is one library for your whole account**, not a per-save folder — the
> same photo is available in every save you own. And **filing a photo is a tag,
> not a move**: nothing ever leaves the pool, so a photo can sit on Newcrest's
> board in one save and Willow Creek's in another. Almost every surprise on this
> surface follows from those two facts.

## Why it exists

Planning a save usually starts before any of it is playable: a folder of
screenshots, Pinterest saves, build references and floor plans, with no idea yet
which world any of it belongs to. Inspo is where that pile lives and where it
gets decided. You upload once, tag it in your own words, then send each photo to
the world you're planning it for — and each world grows a moodboard you can open
while you build.

## What you see

### The pool — `/photos`, "Inspo Pool" in the sidebar

**Browsing**, with nothing selected: one toolbar line holding the title, a purple
count, the **Tags** filter, **Show N hidden**, and **Upload Photos**. Below it,
the whole library as a masonry wall that keeps each photo's own shape. A photo
that's been filed carries the name of its world — or its lot — in a gradient
strip along the bottom edge.

With no photos at all: *"No inspo photos yet"* and an upload button. With filters
that match nothing: *"No photos match these filters"* and **Clear filters**.

**Working**, once you click a photo — three columns:

| Column | Holds |
|---|---|
| Left | the pool, narrowed to a 2-up strip of squares |
| Middle | **Back to pool**, a *N / M* position, the photo on a soft letterbox with arrows sitting on the image, the tag row, and one quiet line: where it's filed, then hide and delete |
| Right | **Click a world to assign** |

The world column is the working end. Under the heading is a single hint slot
that says one thing at a time — the undo for what you just did, *"**Enter** sends
to <world>"*, or *"The last world you use gets bound to Enter."* Then the worlds
themselves: any that already hold photos float up under **Recent**, the rest sit
under **All worlds** in release order. Each row carries a permanent send arrow,
and a count that expands into a 3-up preview of what's already filed there. When
a world is live, a **Board** link opens its moodboard in a new tab.

On a phone the world column is replaced by a bar at the top of the photo: a world
dropdown and **Assign →**.

**The order of the grid is deliberate and slightly unusual.** Photos you've
already filed sink to the back — but only when you arrive, and again when you
step back out to browsing. While a photo is open you're mid-run, so nothing
moves under you. New uploads go to the front. Applying a tag filter is the one
other moment worked photos re-sort to the back, and clearing the filter puts you
back where you were scrolled to.

### A world's board — `/world/:worldName/inspo`

Reached from the green **Inspo** button on the world page. It borrows that page's
anatomy exactly: a back link, the round world icon, **Inspo** as the title, and
one muted line reading *"<world> · N photos"*. Actions on the right: **Browse
pool** and **Upload**. Then a section rule — **Moodboard**, its count, and the
**Tags** control riding on the rule — and the wall itself. Photos filed to a
specific lot carry a pin and that lot's name at the foot of the tile.

Empty, it says *"Start <world>'s moodboard"* and offers both doors.

Click any photo and it opens **one** full-screen dark view: the world name and
your position along the top, the photo at full size, and one bar underneath
holding everything you can do to it — the tags, a filing button reading either
**Anywhere in <world>** or the lot's name, and **Remove from <world>**.

### Inside a lot

The lot editor has an **Inspo Photos** section that opens by itself when the lot
already has some. It's a scrolling strip of thumbnails with **Pick** and
**Upload** pinned to the left.

## What you can do

**With a photo — in the pool**

- Upload one or many. Anything the browser calls an image, up to **32MB** each;
  bigger files and non-images are refused by name before they upload
- **File it to a world by clicking that world.** One click assigns it *and* moves
  you to the next photo that still needs a home — there's no separate save step
- Press **Enter** to send it to the last world you used, so a run of photos bound
  for one world costs one keypress each
- **Undo** the filing you just did
- Take it off its world (the ✕ beside the world's name)
- **Hide from this save** — it drops out of this save's pool and boards but stays
  in every other save. Hiding advances to the next photo too; un-hiding doesn't
- **Delete everywhere** — the only true removal, and it takes the photo out of
  every save you own. The confirm says so before you click
- Open it full screen, and walk the pile with ← and →

**With tags** — the only metadata an inspo photo carries

- Put any tag from your vocabulary on a photo by clicking its chip
- **Coin a new tag** by typing it. New tags are born on a photo — in the pool's
  detail panel or the board's viewer — never in a filter menu
- Filter the pool by tag. Filtering is strict: **every** selected tag has to be
  on the photo, so "rich" + "residential" narrows rather than widens
- **Manage** the vocabulary from the Tags menu: rename a tag, or delete it.
  Both reach every photo carrying it, in every save. Deleting a tag never
  deletes a photo

**With a world's board**

- **Upload** straight onto the board — new photos are filed to that world as they
  land
- **Browse pool** opens your entire library, not just the unfiled part. Each tile
  says where it currently lives, because clicking one **moves** it: a photo shown
  with another world's name will leave that world. Photos already on this board
  are marked, dimmed and sunk to the back
- Move a photo onto a specific **lot in this world**, or back to **Anywhere in
  <world>** — dropping the lot without taking it off the board
- **Remove from <world>**, which returns it to the unfiled pile
- Filter the board by the tags that are actually on it

**With a lot**

- **Pick** photos for it: this world's board photos first (labelled **World**,
  and *"moves to this lot"*), then the unfiled pool. Multi-select, then **Add**
- **Upload** straight onto the lot
- Unassign one from the strip

A lot's photos also count towards its world — the board shows everything filed
to the world *plus* everything filed to any lot in it.

## What you can't

- **Caption an inspo photo.** Captions were removed; tags replaced them. Showcase
  photos still have captions
- **Credit a gallery creator.** That belongs to showcase photos; the server
  refuses to store one on an inspo upload, so it can never appear here
- **Show inspo publicly.** The public showcase serves showcase photos only —
  nothing in your inspo pool is reachable from a share link
- **File one photo to two places in the same save.** One photo carries one
  filing per save, so choosing a lot replaces the world and vice versa. Different
  saves are independent
- **File a photo to a household or a sim.** Worlds and lots only
- **File a photo to a lot from the pool page.** Lot-level filing lives on the
  world's board and in the lot editor. The pool sends photos to worlds
- **Reach every photo from the lot editor's Pick.** It offers this world's board
  photos and unfiled ones — a photo currently filed to another world or another
  lot won't be listed there. Use the board's **Browse pool** for that
- **Select several photos at once in the pool.** No bulk hide, no bulk delete —
  a cross-save irreversible action behind a fast gesture was decided against
- **Hide a photo from a world's board.** Hiding is a pool action; the board
  simply never shows hidden photos
- **Undo more than the last thing.** The undo is one action deep and clears as
  soon as you move on

## How it relates to sync

**Everything here is yours.** No part of an inspo photo comes from your save —
not the image, not the tags, not the world it's filed to, not whether it's
hidden. There is nothing for a re-sync to mirror, so **a re-sync never reads,
writes, counts or clears any of it.** The sync screen states this while you're
deciding: *"Your notes, photos, inspo and descriptions stay as they are."*

**A lot's photos survive the game being replayed.** A photo filed to a lot
remembers it as *world + the lot's original catalogue name* — and, crucially,
that is **not** what a re-sync matches on. A re-sync identifies each lot in your
save by **EA's own permanent lot id**, falling back to the name only when the id
is missing or when it can't tell two flats in one building apart. So renaming a
lot in-game, bulldozing and rebuilding it, or moving households in and out all
leave its inspo exactly where you filed it.

**Turning a world or a pack off doesn't unfile anything.** The pool's world
column keeps listing a world you've switched off for as long as it still holds
photos, so you can always find those photos and move them.

Because the pool is one account-wide library, the save-management actions behave
differently from everything else:

| Action | What happens to inspo |
|---|---|
| **Delete a save** (to the trash) | Nothing. Its filing is intact and comes back if you restore it |
| **Permanently delete a trashed save** | That save's filing and hidden marks go. **The photos stay in your pool** |
| **Duplicate a save** | The copy inherits the same filing. The photos aren't duplicated — both saves point at the one library |
| **Reset a save** | Lots are wiped and re-seeded under the same identities, so lot-filed inspo comes back filed to the same lots. Save settings says as much: *"inspo photos are kept"* |
| **Download a backup** (`.s4plan`) | It carries every photo filed into that save, with its filing and hidden marks |
| **Restore a backup** | The photos are recreated in the restoring account's own pool. Restoring into a second account gives that account its own copies, not shared ones |

## Needs confirming

- **A photo's filing key is built from a lot's name in our own world catalogue**,
  so renaming a seeded lot would leave photos filed to it holding a key nothing
  answers to — off the board, still in the pool, with no repair. Nothing is in
  that state, and a rename can't reach production quietly: every lot carries a map
  pin keyed by the same name, so the seed-consistency test fails and says what a
  migration would have to rewrite. It stays an open item because the migration
  doesn't exist — only the warning does.
- **A photo is stored once and delivered at the size it is drawn.** Uploads are
  downscaled to a 2560px long edge and stored as a single JPEG. Grids, strips and
  portraits request a resized copy of that file from the CDN — a pool tile asks
  for 300px, an avatar for 96px — and only a full-screen view loads the stored
  file itself. WebP or AVIF is served to browsers that accept it. A pool tile
  transfers roughly a tenth of what the stored file weighs.
- **Nothing caps how fast an account can upload.** The size of a library isn't the
  exposure: a processed photo is ~200KB typical (~500KB average with legacy
  originals), storage costs us nothing up to 10GB — roughly **35,000 photos** — and
  $0.015 per GB-month after, so a 2,000-photo library costs about **a penny a
  month**, with no egress charges and well inside the free request allowance. The
  open question is abuse, not cost, which makes the guard worth having a rate
  limit rather than a total.
