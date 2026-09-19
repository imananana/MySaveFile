import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateBody } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function ownsSaveFile(saveFileId: string, userId: string): Promise<boolean> {
  return !!((await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, userId])).rows[0]);
}

const Season = z.enum(['Summer', 'Fall', 'Winter', 'Spring']);

// Imported holiday's day+season at each plan length ('1'|'2'|'4'). null/absent
// for hand-made holidays.
const ScaledDates = z.record(z.string().max(2), z.object({ day: z.number().int().min(1).max(28), season: Season })).nullish();

const HolidayCreateBody = z.object({
  name: z.string().max(200).optional(),
  icon: z.string().max(64).optional(),
  season: Season.optional(),
  day: z.number().int().min(1).max(28).optional(),
  notes: z.string().max(10_000).optional(),
  traditions: z.array(z.string().max(16)).max(64).optional(),
  unassigned: z.boolean().optional(),
  timeOff: z.boolean().optional(),
  decorationPreset: z.string().max(32).nullish(),
  sourceId: z.string().max(64).nullish(),
  scaledDates: ScaledDates,
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

const HolidayPatchBody = z.object({
  name: z.string().max(200).optional(),
  icon: z.string().max(64).optional(),
  season: Season.optional(),
  day: z.number().int().min(1).max(28).optional(),
  notes: z.string().max(10_000).optional(),
  traditions: z.array(z.string().max(16)).max(64).optional(),
  unassigned: z.boolean().optional(),
  timeOff: z.boolean().optional(),
  decorationPreset: z.string().max(32).nullish(),
  scaledDates: ScaledDates,
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

// POST /api/save-files/:id/holidays
router.post('/', validateBody(HolidayCreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const { name, icon, season, day, notes, traditions, unassigned, timeOff, decorationPreset, sourceId, scaledDates, lastImportedState } = req.body as z.infer<typeof HolidayCreateBody>;

  const id = nanoid();
  await query(
    'INSERT INTO holidays (id, save_file_id, name, icon, season, day, notes, traditions, unassigned, time_off, decoration_preset, source_id, scaled_dates, last_imported_state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    [id, saveFileId, name ?? '', icon ?? '', season ?? 'Spring', day ?? 1, notes ?? '', JSON.stringify(traditions ?? []), unassigned ?? false, timeOff ?? false, decorationPreset ?? null, sourceId ?? null, scaledDates ? JSON.stringify(scaledDates) : null, lastImportedState ? JSON.stringify(lastImportedState) : null],
  );
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.status(201).json({ id, name: name ?? '', icon: icon ?? '', season: season ?? 'Spring', day: day ?? 1, notes: notes ?? '', traditions: traditions ?? [], unassigned: unassigned ?? false, timeOff: timeOff ?? false, decorationPreset: decorationPreset ?? null, sourceId: sourceId ?? null, scaledDates: scaledDates ?? null });
}));

// PATCH /api/save-files/:id/holidays/:hId
router.patch('/:hId', validateBody(HolidayPatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, hId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const h = (await query('SELECT id FROM holidays WHERE id = $1 AND save_file_id = $2', [hId, saveFileId])).rows[0];
  if (!h) { res.status(404).json({ error: 'Holiday not found' }); return; }

  const { name, icon, season, day, notes, traditions, unassigned, timeOff, decorationPreset, scaledDates, lastImportedState } = req.body as z.infer<typeof HolidayPatchBody>;

  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined)              { fields.push(`name = $${values.length + 1}`);               values.push(name); }
  if (icon !== undefined)              { fields.push(`icon = $${values.length + 1}`);               values.push(icon); }
  if (season !== undefined)            { fields.push(`season = $${values.length + 1}`);             values.push(season); }
  if (day !== undefined)               { fields.push(`day = $${values.length + 1}`);                values.push(day); }
  if (notes !== undefined)             { fields.push(`notes = $${values.length + 1}`);              values.push(notes); }
  if (traditions !== undefined)        { fields.push(`traditions = $${values.length + 1}`);         values.push(JSON.stringify(traditions)); }
  if (unassigned !== undefined)        { fields.push(`unassigned = $${values.length + 1}`);         values.push(unassigned); }
  if (timeOff !== undefined)           { fields.push(`time_off = $${values.length + 1}`);           values.push(timeOff); }
  if (decorationPreset !== undefined)  { fields.push(`decoration_preset = $${values.length + 1}`);  values.push(decorationPreset); }
  if (scaledDates !== undefined)       { fields.push(`scaled_dates = $${values.length + 1}`);       values.push(scaledDates ? JSON.stringify(scaledDates) : null); }
  if (lastImportedState !== undefined) { fields.push(`last_imported_state = $${values.length + 1}`); values.push(JSON.stringify(lastImportedState)); }

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(hId);
  await query(`UPDATE holidays SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/holidays/:hId
router.delete('/:hId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, hId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  await query('DELETE FROM holidays WHERE id = $1 AND save_file_id = $2', [hId, saveFileId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

export default router;
