import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateBody } from '../middleware/validate';
import { rateLimit } from '../middleware/rateLimit';

/**
 * POST /api/import-events — record that an import or re-sync was attempted.
 *
 * Parsing and applying a save both happen in the browser, so the client is the
 * only thing that knows how an attempt ended. It posts one row at the end of
 * every attempt, INCLUDING the failures — a failed import used to be entirely
 * invisible unless Sentry happened to catch it, and the user simply left.
 *
 * ★ Fire-and-forget in both directions. The client never awaits this and never
 * surfaces its errors, and this route never rejects an attempt over its own
 * bookkeeping: an unknown or someone else's save id is stored as NULL rather
 * than answered with an error. Logging must not be able to fail an import.
 */
const router = Router();

router.use(requireAuth);

// A real user tops out at a handful of attempts an hour; this only bites a
// script. Generous enough that a frustrated retry loop still gets recorded.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));

/** Long enough to name what broke, short enough that nobody pastes a stack in. */
const SUMMARY_MAX = 300;

const EventBody = z.object({
  saveFileId: z.string().max(64).nullish(),
  kind: z.enum(['import', 'resync']),
  ok: z.boolean(),
  errorSummary: z.string().max(2000).nullish(),
  simCount: z.number().int().min(0).max(1_000_000).nullish(),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).nullish(),
}).strict();

router.post('/', validateBody(EventBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { saveFileId, kind, ok, errorSummary, simCount, durationMs } = req.body as z.infer<typeof EventBody>;

  // Only attach a save id the caller actually owns. A half-created save that
  // was already binned, or an id from another account, both land as NULL —
  // the attempt is still worth recording either way.
  let ownedSaveId: string | null = null;
  if (saveFileId) {
    const row = (await query(
      'SELECT id FROM save_files WHERE id = $1 AND user_id = $2',
      [saveFileId, req.userId!],
    )).rows[0];
    ownedSaveId = row ? saveFileId : null;
  }

  await query(
    `INSERT INTO import_events (id, user_id, save_file_id, kind, ok, error_summary, sim_count, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      nanoid(),
      req.userId!,
      ownedSaveId,
      kind,
      ok,
      errorSummary ? errorSummary.slice(0, SUMMARY_MAX) : null,
      simCount ?? null,
      durationMs ?? null,
    ],
  );

  res.status(201).json({ ok: true });
}));

export default router;
