# Mods & CC

**Route** `/saves/:saveFileId/mods` · sidebar, under **MANAGE** ·
**Tier** 2 ·
**Requires** no pack ·
**Desktop only** — narrow screens with a coarse pointer get the "come back on a
computer" gate ·
**Polish** shippable; the two-rail layout is the app's only one and it holds up ·
**Verified** 2026-08-13 by reading every file for this surface end to end —
`ModManager.tsx`, the store slice and API (`useSaveFile.ts`, `api.ts`,
`server/src/routes/mods.ts`, `schema.sql`), the URL sanitisers on both sides
(`server/src/lib/safeUrl.ts`, `src/lib/url.ts`), and the save-file routes that
decide what a backup, a duplicate and a reset carry — and by driving it: opening
a mod, the Links pop-out, hiding a mod from a save and putting it back,
duplicating a save twice to confirm the list doesn't multiply, and restoring a
`.s4plan` into a second account twice over (four entries arrive the first time,
none the second).

## Why it exists

A save that needs mods is not portable without a list of them. Somebody who
downloads your world and doesn't install the poses, the sliders or the gameplay
mod you built around gets a broken version of what you made — and the list is
usually scattered across a Patreon tab, a Tumblr post and your memory. This page
is the list: what the save needs, what merely improves it, and where each one
came from.

It is the one page here that has nothing to do with your `.save` file. Nothing
in a Sims save records which mods are installed, so every row is one you typed.

## What you see

**Two rails side by side**, and they are the page's whole structure: **Mods** in
green and **Custom Content** in plum. Each has its own **New** button, its own
**Links** button, and its own search box.

**A card per entry**, sorted by name: the name (or *Unnamed*), a pill reading
**REQUIRED** in red or **RECOMMENDED** in grey, and a small chain icon when the
entry has a link. Entries hidden from this save sit under a collapsed **Hidden
(N)** strip at the foot of the rail and render faded.

**With nothing selected**, the right-hand side shows **Mods at a glance** — three
tiles: the number of mods, the number of CC, and how many are **Required**.

**With an entry selected**, the right-hand side is its editor: the name as a
large heading, **Link / URL** with an **Open** button beside it, a **Type**
toggle (Mod · Custom Content), an **Importance** toggle (Required · Recommended),
**Notes**, and below a rule, **Hide from this save** and **Delete**.

**Links** opens a panel over the rail listing every entry in that rail that has a
URL, each opening in a new tab.

**On a first visit with nothing tracked**, a single empty state offers **+ Mod**
and **+ CC**.

## What you can do

### One entry

- **Create one** with **New**. It appears immediately as *Unnamed* and selected,
  ready to type into — nothing is staged, so an abandoned one stays on the list.
- **Name it**, **link it**, and **write notes** about it. Each field saves when
  you leave it.
- **Mark it Required or Recommended.** Required is the flag that means the save
  doesn't work properly without it.
- **Move it between Mods and Custom Content** with the Type toggle, which moves
  the card to the other rail.
- **Delete it.** The confirmation says what it means: it goes from every save,
  not just the one you're in.

### The list

- **Search either rail** by name. Each rail searches independently.
- **Open every link in one place** with the **Links** panel.
- **Walk the list from the keyboard** — the arrow keys move through Mods and then
  Custom Content as a single list.

### Per save

- **Hide an entry from this save** without deleting it, and show it again later.
  This is the only thing on the page that belongs to the save you're in.

## What you can't

- **Import your mods folder, or detect anything automatically.** No part of this
  is read from your computer or your `.save`; every row is typed by hand.
- **Keep separate lists per save.** One list belongs to your account and appears
  in every save; hiding is the only per-save control.
- **Delete an entry from just one save.** Delete removes it everywhere — hiding
  is the per-save action.
- **Record a version, an author, a file name, or a load order.**
- **Group, tag or sort them** — sorting is alphabetical, and the only grouping is
  the Mod / CC split.
- **Attach a picture**, unlike inspo photos.
- **Show your list to anyone.** It appears on no public page and in no showcase.
- **Mark one as required for a specific household or lot.** The flag is about the
  save as a whole.

## How it relates to sync

**Nothing here syncs, and no sync touches it.** This is the only manager with no
relationship to your `.save` at all: a Sims save records nothing about installed
mods, so there is nothing to mirror, nothing to compare, and nothing to yield.
Syncing a save leaves every row, every flag and every hidden state exactly as it
was, and none of it is ever counted on the sync screen.

**The list outlives the save.** Because it belongs to your account, deleting a
save, resetting a save, or syncing a completely different `.save` file into one
all leave your mods and CC untouched. Deleting a save only drops that save's
hidden marks.

**A backup carries it, and a copy inherits it.** The `.s4plan` from **Download
backup** holds the list — names, links, types, importance, notes — plus which
entries were hidden in that save. Restoring it into an account that doesn't have
them creates them; restoring into one that does adds nothing, because an entry
with the same name and kind is treated as the one you already have. That is what
keeps duplicating a save, or the automatic backup taken before every sync, from
multiplying your list. Duplicating also carries the hidden marks, so a copy
starts out looking like the original rather than showing everything again.

## Limitations

- **An entry with no name isn't in a backup.** The name is what a restore matches
  on, so an *Unnamed* row has nothing to identify it and is left out rather than
  piling up a fresh copy every time a backup is restored.
- **Matching is by name, so a rename reads as a new entry.** Restore an old
  backup after renaming *WickedWhims* to *Wicked Whims* and you get both.
- **A new entry is created before it's named**, so an interrupted click leaves an
  *Unnamed* row on the list that only a delete removes.
- **The Links panel skips hidden entries**, which is right for the save you're in
  and means the panel isn't a complete index of your links.
- **A link is never checked.** A dead Patreon URL looks exactly like a live one
  until somebody clicks it.
