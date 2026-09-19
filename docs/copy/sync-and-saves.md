# Copy sheet — sync, re-sync and save management

Every user-visible string on the save-management and sync screens, as it stands
in the code on **2026-08-12**. Pulled from the components listed under each
heading, not from memory.

## How to use this

Reply with only the lines you want changed:

```
SYNC-04 → Here's what your game got up to
LIST-03 → Last pulled in 3 days ago
```

Leave everything else alone. IDs are stable — they'll survive later revisions of
this file, so you can come back to a half-finished pass.

**Notation.** `{n}` is a number, `{time}` a phrase like "3 days ago", `{label}`
a concept name (households, sims, lots…), `{file}` a filename. Anything in
`[square brackets]` is a note from me, not copy.

**Locked, not open to rewrite** — flagged `[FACT]`. These are folder paths and
retention periods where a nicer sentence would make it wrong.

---

## LIST — the save list
`src/pages/SaveFilePicker.tsx`

| ID | Where | Copy |
|---|---|---|
| LIST-01 | Page title | Your save files |
| LIST-02 | Primary button | + New save |
| LIST-03 | Row subtitle, linked save | Synced {time} |
| LIST-04 | Row subtitle, never linked | Not linked to a save file |
| LIST-05 | Row button | Open |
| LIST-06 | Row menu | Sync from save |
| LIST-07 | Row menu | Rename |
| LIST-08 | Row menu | Duplicate |
| LIST-09 | Row menu, while working | Duplicating… |
| LIST-10 | Row menu | Download backup |
| LIST-11 | Row menu, separated below a rule | Delete |
| LIST-12 | Expander | Show all {n} saves |
| LIST-13 | Expander, when open | Show fewer |
| LIST-14 | Relative time, same day | today |
| LIST-15 | Relative time, one day | yesterday |
| LIST-16 | Relative time, under a month | {n} days ago |
| LIST-17 | Relative time, over a month | on {date} |

## TRASH — deleted saves and backups
`src/pages/SaveFilePicker.tsx`

| ID | Where | Copy |
|---|---|---|
| TRASH-01 | Section header | Deleted & backups ({n}) |
| TRASH-02 | Row subtitle, user deleted | You deleted this · gone in {n} days |
| TRASH-03 | Row subtitle, automatic backup | Backed up before a sync · gone in {n} days |
| TRASH-04 | Row action | Restore |
| TRASH-05 | Row action | Delete forever |

`[FACT]` Retention is **30 days** for saves you delete and **7 days** for
automatic pre-sync backups. Don't round these off.

## IMPORT — choosing a file
`src/components/GameImport.tsx`

| ID | Where | Copy |
|---|---|---|
| IMP-01 | Modal title | Import from Sims 4 save |
| IMP-02 | Path block label | Where your saves live |
| IMP-03 | Platform label | Windows |
| IMP-04 | Platform label | Mac |
| IMP-05 | Privacy note | Your save file is read **locally in your browser** — the raw file is never uploaded. Only the extracted records (lots, sims, households) are sent to the planner's server. |
| IMP-06 | Cancel | Cancel |
| IMP-07 | Primary button | Choose save file |

`[FACT]` The paths, exactly:
- Windows — `C:\Users\[Your Username]\Documents\Electronic Arts\The Sims 4\saves`
- Mac — `Documents/Electronic Arts/The Sims 4/saves`

`[FACT]` **Never add advice about which file to pick.** Save numbers do not run
in a dependable order. IMP-05 is also a data-safety claim — it must stay
literally true, so check with me before touching it.

## IMPREV — reviewing what's about to come in
`src/components/GameImport.tsx`

| ID | Where | Copy |
|---|---|---|
| IMPREV-01 | Modal title | Review import |
| IMPREV-02 | Field label | Save name |
| IMPREV-03 | Counts line | **{n} households · {n} sims** coming in |
| IMPREV-04 | Under the counts | Everything in this save is imported. Townies and premades tuck into Rest of Town — pin the ones you care about. |
| IMPREV-05 | Empty | No households found in this save file. |
| IMPREV-06 | Primary button | Import {n} households |

## SYNC — re-syncing from your save
`src/components/GameReimport.tsx`

| ID | Where | Copy |
|---|---|---|
| SYNC-01 | Modal title | Sync from your save |
| SYNC-02 | Subtitle, while choosing | Bring your plan up to date with the latest from your save. |
| SYNC-03 | Subtitle, on the review | Your notes, photos, inspo and descriptions stay as they are. |
| SYNC-04 | Heading above the counts | Your save has moved on |
| SYNC-05 | A count row | {n} {label} |
| SYNC-06 | Season change | Seasons are now {label} |
| SYNC-07 | Below the counts | Skills, careers, funds and relationships refresh too. |
| SYNC-08 | Nothing new, line 1 | No new households, sims or lots. |
| SYNC-09 | Nothing new, line 2 | Skills, careers, funds and relationships will still refresh. |
| SYNC-10 | Cancel | Cancel |
| SYNC-11 | Primary button | Sync |
| SYNC-12 | Previously-imported label | Previously imported from |
| SYNC-13 | Different file chosen | This is a different save file. Anything missing from it will be removed. |
| SYNC-14 | Under SYNC-13 | We back up your plan first. |
| SYNC-15 | First time linking | Anything you already built here won't be merged — the save's version comes in alongside it. |
| SYNC-16 | While working | Analyzing… |
| SYNC-17 | While applying | Don't close this window. |

`[FACT]` **SYNC-08 must not become "no changes".** Skills, careers, traits,
funds, relationships and club/business detail are deliberately excluded from the
count, and they refresh anyway — so claiming nothing changed would be false.
That was the old copy and it was wrong.

`[FACT]` The counts are per concept only. Sync applies wholesale; there is
nothing to accept or decline, so copy must never imply a choice.

## DONE — after a save is linked
`src/components/common/FirstImportCelebration.tsx`

| ID | Where | Copy |
|---|---|---|
| DONE-01 | Heading | Your save is linked |
| DONE-02 | Count row | {n} households |
| DONE-03 | Count row | {n} sims |
| DONE-04 | Fallback when counts are unknown | Sync any time to keep your plan up to date as you play. |
| DONE-05 | Button | Let's go |

`[FACT]` Fires **only the first time a save is linked**, never on a routine
re-sync.

## SET — save settings
`src/pages/SaveSettings.tsx`

| ID | Where | Copy |
|---|---|---|
| SET-01 | Page title | Save settings |
| SET-02 | Section, linked | Linked save file |
| SET-03 | Section, not linked | Link a .save file |
| SET-04 | Status | Synced {time} |
| SET-05 | Status, never | Never synced |
| SET-06 | Button | Sync |
| SET-07 | Not linked | Link a .save file to pull in your lots, households and sims. |
| SET-08 | Button, not linked | Link a .save file… |
| SET-09 | Section | Name |
| SET-10 | Section | Description |
| SET-11 | Description placeholder | What's this save about? Shown on your public showcase. |
| SET-12 | Section | Save file link |
| SET-13 | Section subtitle | Paste a public link — Patreon, Sims FileShare, Google Drive — and a Download button appears on your showcase. |
| SET-14 | Field label | Download URL |

---

## Two notes on the shape, not the words

**Subtitles under headings are mostly gone.** SET-13 survives because it
describes a consequence you can't see from the field — that a button appears on
a different page. If a rewrite makes a heading explain itself again, that's the
pattern we removed.

**Nothing in the sync flow asks a question** except which file to open. If a
line reads as though the user has a decision to make, it's wrong regardless of
how it's worded.

## Still to build

The **first-run screen** — what someone sees at `/saves` before they have any
saves. Structure is agreed; the headline and supporting line are yours and
marketing's, so it has no IDs here yet.
