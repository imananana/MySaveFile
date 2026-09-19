import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateBody } from '../middleware/validate';
import { rateLimit } from '../middleware/rateLimit';

/**
 * POST /api/feature-events — "someone used this button today".
 *
 * ★ Only for actions the database genuinely cannot infer. Most of what the
 * dashboard reports is read straight off state the app already writes, which
 * has the enormous advantage of covering all of history. This is for the few
 * things that leave no distinguishable trace — the randomizer above all, whose
 * output is byte-identical to a hand-built household.
 *
 * The whitelist is the point. An open string field would quietly become a
 * behaviour log; a fixed list means the set of things being counted is
 * reviewable in one screenful, right here.
 */
const router = Router();

router.use(requireAuth);
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

/**
 * Every feature that gets counted. Adding one is a deliberate act: it belongs
 * here AND on the dashboard's label list, or it's a number nobody reads.
 */
export const TRACKED_FEATURES = [
  'randomizer_save',   // saved a rolled household — indistinguishable from Create Household
  'portrait_sync',     // ran the localthumbcache portrait sync
  'lot_status',        // pressed a lot's Planned/Built button (NOT the auto-bump)
  'inspo_upload',      // uploaded to the inspo pool
  'tag_created',       // coined an inspo tag
  // The first page someone opens after a .save import lands them on the
  // overview — the database can't see WHERE they went first, only that pages
  // were eventually visited. One event per import, fired by the first
  // navigation away from the overview (see useFirstStopAfterImport). No event
  // at all is itself the signal: they never left.
  'first_stop_world',      // clicked into a world map
  'first_stop_sims',       // the sim roster
  'first_stop_households', // the household workspace
  'first_stop_family',     // the family tree
  'first_stop_photos',     // the photos page
  'first_stop_other',      // anything else (clubs, settings, showcase, …)
] as const;

const EventBody = z.object({
  feature: z.enum(TRACKED_FEATURES),
}).strict();

router.post('/', validateBody(EventBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { feature } = req.body as z.infer<typeof EventBody>;
  await query(
    `INSERT INTO feature_events (user_id, feature, day, count) VALUES ($1, $2, CURRENT_DATE, 1)
     ON CONFLICT (user_id, feature, day) DO UPDATE SET count = feature_events.count + 1`,
    [req.userId!, feature],
  );
  res.status(201).json({ ok: true });
}));

export default router;
