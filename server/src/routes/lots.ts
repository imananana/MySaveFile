import { Router, Response } from 'express';
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

const LotPatchBody = z.object({
  status: z.enum(['unplanned', 'planned', 'built']).optional(),
  customName: z.string().max(200).optional(),
  customType: z.string().max(100).optional(),
  notes: z.string().max(10_000).optional(),
  description: z.string().max(10_000).optional(),
  hasSmallBusiness: z.boolean().optional(),
  smallBusinessName: z.string().max(200).optional(),
  smallBusinessNotes: z.string().max(10_000).optional(),
  smallBusinessIcon: z.string().max(64).optional(),
  sourceId: z.string().max(64).nullish(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

// PATCH /api/save-files/:id/lots/:lotKey
router.patch('/:lotKey', validateBody(LotPatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  const lotKey = decodeURIComponent(req.params.lotKey);

  if (!await ownsSaveFile(saveFileId, req.userId!)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { status, customName, customType, notes, description, hasSmallBusiness, smallBusinessName, smallBusinessNotes, smallBusinessIcon, sourceId, lastImportedState } = req.body as z.infer<typeof LotPatchBody>;

  const lot = (await query('SELECT id FROM lots WHERE save_file_id = $1 AND lot_key = $2', [saveFileId, lotKey])).rows[0] as { id: string } | undefined;
  if (!lot) { res.status(404).json({ error: 'Lot not found' }); return; }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (status !== undefined)           { fields.push(`status = $${values.length + 1}`);               values.push(status); }
  if (customName !== undefined)       { fields.push(`custom_name = $${values.length + 1}`);           values.push(customName); }
  if (customType !== undefined)       { fields.push(`custom_type = $${values.length + 1}`);           values.push(customType); }
  if (notes !== undefined)            { fields.push(`notes = $${values.length + 1}`);                 values.push(notes); }
  if (description !== undefined)      { fields.push(`description = $${values.length + 1}`);           values.push(description); }
  if (hasSmallBusiness !== undefined) { fields.push(`has_small_business = $${values.length + 1}`);   values.push(hasSmallBusiness ? 1 : 0); }
  if (smallBusinessName !== undefined){ fields.push(`small_business_name = $${values.length + 1}`);  values.push(smallBusinessName); }
  if (smallBusinessNotes !== undefined){ fields.push(`small_business_notes = $${values.length + 1}`);values.push(smallBusinessNotes); }
  if (smallBusinessIcon !== undefined){ fields.push(`small_business_icon = $${values.length + 1}`);  values.push(smallBusinessIcon); }
  if (sourceId !== undefined)         { fields.push(`source_id = $${values.length + 1}`);             values.push(sourceId); }
  if (lastImportedState !== undefined){ fields.push(`last_imported_state = $${values.length + 1}`);   values.push(JSON.stringify(lastImportedState)); }

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(lot.id);
  await query(`UPDATE lots SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

export default router;
