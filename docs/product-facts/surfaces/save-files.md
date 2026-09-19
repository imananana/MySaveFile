# Save files

**Route** `/saves` (the list, and the first thing you see after signing in) ·
`/saves/:id/settings` (one save's settings) · plus the **My Saves** switcher in
the top bar of every planner screen ·
**Tier** 1 ·
**Requires** no pack ·
**Polish** shippable ·
**Verified** 2026-08-12 by reading all three layers whole — the screens
(`SaveFilePicker.tsx`, `SaveSettings.tsx`, `NewSaveChooser.tsx`, `TopBar.tsx`),
the store (`server/src/routes/saveFiles.ts` all 1,043 lines, `trashCleanup.ts`,
the `save_files` schema), and what sync does to them — then driving the list, the
row menu, Deleted & backups, both halves of Save settings, the My Saves dropdown,
both danger-zone confirmations, and **the first-run screen on a freshly registered
account** — the only way to see that screen at all. **Reset was driven end to end
on a throwaway duplicate**: 193 households, 747 sims, 22 clubs, 11 businesses, 6
holidays, 13 dynasties, 7 venues, 6 presets and 18 non-stock lots in; nothing but
402 stock lots out. **Purging was driven on a duplicate holding 176 built photos**,
confirming the original kept all 176 and still served them

> This is the shelf everything else sits on. A save file is the container for one
> plan: worlds, lots, households, sims, photos, notes, the lot. Everything on
> every other screen belongs to exactly one of these.

## Why it exists

You don't play one save. You have a legacy, a build save, a rebuild of the same
world, the one you're making for a video. Each needs its own plan, and each plan
needs to be safe from what you do to the others — which means copies, backups,
deletes you can take back, and a way to move a plan between accounts.

## What you see

**`/saves` — your save files.** A page header, **+ New save**, then one card per
save: its name, and one subtitle — **Synced 4 days ago**, or **Not linked to a
save file**. Recent syncs read *today* / *yesterday* / *N days ago*; past a month
it switches to the date, because "8 months ago" tells you less than *on 12 Aug
2026* does. Each row has one button, **Open**, and a **⋯** menu holding **Sync
from save · Rename · Duplicate · Download backup**, then a rule, then **Delete**
in red. Rows run most-recently-opened first, so the sync dates don't descend —
the order answers *which save was I in?* and the subtitle answers *is it current
with my game?* The list shows five and offers **Show all 29 saves**.

Above all of it, until you confirm your email: a white card with an envelope
medallion — **Verify your email** *— confirm you@example.com to secure your
account.* — and a green **Resend email** button (details on the accounts
sheet).

Below that, a dismissible **note from the builder** (existing accounts only,
never on a first run): what's new, in the builder's own words verbatim —
currently *"New: Try out the Showcase! Make your hard work visible to others.
Edit and customize your showcase, then flip it on so you can send the link to
others. This is an in-depth and easy way to share your save far and wide. If
you have feedback, please reach out! I read everything."* — with an
**Email me** button (iman@mysavefile.com). This card is the note's only home:
the slim one-line version that used to run under the top bar inside the
planner was removed (that slot is reserved for a survey link). The note also
**retires itself on 18 Sep 2026** — after that date it renders for no one,
dismissed or not, deployed or not; each campaign sets its own expiry. The note
only returns when there's something new to say; feedback requests are the one
non-transactional contact the privacy policy allows.

**First run** — an account with no saves gets its own page rather than this one
with an empty list in the middle of it. While the save list is still loading the
page shows only the header and a loader — none of the manager chrome — so a
brand-new account never sees "Your save files" flash for a beat before the
first-run card replaces it.

**Willow Creek fills the screen**, softened under an even cream wash but still
in colour, with its empty white lot outlines showing. The wash is deliberately
flat rather than brightest in the middle: the map stays visible *behind* the
card, which is what gives a white card on a pale ground an edge at all. The card
sits centred in the viewport rather than at the top of the page. That's the point rather
than the decoration: an unplanned save looks exactly like blank plots waiting to
be filled, so the picture and the headline argue for the same thing. It's the
only screen in the app with no content of your own on it yet, which is why the
atmosphere has to come from the game.

A single white card floats over it:

> **Your save, ready to plan.**
> Your saves live in **Documents › Electronic Arts › The Sims 4 › saves**
> **[ Choose your save file ]**
> Read in your browser, never uploaded.
> ─────
> **1** Find your save in your Documents folder.
> **2** MySaveFile will update with your save data.
> **3** Check out your sims, households, and lots in the planner!
> *or plan without a save file*

There is no subtitle, because a feature list shown to someone who just made an
account spends a fact the reveal wants. The headline is a label rather than a
claim — it names the state you'll be in, and it stays off the word *linked*,
which belongs to the moment that's actually true. One breadcrumb covers both platforms —
the Windows `C:\Users\[you]\Documents\` prefix is dropped, since every file
dialog opens in Documents anyway, and it was both the ugliest thing on the old
screen and the part nobody needs. **Exactly one control is green**: the button.
The privacy line is grey, because green means *putting content in* and a
sentence isn't a button.

**Under a rule, three numbered lines say what happens next, in the builder's
own words** — find your save, MySaveFile updates with it, and your own sims,
households, and lots are there in the planner. They sit below the button
rather than on a screen before it, so the person who already knows what
they're doing never waits behind a lesson. The step numbers alternate the
app's two colours as soft green and purple tints.

**Choosing the file opens the OS dialog directly** — no intermediate modal
teaching folder paths and then asking you to press a second button to do the
thing you already asked for. The file goes straight to **Everything in this
save**.

**On Chrome and Edge the dialog is aimed at your saves folder**, and stays
aimed. All three doors into a `.save` — this one, the import modal and the sync
modal — share one dialog identity, and the browser remembers a folder per
identity. So the first pick teaches it where your saves are and every pick after
opens there. The point isn't the first time: it's that this dialog's memory is
now separate from every other file dialog in the app, and the shared one used to
drift to wherever you last grabbed a photo from. Before the first pick it starts
at Documents, which is as close as a browser can be aimed — a path can't be
named.

**It never remembers the file itself**, only the folder. Save As is normal, and
so is keeping several saves on the go, so which file you're syncing stays a
choice you make every time.

Firefox and Safari have no such dialog and get the plain file input, which
behaves exactly as it always has.

**Start blank is a link, not a second door**, and it answers the question a
save-less person is actually asking — *can I use this without a save?* — rather
than naming a mode.

**No verify-email notice on this screen at all.** It's an account chore, and it
was the loudest thing on the one page that should be about the save you're about
to make; it leads on `/saves` the moment you have one. **Deleted & backups**
appears only once there is something in it — an account that has never deleted
anything isn't offered a way to restore.

**New save file** (the modal behind **+ New save**). Two doors: **Import from a
Sims 4 save** — green, with an icon, *Pulls in your lots, households and sims
automatically* — and the quieter **Start blank**, *Plan by hand now, link a save
file any time later*. Importing leads on purpose. From `/saves`, Start blank
opens a name field; from the top bar it creates a save called **New Save**
immediately and takes you there.

**Deleted & backups (13)**, collapsed at the bottom. Each row says which kind it
is and how long it has: **You deleted this · gone in 26 days**, or **Backed up
before a sync · gone in 4 days**, with **Restore** and **Delete forever**. Empty,
it says so. Underneath sits the rare one: **Restore a downloaded save**, for a
file you exported from a save's settings.

**Save settings** (`/saves/:id/settings`, from the account menu → Settings).
Cards, in order: **Linked save file** — *Synced 4 days ago*, the filename in
mono, the save's own name, and a green **Sync** — or, when nothing is linked,
**Link a .save file…**. Then **Name**, **Description** (*What's this save about?
Shown on your public showcase*), **Save file link** (paste a Patreon/Drive URL
and a Download button appears on your showcase), **Showcase** (**Open your
showcase** — the save's public page; going Live and copying the link happen on
that page's edit bar, see the showcase sheet), **Advanced** (**Pack ownership**,
**Download backup** — *Your whole plan and every photo, in one .s4plan file*),
and a red-bordered **Danger zone**: *Both of these keep a copy in Deleted &
backups first*, then **Reset planner data** and **Delete this save**, each with
a line saying exactly what it takes and what it leaves.

**The top bar**, on every planner screen: the save's name, a green **Sync · 4
days ago** chip (or **Import save** when it isn't linked), **My Saves**, and the
account menu. **My Saves** opens **Manage saves →** at the top, then up to six
recent saves — the current one tinted green, each with a sync and a rename
button on hover — and **New save** at the bottom.

## What you can do

**With the list**

- Open a save, or switch to it from anywhere via **My Saves**
- Create one: import a `.save`, or start blank
- See at a glance which saves are current with your game and which were never
  linked

**With one save**

- **Rename** it — from the row, the switcher, Save settings, or the title on
  its showcase cover; all of them write the same field, and every screen
  showing that name updates at once, in this tab and in any other tab that
  has the save open
- **Duplicate** it. A full copy: lots, households, sims and their skills, the
  family tree, clubs, businesses, holidays, dynasties, custom venues and presets,
  and every built photo. It's named **{name} (copy)** and it keeps the `.save`
  linkage, so the copy can sync from the same game save. Mods and CC are your
  account's rather than the save's, so the copy simply shares them — including
  which of them you'd hidden.
- **Download backup** — a `.s4plan` file (a zip: your whole plan as data, plus
  every image it shows, plus your mods and CC list). This is the one way to move
  a plan to another account.
- **Delete** it — recoverable for 30 days
- **Sync from save** without opening it first (the row menu and the switcher both
  take you in and open the sync modal)

**With a save's settings**

- Write a description, and paste a public download link for the `.save` itself
- Jump to the save's showcase (its public page — Live on/off and the link live
  on that page, not here)
- Override which packs the planner thinks you own
- **Reset planner data** — every lot back to its stock name and type, and
  everything you've planned deleted: households, sims, clubs, businesses,
  holidays, dynasties, custom venues, venue presets, the family tree. The save
  itself stays, with its name, description, showcase settings, `.save` link and
  photos. A full backup goes to Deleted & backups first.
- Delete the save — recoverable for 30 days, same as from the list

**With backups and deleted saves**

- **Restore** anything in Deleted & backups — including the automatic backup
  taken before a sync, which comes back as a working save that still knows its
  `.save` file
- **Delete forever** — the only permanent delete you can perform yourself; the
  only other one is retention running out
- **Restore a downloaded save** from a `.s4plan` (or an older `.json`) — it
  arrives as **{name} (Imported)**

## What you can't

- **Have a save with no lots.** Every save is seeded with all 402 lots at
  creation, whether you import, start blank, duplicate or restore.
- **Undo a rename, a duplicate, or a restore.** They need no undo; nothing is
  lost by any of them.
- **Recover a save you deleted forever**, or one whose 30 days ran out. Retention
  is enforced by the server, on boot and then daily: **auto-backups 7 days, saves
  you deleted 30 days**.
- **Share a deleted save.** A public `/s/…` showcase link stops resolving the
  moment the save is in the trash, and works again if you restore it.
- **See which save a copy came from.** The copy's origin is recorded and never
  shown anywhere.
- **Import a `.save` on a phone.** The list, the switcher and settings are all
  fine on mobile; the import and sync flows swap to a "continue on desktop" sheet
  because the file lives on your computer.

## How it relates to sync

**A save file is what a `.save` gets linked to**, and the link is one field:
the filename, plus the save's own name, plus when it was last synced. A save
created by importing starts life linked, with its sync clock running from
creation; a blank one has no link until you use **Link a .save file**, which is
re-sync's first-link path.

**Only the sync date is shown, ever.** The other date the database keeps —
last updated — is bumped by every edit *and* by the sync itself, so it's always
equal to or later than the sync and can only mean "I've planned since". It tells
you nothing you'd come here for.

**Every re-sync re-stamps the link**, so an in-game *Save As* (which mints a new
slot number) doesn't leave the plan pointing at a file you no longer use.

**A sync backs the whole plan up first.** That backup is a real save parked in
Deleted & backups for 7 days, named **Auto-backup — {name} — {date}**. Resetting
does the same, as **Auto-backup before reset — …**. Both are full, faithful
copies, which is why restoring one gives you a working save rather than a
fragment.

**Copies keep the linkage.** A duplicate — and a `.s4plan` restore — carries the
filename, the save's name and the last-synced date, so both copies of a plan can
sync from the same game save independently. Restoring into a *different* account
also carries it: that account can sync the plan against its own copy of the
`.save`.

**A restore into another account gets its own copies of the photos.** The images
inside the `.s4plan` are re-uploaded under the importing account, so nothing is
shared back to the original owner. Any image missing from storage is dropped from
the bundle rather than restored broken.

**A restore brings the mods list too, without duplicating it.** An entry the
restoring account already has — same name, same kind — is treated as the one it
has; only genuinely new ones are created. That matters because the same machinery
runs on every duplicate and on the automatic backup before every sync, so
restoring twice, or syncing a hundred times, never multiplies the list. An entry
with no name is left out: the name is what the match is made on.

**Resetting keeps the link, the settings and your photos**, and clears everything
else. It does not unlink the save, so the next sync brings everything from your
save straight back in — which is what makes reset survivable: for a linked save it is
closer to "start this plan again from the game" than to a delete.

**A restored plan is unrestricted until that account syncs a save of its own.**
Which packs you own is recorded on the account, not in the plan, and until some
save has been imported every pack reads as owned — so a `.s4plan` restored into a
fresh account offers the whole library. Once that account reads a real `.save`, the
offers narrow to what its own game has, and they only ever widen from there: the
detected set is a union across every import. Nothing in the restored plan is at
risk either way, because pack gating limits what you can **add** and never what
already exists.

**A permanent delete takes the save's photos with it.** Both permanent paths —
**Delete forever**, and the retention sweep when the 7 or 30 days run out — remove
the save's built photos as well as the save. An image itself only leaves storage
once no photo row anywhere still references it, so purging a duplicate or a backup
never breaks the original it shares its images with. Your Inspo library is
untouched by any of it: those photos belong to the account.
