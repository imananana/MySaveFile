CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,
  password_hash TEXT,
  google_id     TEXT UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS save_files (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT 'My Save File',
  disabled_worlds  TEXT NOT NULL DEFAULT '[]',
  season_length    INTEGER NOT NULL DEFAULT 4,  -- weeks; new (non-imported) saves default to 28-day seasons
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS neighborhood_captions TEXT NOT NULL DEFAULT '{}';
-- I2: per-world public showcase blurb. JSON map keyed by world name → blurb.
-- Worlds have no in-game text, so this is always user-authored.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS world_blurbs TEXT NOT NULL DEFAULT '{}';
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
-- Source save identity for re-import scoping. Set on first game-import; null for
-- save files that were never linked to a .save (manual create, JSON import, etc.).
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS source_save_filename TEXT;
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS source_save_name TEXT;
-- Set on first game-import and refreshed on each successful re-sync. Drives the
-- "Synced N days ago" indicator and stale-sync nudge in the UI.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
-- External URL where visitors can download the .save file (Patreon, Sims
-- FileShare, Google Drive, etc.). Surfaced on the public showcase.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS save_file_url TEXT;
ALTER TABLE save_files ALTER COLUMN season_length SET DEFAULT 4;  -- new saves → 28-day seasons (existing rows keep their value)
-- Soft-delete: a deleted save sets deleted_at instead of being removed, so an
-- accidental delete is recoverable from the trash. NULL = active.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
-- Stamped each time a save is opened, so the picker can sort by recency of use
-- (distinct from updated_at, which only moves on edits).
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;
-- Marks trash entries created automatically before a destructive op (re-import
-- / reset). Auto-backups get a shorter retention (7d) than user-deleted (30d).
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS auto_backup BOOLEAN NOT NULL DEFAULT FALSE;
-- Source save name (snapshot at duplication) so a copy shows "copy of X" — helps
-- users find the original when scanning their save list. Only set by /duplicate.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS duplicated_from TEXT;
-- Editorially featured on the public landing page. NULL = not featured; a
-- timestamp = featured (newest first). Curated manually for now (set via SQL);
-- becomes the "Featured saves" strip once there's more than one.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ;
-- The save's season length (weeks) as of the last import/sync. season_length is
-- the AUTHORED plan length (what the Holidays calendar renders); this tracks the
-- game's actual length so re-sync can "mirror until override": adopt the save's
-- length only when it CHANGED since we last saw it, otherwise leave the plan's
-- length alone. NULL = never recorded (pre-feature save) → next sync seeds it.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS imported_season_length INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
-- Pack ownership state — global per user. Stored as a single JSONB blob to
-- match the partialize shape in src/store/usePackOwnership.ts. Reasonable
-- default so a freshly-created user's first read doesn't have to handle null.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pack_ownership JSONB NOT NULL DEFAULT '{"manualOverrides":{},"autoDetected":[],"lastDetectedAt":null}';
-- Email verification: a soft nudge, not a hard gate. Google-OAuth users are
-- created already verified (Google vouches for the address).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
-- Addresses are stored lower-case (routes/auth.ts normalizes every write and
-- every lookup). This folds rows written before that. A row is left alone if
-- lower-casing it would collide with an existing account — those two really are
-- separate accounts with separate saves, and merging them is not a migration's
-- decision to make.
UPDATE users u SET email = lower(u.email)
 WHERE u.email IS NOT NULL
   AND u.email <> lower(u.email)
   AND NOT EXISTS (SELECT 1 FROM users o WHERE o.id <> u.id AND o.email = lower(u.email));

CREATE TABLE IF NOT EXISTS lots (
  id                   TEXT PRIMARY KEY,
  save_file_id         TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  lot_key              TEXT NOT NULL,
  world_name           TEXT NOT NULL,
  lot_name             TEXT NOT NULL,
  custom_name          TEXT NOT NULL,
  location             TEXT NOT NULL DEFAULT '',
  default_type         TEXT NOT NULL,
  custom_type          TEXT NOT NULL,
  size                 TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'unplanned',
  household_ids        TEXT NOT NULL DEFAULT '[]',
  club_ids             TEXT NOT NULL DEFAULT '[]',
  notes                TEXT NOT NULL DEFAULT '',
  has_small_business   INTEGER NOT NULL DEFAULT 0,
  small_business_name  TEXT NOT NULL DEFAULT '',
  small_business_notes TEXT NOT NULL DEFAULT '',
  small_business_icon  TEXT NOT NULL DEFAULT '',
  UNIQUE(save_file_id, lot_key)
);
-- venue_schedule used to live on lots; it's been moved to the custom_venues
-- table (see migration block below). The column is dropped by that block.
ALTER TABLE lots ADD COLUMN IF NOT EXISTS source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_lots_source_id ON lots (save_file_id, source_id);
-- Snapshot of game-truth fields at last import, used as the baseline for re-import
-- diffs: planner-vs-snapshot tells us whether the user has edited a field since
-- the last import, which lets the merge UI distinguish real conflicts from
-- routine re-applies.
ALTER TABLE lots ADD COLUMN IF NOT EXISTS last_imported_state JSONB;

CREATE TABLE IF NOT EXISTS households (
  id                TEXT PRIMARY KEY,
  save_file_id      TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  composition       TEXT NOT NULL DEFAULT '{}',
  assigned_lot_key  TEXT,
  notes             TEXT NOT NULL DEFAULT '',
  thumbnail_filename TEXT,
  source_id         TEXT          -- original bigint household ID from the .save (hex), for thumbnail/dynasty cross-ref
);
ALTER TABLE households ADD COLUMN IF NOT EXISTS thumbnail_filename TEXT;
ALTER TABLE households ADD COLUMN IF NOT EXISTS source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_households_source_id ON households (save_file_id, source_id);
ALTER TABLE households ADD COLUMN IF NOT EXISTS last_imported_state JSONB;
-- Provenance: classified at import (Yours/EA/Mod + sub-label + creator). Derived
-- game-truth — set on import, re-classified on re-sync, never diffed.
ALTER TABLE households ADD COLUMN IF NOT EXISTS provenance TEXT;
ALTER TABLE households ADD COLUMN IF NOT EXISTS provenance_sub TEXT;
ALTER TABLE households ADD COLUMN IF NOT EXISTS creator_name TEXT;
-- Visibility override: user-authored + sticky (Pin / Auto / Send to Town).
-- Survives re-sync; never set by import (defaults to auto).
ALTER TABLE households ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'auto';

CREATE TABLE IF NOT EXISTS sims (
  id            TEXT PRIMARY KEY,
  save_file_id  TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  household_id  TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  first_name    TEXT NOT NULL DEFAULT '',
  last_name     TEXT NOT NULL DEFAULT '',
  gender        TEXT NOT NULL DEFAULT 'female',
  lifestage     TEXT NOT NULL DEFAULT 'adult',
  species       TEXT NOT NULL DEFAULT 'human',
  pet_subtype   TEXT NOT NULL DEFAULT 'pet',
  pet_breed     TEXT,
  occult        TEXT NOT NULL DEFAULT 'none',
  is_ghost      INTEGER NOT NULL DEFAULT 0,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sims ADD COLUMN IF NOT EXISTS occult TEXT NOT NULL DEFAULT 'none';
ALTER TABLE sims ADD COLUMN IF NOT EXISTS is_ghost INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sims ADD COLUMN IF NOT EXISTS pet_subtype TEXT NOT NULL DEFAULT 'pet';
ALTER TABLE sims ADD COLUMN IF NOT EXISTS pet_breed TEXT;
ALTER TABLE sims ADD COLUMN IF NOT EXISTS source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sims_source_id ON sims (save_file_id, source_id);
ALTER TABLE sims ADD COLUMN IF NOT EXISTS last_imported_state JSONB;
-- CAS attributes (trait_ids: hex tuning IDs into stockTraits; aspiration_id
-- into stockAspirations). Populated by randomizer + save importer.
ALTER TABLE sims ADD COLUMN IF NOT EXISTS trait_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE sims ADD COLUMN IF NOT EXISTS aspiration_id TEXT;
-- Planner-AUTHORED goals (never set by import/re-sync; not diffed). Distinct from
-- the observed game-truth: goal skills a sim is working toward, and an authored
-- career TRACK (uid); the save's career level stays mirror-only.
ALTER TABLE sims ADD COLUMN IF NOT EXISTS planned_skill_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE sims ADD COLUMN IF NOT EXISTS planned_career_uid TEXT;
-- Planner-AUTHORED planned move ("Planned move -> X" sticker); a household id
-- (real or plan-only shell). Only real sims carry one; never set by import;
-- cleared on any in-game move. See project_planned_moves_spec.
ALTER TABLE sims ADD COLUMN IF NOT EXISTS planned_move_household_id TEXT;
-- Family tree (humans only). record_status governs visibility:
--   'active'    on the roster (default; today's sims)
--   'tree_only' full-data ancestor imported via genealogy walk (never on roster)
--   'culled'    was in the save, the game culled it -- we preserve it (tree only)
--   'stub'      a dangling ancestor ref (the in-game "Unknown" silhouette)
--   'manual'    hand-authored (filled-in stub, or invented ancestor; sync never touches)
-- household_id is nullable because tree-only/stub/manual sims have no household.
ALTER TABLE sims ALTER COLUMN household_id DROP NOT NULL;
ALTER TABLE sims ADD COLUMN IF NOT EXISTS record_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE sims ADD COLUMN IF NOT EXISTS death_cause TEXT;   -- e.g. 'Cowplant'; null = alive or unknown
-- Discover University: currently-enrolled degree as JSON {subject,school,distinguished}; null when not enrolled.
ALTER TABLE sims ADD COLUMN IF NOT EXISTS enrolled_degree TEXT;
-- Active career as JSON {uid,name,kind,level}; null when unemployed.
ALTER TABLE sims ADD COLUMN IF NOT EXISTS career TEXT;
ALTER TABLE sims ADD COLUMN IF NOT EXISTS culled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sims_record_status ON sims (save_file_id, record_status);

-- Per-sim skills (observed game-truth, read-only; excluded from re-sync diffing —
-- skills drift every play session). Normalized (not a JSON blob) so we can filter
-- the roster by skill, aggregate for diversity, and later author/feed the mod.
-- skill_id = hex tuning id ('0x..') into stockSkills; level is derived from points
-- via the per-category curve at parse time. Replaced wholesale per sim on import.
CREATE TABLE IF NOT EXISTS sim_skills (
  sim_id    TEXT NOT NULL REFERENCES sims(id) ON DELETE CASCADE,
  skill_id  TEXT NOT NULL,
  level     INTEGER NOT NULL DEFAULT 0,
  points    REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (sim_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_sim_skills_skill ON sim_skills (skill_id);

-- Family relationship edges. 'parent' edges are directional (sim_a = parent,
-- sim_b = child); couple edges are symmetric and stored once. source='import'
-- rows are replaced wholesale on every re-sync; source='manual' rows are never
-- touched by sync.
CREATE TABLE IF NOT EXISTS sim_relationships (
  id            TEXT PRIMARY KEY,
  save_file_id  TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  sim_a_id      TEXT NOT NULL REFERENCES sims(id) ON DELETE CASCADE,
  sim_b_id      TEXT NOT NULL REFERENCES sims(id) ON DELETE CASCADE,
  rel_type      TEXT NOT NULL,  -- 'parent' | 'spouse' | 'engaged' | 'partner' | 'ex_spouse' | 'ex_partner' | 'ex_fiance' | 'sibling' | 'half_sibling'
  source        TEXT NOT NULL DEFAULT 'import',  -- 'import' | 'manual'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (save_file_id, sim_a_id, sim_b_id, rel_type)
);
CREATE INDEX IF NOT EXISTS idx_sim_rel_a ON sim_relationships (save_file_id, sim_a_id);
CREATE INDEX IF NOT EXISTS idx_sim_rel_b ON sim_relationships (save_file_id, sim_b_id);

CREATE TABLE IF NOT EXISTS clubs (
  id                TEXT PRIMARY KEY,
  save_file_id      TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT '',
  icon              TEXT NOT NULL DEFAULT '',
  assigned_lot_key  TEXT,
  notes             TEXT NOT NULL DEFAULT '',
  member_sim_ids    TEXT NOT NULL DEFAULT '[]'  -- jsonb-encoded array of sims.id values
);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS member_sim_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clubs_source_id ON clubs (save_file_id, source_id);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS last_imported_state JSONB;
-- Read-only game-truth fields (refreshed on re-sync, never user-editable).
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS leader_sim_id TEXT;        -- founder, sims.id (planner) or null
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS criteria TEXT NOT NULL DEFAULT '[]';  -- VenueCriterion[] JSON
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS rules TEXT NOT NULL DEFAULT '[]';      -- ParsedClubRule[] JSON
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS invite_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS hangout_venue_type_id TEXT;            -- General Venue hangout: venue tuning id hex (mutually exclusive with assigned_lot_key)

CREATE TABLE IF NOT EXISTS small_businesses (
  id                   TEXT PRIMARY KEY,
  save_file_id         TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL DEFAULT '',
  icon                 TEXT NOT NULL DEFAULT '',
  notes                TEXT NOT NULL DEFAULT '',
  assigned_lot_key     TEXT,
  owner_household_id   TEXT
);
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_small_businesses_source_id ON small_businesses (save_file_id, source_id);
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS last_imported_state JSONB;
-- Rich business fields (authorable for hand-created; refreshed on re-sync for imported).
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS employee_sim_ids TEXT NOT NULL DEFAULT '[]'; -- sims.id JSON array
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS customer_criteria TEXT NOT NULL DEFAULT '[]'; -- SmallBusinessCustomerCriterion[] JSON
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS activities TEXT NOT NULL DEFAULT '[]';        -- {id,name}[] JSON
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS fee_mode TEXT NOT NULL DEFAULT 'unknown';     -- disabled|hourly|one-time|unknown
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS price_modifier_pct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS renown_rank INTEGER;   -- owner-derived star level 0–5, null if unknown
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS alignment INTEGER;     -- owner-derived 1–7, null if unknown
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS perk_points INTEGER NOT NULL DEFAULT 0;
-- Owner is the specific owning SIM (sims.id), not a household — two sims in one
-- household can each own a separate business. owner_household_id left dormant.
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS owner_sim_id TEXT;
-- Multi-lot: a business can span several lots. assigned_lot_keys (JSON array) is
-- the source of truth; the legacy assigned_lot_key column is left for backfill.
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS assigned_lot_keys TEXT NOT NULL DEFAULT '[]';
UPDATE small_businesses SET assigned_lot_keys = json_build_array(assigned_lot_key)::text
  WHERE assigned_lot_key IS NOT NULL AND assigned_lot_keys = '[]';

-- I1: public-facing Description, distinct from private Notes. Imported from the
-- save's in-game text fields; surfaced on the public showcase. Notes stays
-- private and is never shown publicly or overwritten by re-sync.
ALTER TABLE lots             ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE households       ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE clubs            ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE small_businesses ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

-- Household funds (Simoleons), observed game-truth from the save. Read-only,
-- surfaced for context; the game caps at INT32_MAX so it fits a JS number.
-- Nullable: hand-created households have no funds value. Excluded from re-sync
-- diffing (drifts every play session — shown as a digest count, not a conflict).
ALTER TABLE households       ADD COLUMN IF NOT EXISTS money BIGINT;
-- Planner-authored funds GOAL (threshold target; goal-vs-reality). Never set by import.
ALTER TABLE households       ADD COLUMN IF NOT EXISTS planned_money BIGINT;

-- Custom Venues: lots the user has annotated with a role-preset schedule. A
-- lot can be typed `Custom Venue` (via worlds.ts seed or save import) without
-- having a row here — the row only exists when the user (or save importer)
-- has explicitly tracked it. Mirrors the small_businesses model: never seeded,
-- only ever created on import or by user action.
CREATE TABLE IF NOT EXISTS custom_venues (
  id            TEXT PRIMARY KEY,
  save_file_id  TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  lot_key       TEXT NOT NULL,
  venue_schedule TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  last_imported_state JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(save_file_id, lot_key)
);
CREATE INDEX IF NOT EXISTS idx_custom_venues_save_file_id ON custom_venues(save_file_id);

-- Stage 1 (EP20 rich model): the parser now extracts the venue's in-game name +
-- its full role/schedule structure. `name` is the venue name (may differ from the
-- lot name). `roles`/`slots` hold the parsed ParsedVenueRole[]/ParsedVenueSlot[]
-- arrays verbatim (raw tuning ids — labels resolve at the display layer via
-- venueLabels + STOCK_ACTIVITIES). venue_schedule (free-form text) is retained
-- for back-compat but no longer surfaced in the UI.
ALTER TABLE custom_venues ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE custom_venues ADD COLUMN IF NOT EXISTS roles JSONB;
ALTER TABLE custom_venues ADD COLUMN IF NOT EXISTS slots JSONB;
-- Origin of the venue row: 'import' = parsed from the game save (read-only in the
-- UI except notes; refreshed/removed by re-sync). 'planner' = authored in the
-- planner via the venue editor (fully editable; NEVER auto-removed by re-sync,
-- since its lot is unknown to the game). Default 'import' is correct for every
-- existing row (all came from imports before the editor existed).
ALTER TABLE custom_venues ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'import';
-- Planner venues are decoupled from a lot: you build the schedule first and
-- assign a lot whenever (or never), so lot_key is nullable. Imported venues
-- always carry their lot_key. Postgres treats NULLs as distinct in the
-- UNIQUE(save_file_id, lot_key) constraint, so any number of unassigned planner
-- venues coexist.
ALTER TABLE custom_venues ALTER COLUMN lot_key DROP NOT NULL;
-- `is_getaway` = a household-hosted, ephemeral plan (vs a lot-bound custom venue);
-- `host_household_id` = the hosting household (planner household id, denormalized
-- like other cross-entity refs). Both planner-only (imports are never getaways).
ALTER TABLE custom_venues ADD COLUMN IF NOT EXISTS is_getaway BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE custom_venues ADD COLUMN IF NOT EXISTS host_household_id TEXT;
-- `source_preset_id` = the planner preset this venue's schedule was started from
-- (provenance), powering the "Custom / preset name (edited)" label + Update-preset.
-- Null = hand-built / not from a preset. Not FK'd (preset deletion just orphans it).
ALTER TABLE custom_venues ADD COLUMN IF NOT EXISTS source_preset_id TEXT;

-- Saved custom-venue presets (EP20 preset library). These are SAVE-GLOBAL (not
-- tied to a lot): reusable schedule templates and standalone role templates the
-- player saved in-game. `kind` = 'schedule' (data = ParsedCustomVenue: roles +
-- slots) or 'role' (data = ParsedVenueRole). `source` = 'import' (refreshed
-- wholesale on every import/re-sync) or 'planner' (authored in-planner; preserved
-- across syncs — reserved for the future authoring phase). Sims-Team built-ins
-- ('stock') are NOT stored here — they live in the static STOCK_VENUE_PRESETS catalog.
CREATE TABLE IF NOT EXISTS custom_venue_presets (
  id            TEXT PRIMARY KEY,
  save_file_id  TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  data          JSONB NOT NULL,
  source        TEXT NOT NULL DEFAULT 'import',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_venue_presets_save_file_id ON custom_venue_presets(save_file_id);

-- One-shot backfill: copy any existing venue_schedule data off the lots table
-- into the new custom_venues table, then drop the old column. The DO block
-- makes this safe to re-run after the column is gone (the IF EXISTS check
-- short-circuits both the INSERT and the ALTER).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lots' AND column_name = 'venue_schedule'
  ) THEN
    INSERT INTO custom_venues (id, save_file_id, lot_key, venue_schedule)
    SELECT
      'cv_' || lots.id,
      lots.save_file_id,
      lots.lot_key,
      lots.venue_schedule
    FROM lots
    WHERE
      lots.custom_type = 'Custom Venue'
      AND lots.venue_schedule IS NOT NULL
      AND lots.venue_schedule <> ''
    ON CONFLICT (save_file_id, lot_key) DO NOTHING;

    ALTER TABLE lots DROP COLUMN venue_schedule;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS holidays (
  id            TEXT PRIMARY KEY,
  save_file_id  TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT '',
  icon          TEXT NOT NULL DEFAULT '',
  season        TEXT NOT NULL DEFAULT 'Spring',
  day           INTEGER NOT NULL DEFAULT 1,
  notes         TEXT NOT NULL DEFAULT '',
  traditions    TEXT NOT NULL DEFAULT '[]',  -- jsonb array of tradition tuning id hex strings
  unassigned    BOOLEAN NOT NULL DEFAULT false,  -- parked off the calendar (keeps season/day as the intended slot)
  time_off      BOOLEAN NOT NULL DEFAULT false,  -- "Day off Work/School" (record f4/f5)
  decoration_preset TEXT             -- decoration-theme preset id (decimal string); null = None
);
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_holidays_source_id ON holidays (save_file_id, source_id);
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS last_imported_state JSONB;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS traditions TEXT NOT NULL DEFAULT '[]';
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS unassigned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS time_off BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS decoration_preset TEXT;
-- imported holiday's in-game day+season at each plan length ('1'|'2'|'4'); lets
-- the planner re-scale it exactly like the game. null for hand-made holidays.
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS scaled_dates JSONB;

-- In-game Dynasties (EP21). Read-only display data parsed from the save + a
-- private notes field. members/value_ids/perk_ids are jsonb-encoded arrays;
-- head_sim_id + members[].simId reference sims.id (remapped on import).
CREATE TABLE IF NOT EXISTS dynasties (
  id            TEXT PRIMARY KEY,
  save_file_id  TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  head_sim_id   TEXT,
  members       TEXT NOT NULL DEFAULT '[]',   -- jsonb array of { simId, order }
  value_ids     TEXT NOT NULL DEFAULT '[]',   -- jsonb array of ideal+skill tuning id hex strings
  crest_bg_hash TEXT,
  crest_fg_hash TEXT,
  prestige      DOUBLE PRECISION,
  unity         DOUBLE PRECISION,
  perk_ids      TEXT NOT NULL DEFAULT '[]',   -- jsonb array of perk ids (numbers)
  alliance_source_ids TEXT NOT NULL DEFAULT '[]', -- jsonb array of allied dynasty game ids (hex)
  rivalry_source_ids  TEXT NOT NULL DEFAULT '[]', -- jsonb array of rival dynasty game ids (hex)
  source_id     TEXT,
  last_imported_state JSONB
);
ALTER TABLE dynasties ADD COLUMN IF NOT EXISTS alliance_source_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE dynasties ADD COLUMN IF NOT EXISTS rivalry_source_ids  TEXT NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_dynasties_save_file_id ON dynasties (save_file_id);
CREATE INDEX IF NOT EXISTS idx_dynasties_source_id ON dynasties (save_file_id, source_id);

CREATE TABLE IF NOT EXISTS mods (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'Mod',
  importance  TEXT NOT NULL DEFAULT 'recommended',
  notes       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS mod_exclusions (
  mod_id       TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
  save_file_id TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  PRIMARY KEY (mod_id, save_file_id)
);

CREATE TABLE IF NOT EXISTS photos (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'inspo',
  save_file_id  TEXT,
  target_type   TEXT,
  target_key    TEXT,
  filename      TEXT NOT NULL,
  caption          TEXT NOT NULL DEFAULT '',
  categories       TEXT NOT NULL DEFAULT '[]',
  tags             TEXT NOT NULL DEFAULT '[]',
  gallery_creator  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS gallery_creator TEXT;
-- Stored image dimensions so the masonry gallery reserves each tile's box and
-- never reflows as images load. Null for legacy rows (self-healed client-side).
ALTER TABLE photos ADD COLUMN IF NOT EXISTS width INT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS height INT;
-- Old auto-import path stamped portraits with "Auto-imported portrait" as the
-- caption; users found it noisy. Blank it out — the caption field is meant
-- for user-authored notes, not telemetry.
UPDATE photos SET caption = '' WHERE caption = 'Auto-imported portrait';

CREATE TABLE IF NOT EXISTS photo_assignments (
  photo_id     TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  save_file_id TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL,
  target_key   TEXT NOT NULL,
  PRIMARY KEY (photo_id, save_file_id)
);

CREATE TABLE IF NOT EXISTS photo_exclusions (
  photo_id     TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  save_file_id TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, save_file_id)
);

-- The inspo tag VOCABULARY, per user (the inspo pool is per-user, so this is
-- too). Previously there was no tag entity at all — the vocabulary was derived
-- from whatever photos happened to carry, so coining a tag and then taking it
-- off that one photo destroyed it, and there was no way to delete or rename a
-- tag short of hunting down every photo using it.
--
-- Reads UNION this table with tags actually in use, so nothing pre-existing
-- needs backfilling and a tag can never go missing while a photo still has it.
CREATE TABLE IF NOT EXISTS inspo_tags (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);

-- ── Showcase (2026-09 rebuild) ─────────────────────────────────────────────
-- One public page per save at /s/<slug>. `showcase_live` is the only publish
-- switch: off = the link renders the branded not-live page (identical to a
-- link that never existed, so existence can't be probed). `showcase` holds
-- every showcase-authored choice (cover, world order/visibility, lead picks,
-- featured lists, section orders) as one client-owned JSON blob — authored
-- state only, never written by import/re-sync. `showcase_slug` is the CURRENT
-- slug; minted the first time a save goes Live, re-minted on rename.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS showcase_live BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS showcase JSONB NOT NULL DEFAULT '{}';
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS showcase_slug TEXT UNIQUE;
-- Packs the save itself was detected using (pack ids, from detectPacksFromSave
-- at import/re-sync). Distinct from the USER's pack ownership: this is the
-- per-save evidence the showcase's "Packs used" pills render. NULL = save
-- imported before this column existed (showcase falls back to world-derived
-- packs until the next sync writes it).
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS detected_packs JSONB;
-- R2 key of the last social card rendered for this save (server/src/lib/
-- ogCover.ts). The key carries a fingerprint of everything the cover draws
-- from, so this column is both the cache pointer and the record of which old
-- image to delete when the cover changes — one stored card per save, ever.
-- NULL = never rendered; it is regenerated on demand and safe to clear.
ALTER TABLE save_files ADD COLUMN IF NOT EXISTS showcase_og_key TEXT;

-- Every slug a save has ever held, including the current one. Public lookups
-- fall back to this table and redirect to the save's current slug, so a
-- shared link survives any number of renames. Rows are never freed while the
-- save exists (a reused name gets a numbered slug instead) — repointing
-- someone's bio link at a different save is the failure this prevents.
CREATE TABLE IF NOT EXISTS showcase_slugs (
  slug          TEXT PRIMARY KEY,
  save_file_id  TEXT NOT NULL REFERENCES save_files(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_showcase_slugs_save ON showcase_slugs(save_file_id);

-- Password reset tokens. We store only a SHA-256 hash of the token; the raw
-- token lives only in the emailed link. Single-use (used_at) + short TTL.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email verification tokens. Same shape as password_reset_tokens.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes on foreign key / filter columns
CREATE INDEX IF NOT EXISTS idx_prt_token_hash                  ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user_id                     ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_evt_token_hash                  ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_evt_user_id                     ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_save_files_user_id              ON save_files(user_id);
CREATE INDEX IF NOT EXISTS idx_lots_save_file_id               ON lots(save_file_id);
CREATE INDEX IF NOT EXISTS idx_households_save_file_id         ON households(save_file_id);
CREATE INDEX IF NOT EXISTS idx_sims_save_file_id               ON sims(save_file_id);
CREATE INDEX IF NOT EXISTS idx_sims_household_id               ON sims(household_id);
CREATE INDEX IF NOT EXISTS idx_clubs_save_file_id              ON clubs(save_file_id);
CREATE INDEX IF NOT EXISTS idx_small_businesses_save_file_id   ON small_businesses(save_file_id);
CREATE INDEX IF NOT EXISTS idx_holidays_save_file_id           ON holidays(save_file_id);
CREATE INDEX IF NOT EXISTS idx_mods_user_id                    ON mods(user_id);
CREATE INDEX IF NOT EXISTS idx_mod_exclusions_save_file_id     ON mod_exclusions(save_file_id);
CREATE INDEX IF NOT EXISTS idx_photos_user_id_type             ON photos(user_id, type);
CREATE INDEX IF NOT EXISTS idx_photos_save_file_id             ON photos(save_file_id) WHERE save_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_assignments_save_file_id  ON photo_assignments(save_file_id);
CREATE INDEX IF NOT EXISTS idx_photo_exclusions_save_file_id   ON photo_exclusions(save_file_id);

-- ── Import / sync telemetry (2026-09) ──────────────────────────────────────
-- One row per import or re-sync ATTEMPT, successes and failures alike. Before
-- this, a failed import was invisible: the user hit an error, left, and unless
-- Sentry happened to catch the exception nobody ever knew. This is the record
-- that makes "did an import break for someone?" an answerable question.
--
-- ★ save_file_id is deliberately NOT a foreign key. Two reasons: a failure can
-- happen before any save exists (a wrong file, a failed create), and cascading
-- on save deletion would erase the evidence that the import ever happened —
-- which is exactly the history this table exists to keep.
--
-- error_summary is one short line, capped server-side. Full stacks stay in
-- Sentry; this is for scanning, not for debugging.
CREATE TABLE IF NOT EXISTS import_events (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  save_file_id  TEXT,
  kind          TEXT NOT NULL,            -- 'import' | 'resync'
  ok            BOOLEAN NOT NULL,
  error_summary TEXT,
  sim_count     INTEGER,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_events_created ON import_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_events_user    ON import_events (user_id);
CREATE INDEX IF NOT EXISTS idx_import_events_failed  ON import_events (created_at DESC) WHERE ok = FALSE;

-- Per-slug daily view tally for public showcases. One row per slug per day,
-- incremented on the public payload fetch — the whole page is one request, so
-- one increment is one visit.
--
-- ★ No IP, no user agent, no visitor identity of any kind. This counts VIEWS,
-- not people, and deliberately cannot be turned into the latter later. Owners
-- looking at their own page and not-live pages don't count.
--
-- Built so it can be surfaced to creators eventually ("your save was viewed N
-- times"), which is why it's keyed by slug rather than by save id — but it is
-- NOT surfaced to them yet.
CREATE TABLE IF NOT EXISTS showcase_views (
  slug  TEXT NOT NULL,
  day   DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, day)
);
CREATE INDEX IF NOT EXISTS idx_showcase_views_day ON showcase_views (day DESC);

-- Feature usage, for the handful of actions the database cannot infer on its
-- own. The randomizer is the reason this exists: it saves a household with
-- provenance='yours', provenanceSub='built', sourceId=null — byte for byte
-- what the Create Household modal writes — so no amount of querying can tell
-- the two apart after the fact.
--
-- ★ A DAILY TALLY, not an event log. One row per user per feature per day, so
-- this can answer "do people use X" and "how many did it this week" without
-- ever becoming a minute-by-minute record of what someone was doing. There are
-- no timestamps beyond the date and nothing identifying a session.
--
-- Only covers from the day it ships. The derived counts on the dashboard stay
-- as the historical record; this is the forward one.
CREATE TABLE IF NOT EXISTS feature_events (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  day     DATE NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature, day)
);
CREATE INDEX IF NOT EXISTS idx_feature_events_feature ON feature_events (feature, day DESC);
