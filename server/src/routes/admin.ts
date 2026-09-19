import { Router, Response } from 'express';
import { query } from '../db/client';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAdmin, AdminRequest } from '../middleware/requireAdmin';

/**
 * The owner's dashboard, at /api/admin. One admin, read-mostly, internal.
 *
 * ★ Every route in here is a SELECT. No admin endpoint writes to a user's
 * rows — repairs and merges are a separate decision, not something that
 * should sit one misclick away from a page whose whole job is looking.
 *
 * The queries are written for the scale this actually runs at (low hundreds of
 * users, low hundreds of saves): whole-table aggregates, no pagination, no
 * caching. Anything that would need a different shape at 10,000 users is
 * called out where it appears.
 *
 * See docs/admin-dashboard-plan.md for what the page shows and why.
 */
const router = Router();

router.use(requireAdmin);

/**
 * Our own accounts — the owner's, and anything at the project's own domain
 * (tutorial-recording accounts, demo logins, a throwaway for testing a flow).
 *
 * ★ Every STATISTIC on this page excludes them: the tiles, the funnel, the
 * weekly trends, adoption, usage, packs, photos, failed imports, and who's
 * online. A dashboard whose job is "how are real people doing" cannot include
 * the person reading it — one owner account recording a tutorial would move
 * every rate on the page, and the smaller the user base the more it lies.
 *
 * Two deliberate exceptions:
 *
 *   - **The users table keeps them**, flagged, so the owner can still open her
 *     own row and look at her saves. Losing that to tidy a count would trade a
 *     tool for a cosmetic.
 *   - **Showcase views keep them.** Those are views BY visitors, not activity
 *     by us; dropping the owner's showcase would hide the most-viewed page on
 *     the site.
 *
 * A null email is never internal — `lower(NULL) = …` is NULL, so Google-only
 * accounts fall out of the subquery rather than into it.
 */
// Our personal addresses come from the environment, not the source — this
// repository is public. INTERNAL_EMAIL (comma-separated) says whose activity
// to leave out; unset, it falls back to ADMIN_EMAILS, because whoever may read
// the dashboard is by definition not one of the users it measures. They are
// interpolated into SQL below, so anything that isn't a plain address
// (letters, digits, dot, hyphen) is discarded; with nothing left, the domain
// rule is the only one.
const INTERNAL_EMAILS = (process.env.INTERNAL_EMAIL || process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter((e) => /^[a-z0-9.-]+@[a-z0-9.-]+$/.test(e));
const INTERNAL_DOMAIN = 'mysavefile.com';

/**
 * SQL boolean: is the row at `alias` one of ours? `alias` must expose `email`.
 *
 * ★ Plus-addressing counts. `owner+take3@gmail.com` is a different account to
 * the app (register only trims and lower-cases), which makes it the obvious
 * way to record a signup demo six times — and without this clause every one
 * of those takes would land back in the funnel, which is the exact thing this
 * predicate exists to prevent.
 */
const isInternal = (alias: string) => {
  const clauses = [`lower(${alias}.email) LIKE '%@${INTERNAL_DOMAIN}'`];
  for (const email of INTERNAL_EMAILS) {
    const [local, domain] = email.split('@');
    clauses.push(`lower(${alias}.email) = '${email}'`);
    clauses.push(`lower(${alias}.email) LIKE '${local}+%@${domain}'`);
  }
  return `(${clauses.join('\n        OR ')})`;
};

/**
 * Subquery of our user ids, for `… NOT IN (${OURS})`. users.id is a primary
 * key so it is never NULL, which is what makes NOT IN safe here.
 */
const OURS = `SELECT iu.id FROM users iu WHERE ${isInternal('iu')}`;

// GET /api/admin/ping — the page's gate. Cheap enough to answer before the
// aggregate queries do, so /admin can decide between "render the dashboard"
// and "render nothing" without waiting on a page of statistics.
router.get('/ping', asyncHandler(async (req: AdminRequest, res: Response) => {
  res.json({ ok: true, email: req.adminEmail });
}));

/**
 * Who is in the app right now.
 *
 * "Right now" = anything that stamps a timestamp in the last 15 minutes:
 * opening a save (last_opened_at), editing anything in one (save_files.
 * updated_at, which every editor route bumps), or touching the account itself
 * (users.updated_at). GREATEST ignores NULLs, so a user with no saves is
 * carried by their own row rather than dropped.
 *
 * Its own endpoint because the tile self-refreshes — it answers the question
 * "is it safe to deploy?", which is only useful if it's current.
 */
const ONLINE_SQL = `
  SELECT u.id, u.display_name, u.email,
         GREATEST(MAX(sf.last_opened_at), MAX(sf.updated_at), u.updated_at) AS last_seen
    FROM users u
    LEFT JOIN save_files sf ON sf.user_id = u.id
   WHERE u.id NOT IN (${OURS})
   GROUP BY u.id, u.display_name, u.email, u.updated_at
  HAVING GREATEST(MAX(sf.last_opened_at), MAX(sf.updated_at), u.updated_at) > NOW() - INTERVAL '15 minutes'
   ORDER BY last_seen DESC
`;

interface OnlineRow { id: string; display_name: string | null; email: string | null; last_seen: string }

async function onlineNow() {
  const rows = (await query(ONLINE_SQL)).rows as OnlineRow[];
  return {
    count: rows.length,
    users: rows.map((r) => ({
      id: r.id,
      name: r.display_name || r.email || 'Unnamed',
      lastSeen: r.last_seen,
    })),
  };
}

router.get('/online', asyncHandler(async (_req: AdminRequest, res: Response) => {
  res.json(await onlineNow());
}));

/**
 * The six funnel stages, counted per USER over two cohorts at once: everyone
 * who ever signed up, and everyone who signed up in the last 30 days. All-time
 * alone can't tell you whether a recent change helped.
 *
 * ★ The stages are NOT strictly nested. Email verification is a soft nudge,
 * not a gate, so a user can have a save without having verified — which means
 * a later stage can legitimately be larger than an earlier one, and the drop
 * between them can come out positive. That's the truth about the product, and
 * flattening it (by counting stage N only among those who reached N-1) would
 * hide it.
 *
 * Stage 5 is the proxy the plan calls for: a save whose last sync is more than
 * a day after it was created. Someone who imported, planned, and re-synced the
 * same day doesn't count. import_events gives the true number.
 */
const FUNNEL_SQL = `
  WITH per_user AS (
    SELECT
      u.id,
      u.created_at,
      u.email_verified,
      EXISTS (SELECT 1 FROM save_files sf
               WHERE sf.user_id = u.id AND sf.deleted_at IS NULL) AS has_save,
      EXISTS (SELECT 1 FROM save_files sf
               WHERE sf.user_id = u.id AND sf.deleted_at IS NULL
                 AND sf.source_save_filename IS NOT NULL) AS imported,
      EXISTS (SELECT 1 FROM save_files sf
               WHERE sf.user_id = u.id AND sf.deleted_at IS NULL
                 AND sf.last_synced_at IS NOT NULL
                 AND sf.last_synced_at > sf.created_at + INTERVAL '24 hours') AS resynced,
      EXISTS (SELECT 1 FROM save_files sf
               WHERE sf.user_id = u.id AND sf.deleted_at IS NULL
                 AND sf.showcase_live = TRUE) AS showcased
      FROM users u
     WHERE u.id NOT IN (${OURS})
  )
  SELECT
    COUNT(*)::int                                            AS all_signed_up,
    COUNT(*) FILTER (WHERE email_verified)::int              AS all_verified,
    COUNT(*) FILTER (WHERE has_save)::int                    AS all_has_save,
    COUNT(*) FILTER (WHERE imported)::int                    AS all_imported,
    COUNT(*) FILTER (WHERE resynced)::int                    AS all_resynced,
    COUNT(*) FILTER (WHERE showcased)::int                   AS all_showcased,
    COUNT(*) FILTER (WHERE recent)::int                                   AS new_signed_up,
    COUNT(*) FILTER (WHERE recent AND email_verified)::int                AS new_verified,
    COUNT(*) FILTER (WHERE recent AND has_save)::int                      AS new_has_save,
    COUNT(*) FILTER (WHERE recent AND imported)::int                      AS new_imported,
    COUNT(*) FILTER (WHERE recent AND resynced)::int                      AS new_resynced,
    COUNT(*) FILTER (WHERE recent AND showcased)::int                     AS new_showcased
  FROM (SELECT *, created_at >= NOW() - INTERVAL '30 days' AS recent FROM per_user) p
`;

/**
 * `col` is the FUNNEL_SQL suffix; the two cohorts prefix it with all_ / new_.
 *
 * Only ONE stage carries a note, and only because the number would otherwise
 * be read as exact. Everything else these labels used to explain — that Google
 * accounts verify themselves, that the stages aren't nested — is true of the
 * data, not something the reader has to be told while scanning it.
 */
const STAGE_LABELS: Array<{ key: string; col: string; label: string; note?: string }> = [
  { key: 'signedUp',  col: 'signed_up', label: 'Signed up' },
  { key: 'verified',  col: 'verified',  label: 'Verified email' },
  { key: 'hasSave',   col: 'has_save',  label: 'Has a save' },
  { key: 'imported',  col: 'imported',  label: 'Imported their save' },
  { key: 'resynced',  col: 'resynced',  label: 'Came back and synced again', note: 'Estimate — synced over a day after making the save' },
  { key: 'showcased', col: 'showcased', label: 'Published a showcase' },
];

/**
 * Signups and active users per week, last 12 weeks including this one.
 *
 * generate_series supplies the weeks, so a week with nothing in it is a zero
 * on the chart rather than a missing bar — the gap is the point.
 */
const TRENDS_SQL = `
  WITH weeks AS (
    SELECT generate_series(
      date_trunc('week', NOW()) - INTERVAL '11 weeks',
      date_trunc('week', NOW()),
      INTERVAL '1 week'
    ) AS week_start
  )
  SELECT w.week_start,
    (SELECT COUNT(*) FROM users u
      WHERE date_trunc('week', u.created_at) = w.week_start
        AND u.id NOT IN (${OURS}))::int AS signups,
    (SELECT COUNT(DISTINCT sf.user_id) FROM save_files sf
      WHERE sf.last_opened_at IS NOT NULL
        AND date_trunc('week', sf.last_opened_at) = w.week_start
        AND sf.user_id NOT IN (${OURS}))::int AS active,
    (SELECT COUNT(*) FROM import_events e
      WHERE e.ok AND e.kind = 'import'
        AND date_trunc('week', e.created_at) = w.week_start
        AND e.user_id NOT IN (${OURS}))::int AS imports,
    (SELECT COUNT(*) FROM import_events e
      WHERE e.ok AND e.kind = 'resync'
        AND date_trunc('week', e.created_at) = w.week_start
        AND e.user_id NOT IN (${OURS}))::int AS resyncs
  FROM weeks w
  ORDER BY w.week_start
`;

const TILES_SQL = `
  SELECT
    (SELECT COUNT(*) FROM users
      WHERE id NOT IN (${OURS}))::int AS total_accounts,
    (SELECT COUNT(*) FROM users
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND id NOT IN (${OURS}))::int AS new_this_week,
    (SELECT COUNT(*) FROM users
      WHERE created_at >= NOW() - INTERVAL '14 days'
        AND created_at <  NOW() - INTERVAL '7 days'
        AND id NOT IN (${OURS}))::int AS new_last_week,
    (SELECT COUNT(DISTINCT user_id) FROM save_files
      WHERE last_opened_at >= NOW() - INTERVAL '7 days'
        AND user_id NOT IN (${OURS}))::int AS active_this_week,
    (SELECT COUNT(DISTINCT user_id) FROM save_files
      WHERE last_opened_at >= NOW() - INTERVAL '14 days'
        AND last_opened_at <  NOW() - INTERVAL '7 days'
        AND user_id NOT IN (${OURS}))::int AS active_last_week,
    (SELECT COUNT(*) FROM save_files
      WHERE showcase_live = TRUE AND deleted_at IS NULL
        AND user_id NOT IN (${OURS}))::int AS live_showcases,
    -- events_total gates the imports tile: zero rows means logging hasn't run
    -- here yet, and "0 imports this week" would read as a dead product rather
    -- than as a feature that isn't deployed. ★ Deliberately counts OUR events
    -- too — it asks "is logging running on this deploy", which our own import
    -- answers as well as anyone's. The two numbers it gates are real users only.
    (SELECT COUNT(*) FROM import_events)::int AS events_total,
    (SELECT COUNT(*) FROM import_events
      WHERE created_at >= NOW() - INTERVAL '7 days' AND ok
        AND user_id NOT IN (${OURS}))::int AS imports_ok_week,
    (SELECT COUNT(*) FROM import_events
      WHERE created_at >= NOW() - INTERVAL '7 days' AND NOT ok
        AND user_id NOT IN (${OURS}))::int AS imports_failed_week,
    pg_database_size(current_database())::bigint AS db_size_bytes
`;

interface TilesRow {
  total_accounts: number;
  new_this_week: number;
  new_last_week: number;
  active_this_week: number;
  active_last_week: number;
  live_showcases: number;
  events_total: number;
  imports_ok_week: number;
  imports_failed_week: number;
  db_size_bytes: string;
}

// GET /api/admin/overview — zones 1–3 in one blob. A handful of aggregates
// over small tables; splitting them across endpoints would only add round
// trips to a page that always wants all of it.
router.get('/overview', asyncHandler(async (_req: AdminRequest, res: Response) => {
  const [tilesRes, funnelRes, trendsRes, failuresRes, online] = await Promise.all([
    query(TILES_SQL),
    query(FUNNEL_SQL),
    query(TRENDS_SQL),
    query(FAILURES_SQL),
    onlineNow(),
  ]);

  const t = tilesRes.rows[0] as TilesRow;
  const f = funnelRes.rows[0] as Record<string, number>;

  const stages = (prefix: 'all' | 'new') =>
    STAGE_LABELS.map((s) => ({
      key: s.key,
      label: s.label,
      note: s.note,
      count: f[`${prefix}_${s.col}`] ?? 0,
    }));

  res.json({
    tiles: {
      totalAccounts: t.total_accounts,
      newThisWeek: t.new_this_week,
      newLastWeek: t.new_last_week,
      activeThisWeek: t.active_this_week,
      activeLastWeek: t.active_last_week,
      liveShowcases: t.live_showcases,
      // bigint arrives as a string from pg; the number is far inside safe range.
      dbSizeBytes: Number(t.db_size_bytes),
      // null, not zero, while nothing has ever been logged — the page hides
      // the tile rather than reporting a number it can't stand behind.
      imports: t.events_total > 0
        ? { ok: t.imports_ok_week, failed: t.imports_failed_week }
        : null,
    },
    online,
    funnel: {
      allTime: stages('all'),
      recent: stages('new'),
      recentDays: 30,
    },
    trends: (trendsRes.rows as Array<{ week_start: string; signups: number; active: number; imports: number; resyncs: number }>).map((r) => ({
      weekStart: r.week_start,
      signups: r.signups,
      active: r.active,
      imports: r.imports,
      resyncs: r.resyncs,
    })),
    // Same gate as the tile: no logging yet means no list, not an empty one.
    hasImportEvents: t.events_total > 0,
    recentFailures: (failuresRes.rows as FailureRow[]).map((f) => ({
      id: f.id,
      kind: f.kind,
      reason: f.error_summary ?? 'No reason recorded',
      at: f.created_at,
      user: f.display_name || f.email || 'Unnamed',
      saveName: f.save_name,
    })),
  });
}));


/**
 * The highest-value ops signal on the page: attempts that didn't land.
 *
 * A failed import used to be entirely invisible — the player hit an error and
 * left, and unless Sentry happened to catch the exception nobody ever knew it
 * happened. One line each: who, which save, when, and what broke. The stack
 * stays in Sentry; this is for noticing, not for debugging.
 */
const FAILURES_SQL = `
  SELECT e.id, e.kind, e.error_summary, e.created_at, e.save_file_id,
         u.display_name, u.email, sf.name AS save_name
    FROM import_events e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN save_files sf ON sf.id = e.save_file_id
   WHERE e.ok = FALSE
     AND e.user_id NOT IN (${OURS})
   ORDER BY e.created_at DESC
   LIMIT 20
`;

interface FailureRow {
  id: string; kind: string; error_summary: string | null; created_at: string;
  save_file_id: string | null; display_name: string | null; email: string | null;
  save_name: string | null;
}

/**
 * Zone 4 — one row per user, with their saves nested.
 *
 * ★ The saves come back with the users rather than on demand per row. At this
 * scale that's one extra query against a few hundred rows, and it means
 * expanding a row is instant and sorting the table never re-fetches. Past a
 * few thousand saves this is the query to split out and paginate; nothing else
 * on the page has that problem.
 *
 * Sims are counted as the ROSTER (record_status = 'active'), not every row in
 * the table — tree-only ancestors and stubs would treble the number for anyone
 * who ran a genealogy walk, which would make "how invested are they" a lie.
 *
 * Lots are counted as PLANNED-OR-BUILT. Every save is seeded with every lot in
 * the game, so a raw count is the same ~500 for everyone and says nothing.
 */
const USERS_SQL = `
  SELECT u.id, u.display_name, u.email, u.created_at, u.email_verified,
         ${isInternal('u')} AS internal,
         COALESCE(s.save_count, 0)     AS save_count,
         COALESCE(s.imported_count, 0) AS imported_count,
         s.last_seen, s.last_synced, s.live_slug,
         COALESCE(ph.inspo_count, 0)   AS inspo_count,
         COALESCE(ph.built_count, 0)   AS built_count,
         COALESCE(po.portrait_count, 0) AS portrait_count,
         COALESCE(si.sim_count, 0)     AS sim_count
    FROM users u
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE sf.deleted_at IS NULL)::int AS save_count,
             COUNT(*) FILTER (WHERE sf.deleted_at IS NULL
                                AND sf.source_save_filename IS NOT NULL)::int AS imported_count,
             MAX(sf.last_opened_at) AS last_seen,
             MAX(sf.last_synced_at) AS last_synced,
             (ARRAY_AGG(sf.showcase_slug ORDER BY sf.showcase_slug)
                FILTER (WHERE sf.showcase_live AND sf.deleted_at IS NULL
                          AND sf.showcase_slug IS NOT NULL))[1] AS live_slug
        FROM save_files sf WHERE sf.user_id = u.id
    ) s ON TRUE
    -- ★ Three different things, counted apart -- and 'built' is NOT the same
    -- as "photos they uploaded". The portrait sync writes a photos row too
    -- (households.ts PUT :hId/thumbnail inserts type='built' so the portrait
    -- shows in the showcase strip), so a plain type='built' count came out 94%
    -- portraits. 'household-thumbs/' is the R2 prefix only that route writes,
    -- which is what tells the two apart.
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE p.type = 'inspo')::int AS inspo_count,
             COUNT(*) FILTER (WHERE p.type = 'built'
                                AND p.filename NOT LIKE 'household-thumbs/%')::int AS built_count
        FROM photos p WHERE p.user_id = u.id
    ) ph ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS portrait_count
        FROM households h JOIN save_files sf3 ON sf3.id = h.save_file_id
       WHERE sf3.user_id = u.id AND sf3.deleted_at IS NULL
         AND h.thumbnail_filename IS NOT NULL
    ) po ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS sim_count
        FROM sims si2 JOIN save_files sf2 ON sf2.id = si2.save_file_id
       WHERE sf2.user_id = u.id AND sf2.deleted_at IS NULL AND si2.record_status = 'active'
    ) si ON TRUE
   ORDER BY u.created_at DESC
`;

const SAVES_SQL = `
  SELECT sf.id, sf.user_id, sf.name, sf.created_at, sf.last_synced_at, sf.last_opened_at,
         sf.deleted_at, sf.auto_backup, sf.source_save_filename,
         sf.showcase_live, sf.showcase_slug,
         (SELECT COUNT(*) FROM sims s
           WHERE s.save_file_id = sf.id AND s.record_status = 'active')::int AS sim_count,
         (SELECT COUNT(*) FROM households h WHERE h.save_file_id = sf.id)::int AS household_count,
         (SELECT COUNT(*) FROM lots l
           WHERE l.save_file_id = sf.id AND l.status <> 'unplanned')::int AS lot_count
    FROM save_files sf
   ORDER BY sf.created_at DESC
`;

interface UserRow {
  id: string; display_name: string | null; email: string | null;
  created_at: string; email_verified: boolean; internal: boolean;
  save_count: number; imported_count: number;
  last_seen: string | null; last_synced: string | null; live_slug: string | null;
  inspo_count: number; built_count: number; portrait_count: number; sim_count: number;
}

interface SaveRow {
  id: string; user_id: string; name: string; created_at: string;
  last_synced_at: string | null; last_opened_at: string | null;
  deleted_at: string | null; auto_backup: boolean;
  source_save_filename: string | null;
  showcase_live: boolean; showcase_slug: string | null;
  sim_count: number; household_count: number; lot_count: number;
}

// GET /api/admin/users — the drill-down table. Sorting lives on the client:
// the whole set is already there, and a sort that costs a round trip stops
// being something you do idly, which is exactly how this table gets used.
router.get('/users', asyncHandler(async (_req: AdminRequest, res: Response) => {
  const [usersRes, savesRes] = await Promise.all([query(USERS_SQL), query(SAVES_SQL)]);
  const users = usersRes.rows as UserRow[];
  const saves = savesRes.rows as SaveRow[];

  const byUser = new Map<string, SaveRow[]>();
  for (const s of saves) {
    const list = byUser.get(s.user_id);
    if (list) list.push(s); else byUser.set(s.user_id, [s]);
  }

  res.json(users.map((u) => ({
    id: u.id,
    name: u.display_name || '',
    email: u.email || '',
    createdAt: u.created_at,
    emailVerified: u.email_verified,
    // Ours, not a user's. This table is the one place they're kept — every
    // statistic on the page has already dropped them.
    internal: u.internal,
    lastSeen: u.last_seen,
    lastSynced: u.last_synced,
    saveCount: u.save_count,
    importedCount: u.imported_count,
    simCount: u.sim_count,
    inspoCount: u.inspo_count,
    builtCount: u.built_count,
    portraitCount: u.portrait_count,
    showcaseSlug: u.live_slug,
    saves: (byUser.get(u.id) ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.created_at,
      lastSyncedAt: s.last_synced_at,
      lastOpenedAt: s.last_opened_at,
      imported: s.source_save_filename !== null,
      showcaseLive: s.showcase_live,
      showcaseSlug: s.showcase_slug,
      trash: s.deleted_at === null ? null : { deletedAt: s.deleted_at, autoBackup: s.auto_backup },
      simCount: s.sim_count,
      householdCount: s.household_count,
      lotCount: s.lot_count,
    })),
  })));
}));

/**
 * Below the fold, part one: what the imported SAVES contained.
 *
 * ★ This measures the parser, not the person. "Clubs 92%" means 92% of
 * imported saves had at least one club in the game for us to read — it says
 * nothing about whether anyone opened the clubs page. Whether people USE
 * things is a separate query over users; see USAGE_SQL.
 *
 * Custom venues are import-sourced only here (`source = 'import'`), or a venue
 * the user built in the planner would be counted as evidence about their save.
 */
const STATS_SQL = `
  WITH imported AS (
    SELECT sf.id FROM save_files sf
     WHERE sf.deleted_at IS NULL AND sf.source_save_filename IS NOT NULL
       AND sf.user_id NOT IN (${OURS})
  )
  SELECT
    (SELECT COUNT(*) FROM imported)::int AS imported_saves,
    (SELECT COUNT(*) FROM imported i
      WHERE EXISTS (SELECT 1 FROM clubs c WHERE c.save_file_id = i.id))::int AS clubs,
    (SELECT COUNT(*) FROM imported i
      WHERE EXISTS (SELECT 1 FROM dynasties d WHERE d.save_file_id = i.id))::int AS dynasties,
    (SELECT COUNT(*) FROM imported i
      WHERE EXISTS (SELECT 1 FROM small_businesses b WHERE b.save_file_id = i.id))::int AS businesses,
    (SELECT COUNT(*) FROM imported i
      WHERE EXISTS (SELECT 1 FROM custom_venues v
                     WHERE v.save_file_id = i.id AND v.source = 'import'))::int AS venues,
    -- Everywhere below, "uploaded" excludes the portrait rows the thumbnail
    -- route writes. Counting them as uploads made every photo number a
    -- restatement of the portrait number.
    (SELECT COUNT(*) FROM photos
      WHERE type = 'inspo' AND user_id NOT IN (${OURS}))::int AS photos_inspo,
    (SELECT COUNT(*) FROM photos
      WHERE type = 'built' AND filename NOT LIKE 'household-thumbs/%'
        AND user_id NOT IN (${OURS}))::int AS photos_built,
    (SELECT COUNT(*) FROM households h JOIN save_files sf ON sf.id = h.save_file_id
      WHERE sf.deleted_at IS NULL AND h.thumbnail_filename IS NOT NULL
        AND sf.user_id NOT IN (${OURS}))::int AS portraits_total,
    (SELECT COUNT(DISTINCT user_id) FROM photos
      WHERE filename NOT LIKE 'household-thumbs/%'
        AND user_id NOT IN (${OURS}))::int AS photo_uploaders,
    (SELECT COALESCE(MAX(n), 0)::int FROM
       (SELECT COUNT(*) AS n FROM photos
         WHERE filename NOT LIKE 'household-thumbs/%'
           AND user_id NOT IN (${OURS}) GROUP BY user_id) x) AS photos_largest,
    (SELECT COUNT(*) FROM save_files
      WHERE deleted_at IS NOT NULL AND auto_backup = FALSE
        AND user_id NOT IN (${OURS}))::int AS trash_deleted,
    (SELECT COUNT(*) FROM save_files
      WHERE deleted_at IS NOT NULL AND auto_backup = TRUE
        AND user_id NOT IN (${OURS}))::int AS trash_backups
`;

/**
 * Below the fold, part two: what people actually DO, counted per person over
 * everyone who has a save (someone with no save can't have done any of it).
 *
 * ★ Everything here is read off state the app already writes, so it covers all
 * of history rather than starting today. The limit of that approach is real
 * and worth knowing: **the randomizer is invisible.** It saves a household
 * with `provenance='yours'`, `provenanceSub='built'`, `sourceId=null` — byte
 * for byte what the Create Household modal writes — so "Made a household"
 * below counts both and can never separate them. Telling them apart needs the
 * app to say which one it was.
 *
 * "Planned or built a lot" is also broader than the status buttons: renaming,
 * retyping or annotating a lot auto-bumps it to `planned`, and adding a
 * showcase photo auto-bumps it to `built` (see LotEditModal). Read it as
 * "did anything to a lot", not as "pressed the button".
 */
const USAGE_SQL = `
  WITH savers AS (
    SELECT u.id FROM users u
     WHERE EXISTS (SELECT 1 FROM save_files sf
                    WHERE sf.user_id = u.id AND sf.deleted_at IS NULL)
       AND u.id NOT IN (${OURS})
  ), acted AS (
    SELECT s.id,
      EXISTS (SELECT 1 FROM photos p WHERE p.user_id = s.id AND p.type = 'inspo') AS inspo,
      EXISTS (SELECT 1 FROM photos p WHERE p.user_id = s.id AND p.type = 'built'
               AND p.filename NOT LIKE 'household-thumbs/%') AS built_photos,
      (EXISTS (SELECT 1 FROM inspo_tags t WHERE t.user_id = s.id)
       OR EXISTS (SELECT 1 FROM photos p WHERE p.user_id = s.id AND p.tags NOT IN ('[]', ''))) AS tags,
      EXISTS (SELECT 1 FROM households h JOIN save_files sf ON sf.id = h.save_file_id
               WHERE sf.user_id = s.id AND sf.deleted_at IS NULL
                 AND h.thumbnail_filename IS NOT NULL) AS portraits,
      EXISTS (SELECT 1 FROM lots l JOIN save_files sf ON sf.id = l.save_file_id
               WHERE sf.user_id = s.id AND sf.deleted_at IS NULL
                 AND l.status <> 'unplanned') AS lot_status,
      EXISTS (SELECT 1 FROM households h JOIN save_files sf ON sf.id = h.save_file_id
               WHERE sf.user_id = s.id AND sf.deleted_at IS NULL
                 AND h.source_id IS NULL) AS made_household,
      -- ★ ONE row for "did anything to a sim", not a row per authorable field.
      -- Planner-authored data (notes, goal skills, a career track, a planned
      -- move) OR any identity field that has diverged from the import snapshot
      -- — which is exactly what the app itself shows as an edited field.
      EXISTS (SELECT 1 FROM sims si JOIN save_files sf ON sf.id = si.save_file_id
               WHERE sf.user_id = s.id AND sf.deleted_at IS NULL AND (
                    si.notes <> ''
                 OR si.planned_skill_ids <> '{}'
                 OR si.planned_career_uid IS NOT NULL
                 OR si.planned_move_household_id IS NOT NULL
                 OR (si.last_imported_state IS NOT NULL AND (
                        si.first_name IS DISTINCT FROM (si.last_imported_state->>'firstName')
                     OR si.last_name  IS DISTINCT FROM (si.last_imported_state->>'lastName')
                     OR si.gender     IS DISTINCT FROM (si.last_imported_state->>'gender')
                     OR si.lifestage  IS DISTINCT FROM (si.last_imported_state->>'lifestage')
                     OR si.occult     IS DISTINCT FROM (si.last_imported_state->>'occult'))))) AS edited_sim,
      -- ★ The same idea for households, with two guards against counting the
      -- GAME's words as the user's. An older import path parked EA's household
      -- bio in the notes column before description existed, so a bare
      -- non-empty-notes test counted 1,666 premades as user-edited; a note only counts
      -- where the row isn't that legacy shape. And a description only counts
      -- when the planner actually holds one — otherwise every household whose
      -- description never got backfilled read as "the user cleared it".
      EXISTS (SELECT 1 FROM households h JOIN save_files sf ON sf.id = h.save_file_id
               WHERE sf.user_id = s.id AND sf.deleted_at IS NULL AND (
                    h.planned_money IS NOT NULL
                 OR h.visibility <> 'auto'
                 OR (h.notes <> '' AND (h.description <> ''
                       OR COALESCE(h.last_imported_state->>'description', '') = ''))
                 OR (h.last_imported_state IS NOT NULL AND (
                        h.name IS DISTINCT FROM (h.last_imported_state->>'name')
                     OR (h.description <> ''
                         AND h.description IS DISTINCT FROM (h.last_imported_state->>'description')))))) AS edited_household,
      EXISTS (SELECT 1 FROM custom_venues v JOIN save_files sf ON sf.id = v.save_file_id
               WHERE sf.user_id = s.id AND sf.deleted_at IS NULL
                 AND v.source = 'planner') AS built_venue,
      EXISTS (SELECT 1 FROM holidays h JOIN save_files sf ON sf.id = h.save_file_id
               WHERE sf.user_id = s.id AND sf.deleted_at IS NULL AND (
                 h.source_id IS NULL OR h.notes <> '' OR h.unassigned
                 OR (h.last_imported_state IS NOT NULL AND (
                        h.day::text IS DISTINCT FROM (h.last_imported_state->>'day')
                     OR h.season    IS DISTINCT FROM (h.last_imported_state->>'season')
                     OR h.name      IS DISTINCT FROM (h.last_imported_state->>'name')
                     OR h.icon      IS DISTINCT FROM (h.last_imported_state->>'icon'))))) AS holidays
    FROM savers s
  )
  SELECT COUNT(*)::int AS users_with_saves,
    COUNT(*) FILTER (WHERE inspo)::int          AS inspo,
    COUNT(*) FILTER (WHERE built_photos)::int   AS built_photos,
    COUNT(*) FILTER (WHERE tags)::int           AS tags,
    COUNT(*) FILTER (WHERE portraits)::int      AS portraits,
    COUNT(*) FILTER (WHERE lot_status)::int     AS lot_status,
    COUNT(*) FILTER (WHERE made_household)::int AS made_household,
    COUNT(*) FILTER (WHERE built_venue)::int    AS built_venue,
    COUNT(*) FILTER (WHERE holidays)::int       AS holidays,
    COUNT(*) FILTER (WHERE edited_sim)::int       AS edited_sim,
    COUNT(*) FILTER (WHERE edited_household)::int AS edited_household
  FROM acted
`;

/** What the SAVE had in it — evidence about the parser, not about the person. */
const ADOPTION_LABELS: Array<{ col: string; label: string }> = [
  { col: 'clubs',      label: 'Clubs' },
  { col: 'dynasties',  label: 'Dynasties' },
  { col: 'businesses', label: 'Small businesses' },
  { col: 'venues',     label: 'Custom venues' },
];

/**
 * What the PERSON did — ONE list.
 *
 * ★ The logged buttons used to sit in a second card of their own, which put
 * "Synced portraits 27% (3)" directly above "Synced portraits 0 people" and
 * made the page look like it was contradicting itself. Four of the five
 * duplicated a row that was already derived and better: derived covers ALL of
 * history, logging only covers from the day it shipped.
 *
 * So logging no longer gets its own list. It does the one thing derivation
 * can't — say whether something is still being used THIS WEEK — and rides on
 * the row it belongs to. The only logging-ONLY row is the randomizer, which is
 * the one thing no query can recover.
 *
 * `note` only where the number means less than it looks.
 */
const USAGE_LABELS: Array<{
  col: string; label: string; note?: string;
  /** feature_events key, when logging can add a this-week figure to this row. */
  feature?: string;
  /** No derived number exists — the count comes from logging alone. */
  loggedOnly?: boolean;
}> = [
  { col: 'inspo',          label: 'Uploaded inspo photos', feature: 'inspo_upload' },
  { col: 'tags',           label: 'Made an inspo tag', feature: 'tag_created' },
  { col: 'built_photos',   label: 'Added showcase photos' },
  { col: 'portraits',      label: 'Synced portraits from the game', feature: 'portrait_sync' },
  { col: 'lot_status',     label: 'Planned or built a lot', note: 'Renaming or annotating a lot bumps it too', feature: 'lot_status' },
  { col: 'made_household', label: 'Made a household', note: 'Hand-built or randomized — identical in the data' },
  { col: 'randomizer',       label: 'Used the randomizer', feature: 'randomizer_save', loggedOnly: true },
  { col: 'edited_household', label: 'Edited a household' },
  { col: 'edited_sim',       label: 'Edited a sim' },
  { col: 'built_venue',      label: 'Built a custom venue' },
  { col: 'holidays',         label: 'Edited a holiday' },
];

/**
 * Pack popularity, from the two places the app knows about packs.
 *
 * They answer different questions and are deliberately NOT merged into one
 * number: ownership is what a person has installed, detection is what a save
 * actually used. Adding them together would produce a ranking of neither.
 *
 * Aggregated in JS rather than SQL because both columns are JSON blobs whose
 * shape belongs to the client store, and the row counts are trivial. Pack IDs
 * come back raw; the page maps them to names via the existing catalog.
 */
function ownedPacks(blob: unknown): string[] {
  const o = (blob ?? {}) as { manualOverrides?: Record<string, string>; autoDetected?: string[] };
  const owned = new Set(Array.isArray(o.autoDetected) ? o.autoDetected : []);
  for (const [id, state] of Object.entries(o.manualOverrides ?? {})) {
    if (state === 'on') owned.add(id); else if (state === 'off') owned.delete(id);
  }
  return [...owned];
}

function tally(lists: string[][]): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const id of new Set(list)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * Views per live showcase.
 *
 * ★ Aggregated through showcase_slugs, not off the current slug alone. A save
 * re-mints its slug on rename and keeps every old one, so counting only the
 * current slug would silently reset a creator's numbers to zero the day they
 * renamed their save.
 *
 * The tally itself holds no visitor identity — see showcase_views in
 * schema.sql. This counts views, not people, and can't become the latter.
 */
const SHOWCASE_VIEWS_SQL = `
  SELECT sf.showcase_slug AS slug, sf.name AS save_name,
         COALESCE(u.creator_name, u.display_name, u.email) AS creator,
         COALESCE(SUM(v.count), 0)::int AS total,
         COALESCE(SUM(v.count) FILTER (WHERE v.day >= CURRENT_DATE - 6),  0)::int AS last7,
         COALESCE(SUM(v.count) FILTER (WHERE v.day >= CURRENT_DATE - 29), 0)::int AS last30
    FROM save_files sf
    JOIN users u ON u.id = sf.user_id
    LEFT JOIN showcase_slugs ss ON ss.save_file_id = sf.id
    LEFT JOIN showcase_views v  ON v.slug = ss.slug
   WHERE sf.showcase_live = TRUE AND sf.deleted_at IS NULL AND sf.showcase_slug IS NOT NULL
   GROUP BY sf.showcase_slug, sf.name, u.creator_name, u.display_name, u.email
   ORDER BY total DESC, sf.name
`;

interface ShowcaseViewRow {
  slug: string; save_name: string; creator: string | null;
  total: number; last7: number; last30: number;
}

/**
 * The logged half of usage — the actions the database can't infer.
 *
 * ★ Reported as PEOPLE, not hits, and only ever since logging began. A row
 * here reading 0 means "nobody has done it since this shipped", which is a
 * different claim from the derived numbers next to it (those cover all of
 * history), so the card says which is which.
 */
const FEATURE_EVENTS_SQL = `
  SELECT feature,
         COUNT(DISTINCT user_id)::int AS people_all,
         COUNT(DISTINCT user_id) FILTER (WHERE day >= CURRENT_DATE - 6)::int AS people_week,
         MIN(day) AS since
    FROM feature_events
   WHERE user_id NOT IN (${OURS})
   GROUP BY feature
`;

interface FeatureRow { feature: string; people_all: number; people_week: number; since: string }

/**
 * The moment after an import: where did they go first?
 *
 * The per-destination counts ride in FEATURE_EVENTS_SQL like everything else;
 * this adds the two numbers that make them a funnel rather than a list —
 * `imported` (people whose import happened while this was being logged, the
 * honest denominator) and `moved` (people who went ANYWHERE — distinct across
 * all first_stop features, since someone who imports twice can log two
 * different destinations). imported − moved = landed on the overview and
 * never left it, which is the number this exists to measure.
 *
 * `since` deliberately includes our own events — it answers "when did logging
 * start", same reasoning as events_total on the tiles.
 */
const FIRST_STOP_SQL = `
  SELECT
    (SELECT MIN(day) FROM feature_events
      WHERE feature LIKE 'first_stop_%') AS since,
    (SELECT COUNT(DISTINCT user_id) FROM feature_events
      WHERE feature LIKE 'first_stop_%'
        AND user_id NOT IN (${OURS}))::int AS moved,
    (SELECT COUNT(DISTINCT e.user_id) FROM import_events e
      WHERE e.ok AND e.kind = 'import'
        AND e.user_id NOT IN (${OURS})
        AND e.created_at >= (SELECT MIN(day) FROM feature_events
                              WHERE feature LIKE 'first_stop_%'))::int AS imported
`;

interface FirstStopRow { since: string | null; moved: number; imported: number }

router.get('/stats', asyncHandler(async (_req: AdminRequest, res: Response) => {
  const [statsRes, usageRes, featureRes, firstStopRes, ownershipRes, detectedRes, viewsRes] = await Promise.all([
    query(STATS_SQL),
    query(USAGE_SQL),
    query(FEATURE_EVENTS_SQL),
    query(FIRST_STOP_SQL),
    query(`SELECT pack_ownership FROM users WHERE id NOT IN (${OURS})`),
    query(`SELECT detected_packs FROM save_files
            WHERE detected_packs IS NOT NULL AND deleted_at IS NULL
              AND user_id NOT IN (${OURS})`),
    query(SHOWCASE_VIEWS_SQL),
  ]);

  const s = statsRes.rows[0] as Record<string, number>;
  const usg = usageRes.rows[0] as Record<string, number>;

  const owners = (ownershipRes.rows as Array<{ pack_ownership: unknown }>).map((r) => ownedPacks(r.pack_ownership));
  const detected = (detectedRes.rows as Array<{ detected_packs: unknown }>)
    .map((r) => (Array.isArray(r.detected_packs) ? (r.detected_packs as string[]) : []));

  res.json({
    adoption: {
      importedSaves: s.imported_saves,
      features: ADOPTION_LABELS.map((f) => ({ key: f.col, label: f.label, count: s[f.col] ?? 0 })),
    },
    usage: (() => {
      const logged = new Map((featureRes.rows as FeatureRow[]).map((r) => [r.feature, r]));
      // The earliest day anything was logged IS the day logging started —
      // what every logged figure on this card is relative to.
      const days = (featureRes.rows as FeatureRow[]).map((r) => r.since).filter(Boolean).sort();
      return {
        usersWithSaves: usg.users_with_saves,
        loggedSince: days[0] ?? null,
        features: USAGE_LABELS.map((f) => {
          const ev = f.feature ? logged.get(f.feature) : undefined;
          return {
            key: f.col,
            label: f.label,
            note: f.note,
            loggedOnly: f.loggedOnly ?? false,
            count: f.loggedOnly ? (ev?.people_all ?? 0) : (usg[f.col] ?? 0),
            // Only meaningful where logging is running; null keeps a row that
            // has nothing to add from printing "0 this week" as if it did.
            thisWeek: ev ? ev.people_week : null,
          };
        }),
      };
    })(),
    // null until the first first_stop event ever lands — the card hides
    // rather than render a funnel with a denominator of nothing.
    firstStop: (() => {
      const fs = firstStopRes.rows[0] as FirstStopRow;
      if (!fs.since) return null;
      const stops = (featureRes.rows as FeatureRow[])
        .filter((r) => r.feature.startsWith('first_stop_'))
        .map((r) => ({ key: r.feature, people: r.people_all }));
      return { since: fs.since, imported: fs.imported, moved: fs.moved, stops };
    })(),
    packs: {
      users: owners.length,
      saves: detected.length,
      ownedBy: tally(owners),
      detectedIn: tally(detected),
    },
    photos: {
      inspo: s.photos_inspo,
      built: s.photos_built,
      portraits: s.portraits_total,
      uploaders: s.photo_uploaders,
      largestLibrary: s.photos_largest,
    },
    trash: {
      deleted: s.trash_deleted,
      autoBackups: s.trash_backups,
    },
    showcaseViews: (viewsRes.rows as ShowcaseViewRow[]).map((v) => ({
      slug: v.slug,
      saveName: v.save_name,
      creator: v.creator ?? 'Unnamed',
      total: v.total,
      last7: v.last7,
      last30: v.last30,
    })),
  });
}));

export default router;
