# Admin dashboard

Status: **built.** Owner-facing only — one admin (Iman), read-mostly, internal
tool. The design bar is "clear and honest", not "showcase-polished", but it
still uses the ui-grammar tokens and the shared control family (no native
`<select>`).

Lives at `/admin` (`src/pages/admin/`), served by `/api/admin`
(`server/src/routes/admin.ts`).

## Why this exists

Prod has ~112 real users, and before this the only windows into them were
Sentry (errors) and raw SQL. The owner needs to answer, without asking a
developer:

- How many people are here, and is that growing?
- Who actually *uses* it vs signed up and bounced?
- Where in the journey do people drop off? (the funnel)
- Which features earn their keep?
- Did an import fail for someone? (a failed import used to be **invisible**
  unless Sentry happened to catch it — the user just left)

## Ground rules (read before building)

- **Gating**: `ADMIN_EMAILS` env var (comma-separated, lower-cased compare
  against `users.email`). New `server/src/routes/admin.ts` mounted at
  `/api/admin`, every route behind the existing auth middleware + an
  `requireAdmin` check. Non-admins get a plain 404 (indistinguishable from
  the route not existing). Frontend route `/admin` — top-level, **outside**
  `PlannerApp` (the `/saves/:saveFileId` prefix rule doesn't apply), link it
  nowhere; the owner types the URL.
- **Read-only against user data.** Admin endpoints run SELECTs and aggregate.
  No admin route mutates user rows in v1 (the ops/repair dashboard is a later,
  separate decision).
- **Our own accounts are not users.** The owner's address and anything at
  `@mysavefile.com` (tutorial-recording accounts, demo logins, throwaways) are
  excluded from every statistic: the tiles, the funnel, the weekly trends,
  adoption, usage, packs, photos, failed imports and who's-online. At a few
  hundred users one owner account recording a tutorial moves every rate on the
  page. The predicate lives once, in `admin.ts` (`OURS`); to add an account,
  give it an `@mysavefile.com` address rather than editing code. The owner's
  address is never written in the source: it is read from `INTERNAL_EMAIL`,
  which falls back to `ADMIN_EMAILS` when unset — whoever may read the dashboard
  is not one of the users it measures. Plus-addressed
  variants of the owner's address count too (`owner+take3@gmail.com`), since
  that is how a signup demo gets recorded six times. Two deliberate exceptions,
  both in the "What's in it" section below: the user table and showcase views.
- **No third parties.** Emails and counts stay on our server. No analytics
  SaaS, no external charting service — chart with whatever the repo already
  renders (plain SVG is fine).
- **After any git operation, verify `server/src/index.ts` still mounts
  `photosRouter`** (it has silently lost that mount before). Stage explicit
  paths; never `git add .`.
- Dev DB is junk data — selftest against dev and expect the numbers to be
  nonsense locally. `[no-facts]` applies to admin-only commits: no user can see
  this surface. The logging hooks in the import/sync path are strictly
  additive and change nothing a player experiences.

## The page (one screen, four zones)

### Zone 1 — topline tiles (this week at a glance)
| Tile | Source |
|---|---|
| Total accounts | `count(users)` |
| New this week (vs last week) | `users.created_at` |
| Active this week | distinct users with `max(save_files.last_opened_at)` in last 7d |
| **Online right now** | users with `last_opened_at`/`updated_at` in the last 15 min — her explicit ask: a safe-to-deploy check. Make this tile self-refresh, and show *who* (names) on hover/expand, not just a number |
| Live showcases | `count(save_files where showcase_live)` |
| DB size | `pg_database_size` — she watches the Railway volume; this ends the guessing |
| Imports & syncs this week (n ok / n failed) | `import_events`; the tile hides until the table has a row |

"Active" = opened a save. A user with zero saves can never look active; that's
correct — they bounced.

### Zone 2 — the funnel
Of everyone who ever signed up, how many reached each stage (count + %):

1. **Signed up** — `users`
2. **Verified email** — `email_verified` (Google users auto-count)
3. **Has a save** — any non-deleted `save_files` row
4. **Imported their real game** — `source_save_filename IS NOT NULL`
5. **Came back and synced again** — `last_synced_at` > 24h after the save's
   `created_at`. Stays a proxy on purpose — see the decisions below
6. **Published a showcase** — `showcase_live = TRUE`

Stage 5 is the product's whole thesis (the planner survives contact with the
real save), so its drop-off number is the single most important thing on the
page. Render the funnel as bars with the % drop between stages labeled.

Also show the same funnel **filtered to users who signed up in the last 30
days** next to the all-time one — all-time hides whether recent changes
helped.

### Zone 3 — trends
- Signups per week (line/bar, last ~12 weeks) — `users.created_at`
- Active users per week — `save_files.last_opened_at` bucketed weekly
- Imports per week and syncs per week — both hidden until `import_events` has
  a row, since the weeks before logging shipped are empty rather than quiet

### Zone 4 — the user table (drill-down)
One row per user, sortable, newest first by default:

- display name + email, signup date, verified?
- last seen (`max(last_opened_at)` across their saves)
- # saves / # with a real import / last sync date
- rough size of their world (total sims across saves — a cheap "how invested
  are they" signal)
- showcase live? (link straight to the public `/s/<slug>`)
- inspo / showcase / portrait counts, each its own sortable column

★ **This table is the one place our own accounts survive**, each marked with an
`OURS` pill, so the owner can still open her own row and look at her saves —
losing that to tidy a count would trade a tool for a cosmetic. The heading
carries two counts for the same reason: the plain one is real users (and so
agrees with the Accounts tile), and `+N ours` sits beside it rather than
folding in and silently disagreeing.

Clicking a row expands to their save list (name, created, last synced, sims /
households / lots counts, trash status). Read-only. Sorting by last seen /
sim count doubles as her "most-active saves" view — no separate widget.

### Below the fold — feature + content stats (informs roadmap)
- What their saves had in them: % of imported saves with ≥1 club / dynasty /
  small business / import-sourced custom venue. Answers "which parsers earned
  their keep" — it is about the save file, not about the person.
- What people do in the planner: % of people with a save who have uploaded
  inspo, coined a tag, added showcase photos, synced portraits, planned or
  built a lot, made a household, used the randomizer, edited a household,
  edited a sim, built a venue, edited a holiday. ONE list — the logged
  buttons ride on the rows they belong to as a "N this week" figure rather
  than forming a second card of duplicate labels.
- Pack popularity: aggregate `users.pack_ownership` + `save_files.
  detected_packs` into a ranked pack list. Directly feeds pack-gating
  priorities.
- Photos: inspo and showcase counts (portraits excluded), how many people
  upload at all, largest single library, and portraits synced separately.
  (Byte totals need the unbuilt `photos.bytes` item.)
- Showcase views: per live showcase, over 7 days / 30 days / all time. ★ The
  second exception to the exclusion rule — our own showcases stay listed,
  because these are views BY visitors rather than activity by us, and dropping
  the owner's page would hide the most-viewed page on the site.
- Trash: # soft-deleted saves, # auto-backups currently held.

## What's in it

1. **The gate** — `requireAdmin` (`server/src/middleware/requireAdmin.ts`)
   reads `ADMIN_EMAILS` and answers every failure — no cookie, bad token,
   unknown user, wrong address — with the same plain 404. It deliberately does
   NOT sit behind `requireAuth`: a 401 would tell an anonymous prober the route
   exists and only the key is missing. `/admin` mirrors that, rendering what
   any unknown URL renders. `GET /api/admin/ping` is the page's cheap gate, so
   the chrome and the "nothing here" decision land before the statistics do.
2. **`GET /api/admin/overview`** — zones 1–3 plus the failures list, in one
   blob. `GET /api/admin/online` backs the self-refreshing tile (30s).
3. **`GET /api/admin/users`** — the table with each user's saves nested, so a
   sort costs nothing and expanding a row is instant. `GET /api/admin/stats` —
   adoption, packs, photos, trash, showcase views.
4. **`import_events`** — written by `POST /api/import-events`, which the
   browser calls at the end of every import and re-sync attempt. Hooked at
   every exit in `GameImport.tsx` and `GameReimport.tsx`: both wrong-file
   paths, the parse and analyze throws, the duplicate-first and pre-apply
   backup bail-outs, and both apply outcomes. `api.logImportEvent` returns
   void and swallows everything — nothing awaits it.
5. **`showcase_views`** — a slug/day/count tally incremented on the public
   payload fetch. No IP, no user agent, no visitor identity.
6. **`feature_events`** — a user/feature/day tally for the handful of actions
   the database cannot infer. Written by `POST /api/feature-events` against a
   fixed whitelist (`TRACKED_FEATURES` in the route). Currently:
   `randomizer_save`, `portrait_sync`, `lot_status`, `inspo_upload`,
   `tag_created`. Like the import log, `api.logFeatureEvent` returns void and
   swallows everything.

The plan's item 6 (`photos.bytes`) was not built. Per-user photo COUNTS are on
the user table; byte totals still need the column plus an R2 backfill.

## Two things the dashboard deliberately cannot tell you

- **How often someone comes back.** Nothing counts visits: `last_opened_at` is
  a single timestamp that gets overwritten, so "last seen" is all there is.
  Answering it needs either a days-active table or an open counter, and the
  decision was to leave it rather than add tracking for it. Until then, do not
  read a recent "last seen" as a regular user.
- **How much of anything is the randomizer.** It saves a household with
  `provenance='yours'`, `provenanceSub='built'`, `sourceId=null` — byte for
  byte what the Create Household modal writes. `feature_events` answers it
  going forward; nothing can answer it for the past.

## Decisions taken during the build

- **`import_events.save_file_id` is not a foreign key.** A failure can happen
  before any save exists, and cascading on save deletion would erase the
  evidence that the import ever happened — the exact history the table is for.
  The route stores an unowned or unknown id as NULL rather than refusing the
  row.
- **Wrong-file picks are logged as failures.** Someone picking a `.package`
  three times running is a picker problem, not a parser one, and that is only
  visible if the misses sit next to the crashes.
- **A partial-failure sync stays `ok = true`.** It completed and the plan is
  coherent; filing it beside syncs that never landed would blur two different
  problems. The failure count rides in `error_summary` instead.
- **Funnel stage 5 stays on the `last_synced_at` proxy**, rather than moving to
  the event count as the plan anticipated. The events only cover from the day
  logging shipped; switching would crash the number and hide every re-sync
  before that. The stage carries a note saying it's a proxy.
- **The funnel stages are not nested.** Verifying an email is a nudge, not a
  gate, so a later stage can legitimately be larger than an earlier one and the
  drop reads positive. Counting each stage only among those who reached the one
  above would hide that.
- **Pack popularity is two rankings, never one.** Owned is what a person
  installed; used is what their saves reference. A pack can be owned by
  everyone and used by nobody, and that gap is the whole signal.
- **Sims count the roster** (`record_status = 'active'`) and **lots count
  planned-or-built**. Raw counts would treble for anyone who ran a genealogy
  walk, and would be the same ~500 seeded lots for everyone.
- **Showcase views aggregate through `showcase_slugs`**, so renaming a save
  doesn't reset its creator's numbers to zero.
- **Two adoption cards, not one.** "Clubs 92%" measures the PARSER — 92% of
  imported saves had a club in the game for us to read — and says nothing about
  whether anyone opened the clubs page. "Uploaded inspo photos 27%" measures
  the PERSON. Different subject, different denominator, so different card.
- **Photo counts exclude the portrait rows.** The thumbnail route
  (`PUT :hId/thumbnail`) inserts a `photos` row with `type='built'` so the
  portrait shows in the showcase strip, which made a plain `type='built'` count
  come out 94% portraits. The `household-thumbs/` R2 prefix is what tells a
  synced portrait from an uploaded photo, and every photo number uses it.
- **Derived numbers cover all of history; logged ones start the day they ship.**
  Logging does not get a list of its own: four of the five buttons duplicated a
  row that was already derived and better, which put "Synced portraits 27% (3)"
  directly above "Synced portraits 0 people" and made the page look like it was
  contradicting itself. Logging now does the one thing derivation can't — say
  whether something is still used THIS WEEK — on the row it belongs to. Only
  the randomizer is a logging-only row, and it carries its start date.
- **One row per THING, not per authorable field.** "Edited a sim" and "Edited a
  household" replaced a row each for planned moves and planned careers. Both
  mean planner-authored data OR a field that has diverged from the import
  snapshot — the same test the app itself uses to show a field as edited.
- **Two guards stop the GAME's words counting as the user's.** An older import
  path parked EA's household bio in `notes` before the description column
  existed, so a bare non-empty-notes test called 1,666 premades user-edited; a
  note only counts where the row isn't that legacy shape. And a description
  only counts when the planner actually holds one, or every household whose
  description was never backfilled read as "the user cleared it".

## Operating it

- Set `ADMIN_EMAILS` (comma-separated, lower-cased against `users.email`) in
  the Railway service variables. Unset or empty means nobody is an admin and
  every `/api/admin` route 404s — the safe default for any environment that
  forgets.
- The three new tables (`import_events`, `showcase_views`, `feature_events`)
  are created by `schema.sql` on boot; there is no separate migration step.
- The imports tile, the two import/sync trend charts, and the failures list all
  hide until `import_events` has at least one row. "0 imports this week" reads
  as a dead product; a missing tile reads as a feature that isn't deployed yet.

## Explicitly out of scope (v1)

- Any mutation of user data from the admin page (merges, deletes, repairs).
- Page-view analytics for the landing/marketing pages — Cloudflare already
  proxies the whole site; its built-in analytics answers "how many visitors"
  without building anything.
- Emailing users from the dashboard.
- Charts of anything the DB can't already answer (don't guess; leave a gap).
