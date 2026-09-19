import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { verifyToken } from '../lib/jwt';
import { buildShowcasePayload, SHOWCASE_SAVE_COLUMNS, ShowcaseSaveRow } from '../lib/showcasePayload';

const router = Router();

// The showcase endpoints are public but owner-aware: the owner viewing their
// own link gets edit mode (isOwner + a not-yet-live page still renders for
// them). A bad/absent cookie is just an anonymous visitor, never an error.
function optionalUserId(req: Request): string | null {
  const token = req.cookies?.token as string | undefined;
  if (!token) return null;
  try { return verifyToken(token).userId; } catch { return null; }
}

// Lenient per-IP cap on the unauthenticated showcase endpoints (G4). A normal
// showcase view fires a handful of requests (the save + a few photo tabs), so
// this only bites aggressive scraping, not real browsing.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// GET /api/public/featured — editorially curated showcases for the landing
// page. Only LIVE showcases qualify; links go to /s/<slug>.
router.get('/featured', asyncHandler(async (_req: Request, res: Response) => {
  const rows = (await query(
    `SELECT sf.name, sf.description, sf.showcase_slug,
            u.creator_name, u.profile_photo_url,
            cover.filename AS cover_filename,
            (SELECT COUNT(*) FROM photos p2
               LEFT JOIN photo_assignments pa2 ON pa2.photo_id = p2.id AND pa2.save_file_id = sf.id
              WHERE p2.type = 'built'
                AND (p2.save_file_id = sf.id OR pa2.save_file_id = sf.id)
                AND p2.id NOT IN (SELECT photo_id FROM photo_exclusions WHERE save_file_id = sf.id)
                AND NOT EXISTS (SELECT 1 FROM photo_assignments spa WHERE spa.photo_id = p2.id AND spa.save_file_id = sf.id AND spa.target_type = 'sim')
            )::int AS photo_count
     FROM save_files sf
     JOIN users u ON u.id = sf.user_id
     LEFT JOIN LATERAL (
       SELECT p.filename
       FROM photos p
       LEFT JOIN photo_assignments pa ON pa.photo_id = p.id AND pa.save_file_id = sf.id
       WHERE p.type = 'built'
         AND (p.save_file_id = sf.id OR pa.save_file_id = sf.id)
         AND p.id NOT IN (SELECT photo_id FROM photo_exclusions WHERE save_file_id = sf.id)
         AND NOT EXISTS (SELECT 1 FROM photo_assignments spa WHERE spa.photo_id = p.id AND spa.save_file_id = sf.id AND spa.target_type = 'sim')
       ORDER BY (p.target_type = 'world') DESC, p.created_at ASC
       LIMIT 1
     ) cover ON TRUE
     WHERE sf.featured_at IS NOT NULL
       AND sf.deleted_at IS NULL
       AND sf.showcase_live = TRUE
       AND sf.showcase_slug IS NOT NULL
     ORDER BY sf.featured_at DESC
     LIMIT 12`,
  )).rows as Array<{
    name: string; description: string | null; showcase_slug: string;
    creator_name: string | null; profile_photo_url: string | null;
    cover_filename: string | null; photo_count: number;
  }>;

  res.json(rows.map((r) => ({
    name: r.name,
    description: r.description ?? '',
    slug: r.showcase_slug,
    coverFilename: r.cover_filename,
    photoCount: r.photo_count ?? 0,
    creator: { name: r.creator_name, profilePhotoFilename: r.profile_photo_url },
  })));
}));


// GET /api/public/s/:slug — the showcase payload, one request for the whole
// page (front + world views navigate in-page; the URL never changes).
//
// Reality only: explicit column lists, never SELECT * — private `notes` and
// every planner-authored goal field (planned_*) stay behind the boundary.
// The 404 for a not-live link is IDENTICAL to one for a link that never
// existed, so existence can't be probed. Old slugs answer with { redirectTo }.
router.get('/s/:slug', asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const viewerId = optionalUserId(req);

  const sf = (await query(
    `SELECT ${SHOWCASE_SAVE_COLUMNS}
     FROM save_files sf
     JOIN users u ON u.id = sf.user_id
     WHERE sf.showcase_slug = $1 AND sf.deleted_at IS NULL`,
    [slug],
  )).rows[0] as ShowcaseSaveRow | undefined;

  if (!sf) {
    // Not the current slug of any save — maybe one it used to have.
    const old = (await query(
      `SELECT sf.showcase_slug, sf.showcase_live, sf.user_id
       FROM showcase_slugs ss JOIN save_files sf ON sf.id = ss.save_file_id
       WHERE ss.slug = $1 AND sf.deleted_at IS NULL`,
      [slug],
    )).rows[0] as { showcase_slug: string | null; showcase_live: boolean; user_id: string } | undefined;
    if (old?.showcase_slug && (old.showcase_live || old.user_id === viewerId)) {
      res.json({ redirectTo: old.showcase_slug });
      return;
    }
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const isOwner = viewerId !== null && viewerId === sf.user_id;
  if (!sf.showcase_live && !isOwner) { res.status(404).json({ error: 'Not found' }); return; }

  // Count the visit. The whole page is this one request, so one increment is
  // one view. The owner looking at their own page doesn't count, and neither
  // does a page that isn't live — both would be the creator, not an audience.
  //
  // Fire-and-forget: a tally that can't be written is worth less than the page
  // it would have failed to serve. Nothing here records who visited.
  if (sf.showcase_live && !isOwner) {
    query(
      `INSERT INTO showcase_views (slug, day, count) VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (slug, day) DO UPDATE SET count = showcase_views.count + 1`,
      [slug],
    ).catch(() => {});
  }

  res.json(await buildShowcasePayload(sf, isOwner));
}));

export default router;
