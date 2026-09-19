# MySaveFile — a Sims 4 save-file planner

Plan and document your Sims 4 save before you build it — or after, by importing
your existing `.save`. The planner stores lots, households, sims, clubs,
holidays, small businesses, and custom venues for any of your saves, and lets
you organise photos (inspiration, in-progress, finished) per lot, household,
and world.

**Live:** <https://mysavefile.com>

## What it does

- **Import a real save.** Drop in a `.save` file and the planner extracts your
  lots (names, types, custom-venue conversions), households (names,
  descriptions, sims, lifestages, occults, pet subtypes, ghost flags), clubs
  (names, icons, hangouts, members), holidays (custom names + icons), and
  small businesses (names, icons, owners). All save reading happens locally in
  your browser — the file is never uploaded.
- **Plan from scratch.** Create lots and households manually, set custom
  types, attach sims, organise clubs and venues.
- **Photo galleries.** Inspiration boards, work-in-progress shots, finished
  builds — all attached to the lot, household, or world they belong to.
- **Public showcase.** Share a read-only link so friends can browse your
  builds + descriptions.
- **Worlds view.** All 30+ worlds with their lots, household assignments, and
  custom venue indicators.

## How this was built

I'm not a programmer. I'm a Sims 4 player with a clear idea of the tool I
wanted, and the code in this repository was written with Claude, an AI coding
tool, working to my direction and tested against my own saves. The ideas, art,
logo and writing are mine. There is no AI inside the app itself: nothing a user
enters is sent to an AI service.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Zustand, React Router v6, Tailwind
  (custom design tokens)
- **Backend:** Node.js + Express, PostgreSQL
- **Auth:** Google OAuth → session → JWT
- **Storage:** Cloudflare R2 for user-uploaded photos
- **Hosting:** Railway

## Local development

You'll need Node 20+, npm, and a local PostgreSQL instance (or a connection
string to a remote one).

```bash
git clone https://github.com/<your-fork>/sims-save-file-planner.git
cd sims-save-file-planner

# Server deps (the `build` script also installs server deps; this just does it
# upfront so the dev server works).
npm install
cd server && npm install && cd ..

# Configure environment — see "Environment variables" below
cp .env.example .env             # frontend (Vite picks up VITE_*)
cp server/.env.example server/.env

# Apply the database schema
psql "$DATABASE_URL" -f server/src/db/schema.sql

# Start client (5173) + server (3001)
npm run dev
```

Open <http://localhost:5173>. You'll be prompted to sign in with Google before
seeing your saves.

### Environment variables

The server reads these from `server/.env`:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `PORT` | Default 3001 |
| `CLIENT_URL` | URL the frontend is served from (e.g. `http://localhost:5173`) |
| `SESSION_SECRET` | Cookie session signing secret |
| `JWT_SECRET` | API JWT signing secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials |
| `GOOGLE_CALLBACK_URL` | OAuth redirect (e.g. `http://localhost:3001/api/auth/google/callback`) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY` / `R2_SECRET_KEY` / `R2_BUCKET` / `R2_PUBLIC_DOMAIN` | Cloudflare R2 (or any S3-compatible) photo storage |
| `SENTRY_DSN` | (Optional) Sentry DSN for backend error reporting. No-op when unset. |
| `ADMIN_EMAILS` | (Optional) Comma-separated allowlist for the owner dashboard at `/admin`. Unset = no admins. |
| `INTERNAL_EMAIL` | (Optional) Addresses left out of dashboard statistics. Defaults to `ADMIN_EMAILS`. |

The frontend reads:

| Var | Purpose |
|---|---|
| `VITE_PHOTO_BASE_URL` | Public URL prefix where uploaded photos are served (e.g. your R2 public bucket URL) |
| `VITE_SENTRY_DSN` | (Optional) Sentry DSN for frontend error reporting. Baked into the bundle at build time. No-op when unset. |

### Commands

```bash
npm run dev          # client + server in parallel
npm test             # run vitest once
npm run test:watch   # vitest in watch mode
npm run build        # client production build + install server deps
npm run lint         # eslint
```

## Project layout

```
src/                          # frontend (Vite + React)
  components/                 # entity managers (Household, Club, …)
  pages/                      # routed pages (Sims, SmallBusinesses, …)
  lib/saveParser.ts           # DBPF + protobuf parser for .save imports
  lib/dbpf.ts                 # DBPF v2.1 container reader
  lib/refpack.ts              # RefPack decompression
  store/useSaveFile.ts        # Zustand store
  data/                       # static seed data (worlds, lot keys, icons)

server/                       # Express + Postgres backend
  src/routes/                 # one router per entity
  src/db/schema.sql           # applied on server boot

scripts/diagnostics/          # one-shot scripts written while reverse-
                              # engineering the .save binary format; not
                              # part of the app
```

## How the save importer works

The Sims 4 save is a DBPF v2.1 container. The save's master state lives in a
single `0x0d`-type resource compressed with RefPack. Inside that resource is a
giant nested protobuf — the planner walks it to extract every entity the user
sees in the UI.

See [`THIRD_PARTY.md`](./THIRD_PARTY.md) for the community work this is built
on, and [`scripts/diagnostics/README.md`](./scripts/diagnostics/README.md) for
how the binary layout was figured out.

## Privacy

Save files are read **only in your browser** — the file is parsed locally with
JavaScript and the extracted records (lots, sims, households) are what's sent
to the server. Your raw `.save` is never uploaded.

The server stores only the planner data you create or import. Photos you
upload are stored in your R2 bucket; signed-in users can only see their own
photos unless they explicitly share via the public showcase link.

## Game images are not in this repository

The live site shows icons and world maps extracted from The Sims 4. They belong
to EA, so they are not published here, and a fresh clone runs with those images
missing (the app falls back to a placeholder). To supply your own, extract them
from your copy of the game with [Sims 4 Studio](https://sims4studio.com) into
these folders under `public/`:

`activity-icons` · `aspiration-icons` · `career-icons` · `club-activity-icons` ·
`club-icons` · `criteria-icons` · `dynasty-crests` · `holiday-icons` ·
`ideal-icons` · `lifestage-icons` · `lot-icons` · `maps` · `season-icons` ·
`skill-icons` · `small-business-icons` · `tradition-icons` · `trait-icons` ·
`venue-kind-icons` · `world-icons`

Most files are named by the game's own resource instance id, as described in
[`THIRD_PARTY.md`](./THIRD_PARTY.md).

## License

The source code is licensed under the [GNU General Public License, version
3](./LICENSE) — © Iman Akhtar.

The MySaveFile name, logo, artwork and written copy (landing page, About page,
help pages, guides) are **not** under the GPL: all rights reserved. EA's game
images are not included at all. [`THIRD_PARTY.md`](./THIRD_PARTY.md) spells out
exactly what is covered and credits the community work this is built on.

This project independently re-implements public, community-documented file
formats. It contains no code from EA / Maxis or from s4pi. It is an unofficial
fan project, not affiliated with or endorsed by EA.
