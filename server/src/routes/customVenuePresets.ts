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

// Save-global preset library. schedules = ParsedCustomVenue[] (roles + slots);
// roles = ParsedVenueRole[]. Stored verbatim as JSONB; labels resolve at display.
// We validate they're arrays but don't pin the element shape (parser owns it).
const presetItem = z.object({ name: z.string().max(200).optional() }).passthrough();
const ReplaceBody = z.object({
  schedules: z.array(presetItem),
  roles: z.array(presetItem),
}).strict();

// PUT /api/save-files/:id/custom-venue-presets
// Replaces all IMPORT-sourced presets with the supplied set (a read-only library
// snapshot refreshed on each import/re-sync). User-authored presets (source =
// 'user', future authoring phase) are left untouched.
router.put('/', validateBody(ReplaceBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const { schedules, roles } = req.body as z.infer<typeof ReplaceBody>;

  await query("DELETE FROM custom_venue_presets WHERE save_file_id = $1 AND source = 'import'", [saveFileId]);

  const rows: Array<{ kind: string; data: unknown }> = [
    ...schedules.map((d) => ({ kind: 'schedule', data: d })),
    ...roles.map((d) => ({ kind: 'role', data: d })),
  ];
  for (const r of rows) {
    const name = (r.data as { name?: string }).name ?? '';
    await query(
      "INSERT INTO custom_venue_presets (id, save_file_id, kind, name, data, source) VALUES ($1, $2, $3, $4, $5, 'import')",
      [nanoid(), saveFileId, r.kind, name, JSON.stringify(r.data)],
    );
  }
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true, count: rows.length });
}));

// POST /api/save-files/:id/custom-venue-presets
// Create ONE planner-authored preset ("Save as preset"). Always source='planner'
// so the wholesale import refresh (which only touches source='import') never wipes
// it — i.e. planner presets survive re-sync untouched.
const CreateBody = z.object({
  kind: z.enum(['schedule', 'role']),
  name: z.string().max(200).default(''),
  data: z.record(z.string(), z.unknown()),   // parser-owned shape ({roles,slots} or a role); stored verbatim
}).strict();

router.post('/', validateBody(CreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const { kind, name, data } = req.body as z.infer<typeof CreateBody>;
  const id = nanoid();
  await query(
    "INSERT INTO custom_venue_presets (id, save_file_id, kind, name, data, source) VALUES ($1, $2, $3, $4, $5, 'planner')",
    [id, saveFileId, kind, name, JSON.stringify(data)],
  );
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ id });
}));

// PATCH /api/save-files/:id/custom-venue-presets/:presetId
// Overwrite a planner preset's name + data ("Update preset"). Import presets are
// read-only reference, so the source guard prevents ever rewriting one.
const UpdateBody = z.object({
  name: z.string().max(200).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict();

router.patch('/:presetId', validateBody(UpdateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, presetId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const { name, data } = req.body as z.infer<typeof UpdateBody>;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) { fields.push(`name = $${values.length + 1}`); values.push(name); }
  if (data !== undefined) { fields.push(`data = $${values.length + 1}`); values.push(JSON.stringify(data)); }
  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(presetId, saveFileId);
  await query(
    `UPDATE custom_venue_presets SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND save_file_id = $${values.length} AND source = 'planner'`,
    values,
  );
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/custom-venue-presets/:presetId
// Delete ONE planner preset. Import presets are managed by the wholesale refresh,
// so the source guard keeps this from ever removing reference library entries.
router.delete('/:presetId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, presetId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  await query("DELETE FROM custom_venue_presets WHERE id = $1 AND save_file_id = $2 AND source = 'planner'", [presetId, saveFileId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

export default router;
