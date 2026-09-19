import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateBody } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Rich fields (employees/criteria/activities/fee/price/renown/alignment/perks)
// are accepted on create + patch so import and the silent re-sync can set them;
// hand-created businesses author the editable subset.
const richFields = {
  employeeSimIds: z.array(z.string().max(64)).max(8).optional(),
  customerCriteria: z.array(z.record(z.string(), z.unknown())).max(32).optional(),
  activities: z.array(z.record(z.string(), z.unknown())).max(128).optional(),
  feeMode: z.enum(['disabled', 'hourly', 'one-time', 'unknown']).optional(),
  priceModifierPct: z.number().int().min(-100).max(1000).optional(),
  renownRank: z.number().int().min(0).max(5).nullish(),
  alignment: z.number().int().min(1).max(7).nullish(),
  perkPoints: z.number().int().min(0).max(100000).optional(),
};

const SBCreateBody = z.object({
  name: z.string().min(1).max(200),
  icon: z.string().max(64).optional(),
  notes: z.string().max(10_000).optional(),
  description: z.string().max(10_000).optional(),
  ...richFields,
  sourceId: z.string().max(64).nullish(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

const SBPatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  icon: z.string().max(64).optional(),
  notes: z.string().max(10_000).optional(),
  description: z.string().max(10_000).optional(),
  ownerSimId: z.string().max(64).nullable().optional(),
  ...richFields,
  // The WHOLE lot set at once. The assign/unassign endpoints below still exist
  // for the editor (one lot per click); this is for re-sync, which needs the
  // reconciled set to land in the same write as last_imported_state. Split
  // across two requests, a failed lot move plus a written baseline leaves the
  // business on the wrong lots with no later sync willing to look again — and a
  // business from the save has no lot controls in the UI to fix it by hand.
  assignedLotKeys: z.array(z.string().max(200)).max(64).optional(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

async function ownsSaveFile(saveFileId: string, userId: string): Promise<boolean> {
  return !!((await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, userId])).rows[0]);
}

// POST /api/save-files/:id/small-businesses
router.post('/', validateBody(SBCreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const b = req.body as z.infer<typeof SBCreateBody>;
  const { name, icon, notes, description, sourceId, lastImportedState } = b;

  const id = nanoid();
  await query(
    `INSERT INTO small_businesses (id, save_file_id, name, icon, notes, description,
       employee_sim_ids, customer_criteria, activities, fee_mode, price_modifier_pct,
       renown_rank, alignment, perk_points, source_id, last_imported_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [id, saveFileId, name, icon ?? '', notes ?? '', description ?? '',
     JSON.stringify(b.employeeSimIds ?? []), JSON.stringify(b.customerCriteria ?? []), JSON.stringify(b.activities ?? []),
     b.feeMode ?? 'unknown', b.priceModifierPct ?? 0, b.renownRank ?? null, b.alignment ?? null, b.perkPoints ?? 0,
     sourceId ?? null, lastImportedState ? JSON.stringify(lastImportedState) : null],
  );
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.status(201).json({
    id, name, icon: icon ?? '', notes: notes ?? '', description: description ?? '', assignedLotKeys: [], ownerSimId: null,
    employeeSimIds: b.employeeSimIds ?? [], customerCriteria: b.customerCriteria ?? [], activities: b.activities ?? [],
    feeMode: b.feeMode ?? 'unknown', priceModifierPct: b.priceModifierPct ?? 0,
    renownRank: b.renownRank ?? null, alignment: b.alignment ?? null, perkPoints: b.perkPoints ?? 0,
    sourceId: sourceId ?? null,
  });
}));

// PATCH /api/save-files/:id/small-businesses/:sbId
router.patch('/:sbId', validateBody(SBPatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, sbId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const sb = (await query('SELECT id FROM small_businesses WHERE id = $1 AND save_file_id = $2', [sbId, saveFileId])).rows[0];
  if (!sb) { res.status(404).json({ error: 'Small business not found' }); return; }

  const b = req.body as z.infer<typeof SBPatchBody>;
  const { name, icon, notes, description, ownerSimId, lastImportedState } = b;

  // Same guarantee the per-lot assign endpoint gives: every key must be a lot in
  // THIS save. Deduped, since assigned_lot_keys is a set.
  let lotKeys: string[] | undefined;
  if (b.assignedLotKeys !== undefined) {
    const known = new Set(
      ((await query('SELECT lot_key FROM lots WHERE save_file_id = $1', [saveFileId])).rows as { lot_key: string }[])
        .map((r) => r.lot_key),
    );
    const unknown = b.assignedLotKeys.find((k) => !known.has(k));
    if (unknown !== undefined) { res.status(400).json({ error: `Lot not found: ${unknown}` }); return; }
    lotKeys = [...new Set(b.assignedLotKeys)];
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined)              { fields.push(`name = $${values.length + 1}`);               values.push(name); }
  if (icon !== undefined)              { fields.push(`icon = $${values.length + 1}`);               values.push(icon); }
  if (notes !== undefined)             { fields.push(`notes = $${values.length + 1}`);              values.push(notes); }
  if (description !== undefined)       { fields.push(`description = $${values.length + 1}`);        values.push(description); }
  if (ownerSimId !== undefined)        { fields.push(`owner_sim_id = $${values.length + 1}`);       values.push(ownerSimId); }
  if (b.employeeSimIds !== undefined)  { fields.push(`employee_sim_ids = $${values.length + 1}`);  values.push(JSON.stringify(b.employeeSimIds)); }
  if (b.customerCriteria !== undefined){ fields.push(`customer_criteria = $${values.length + 1}`); values.push(JSON.stringify(b.customerCriteria)); }
  if (b.activities !== undefined)      { fields.push(`activities = $${values.length + 1}`);        values.push(JSON.stringify(b.activities)); }
  if (b.feeMode !== undefined)         { fields.push(`fee_mode = $${values.length + 1}`);          values.push(b.feeMode); }
  if (b.priceModifierPct !== undefined){ fields.push(`price_modifier_pct = $${values.length + 1}`); values.push(b.priceModifierPct); }
  if (b.renownRank !== undefined)      { fields.push(`renown_rank = $${values.length + 1}`);       values.push(b.renownRank ?? null); }
  if (b.alignment !== undefined)       { fields.push(`alignment = $${values.length + 1}`);         values.push(b.alignment ?? null); }
  if (b.perkPoints !== undefined)      { fields.push(`perk_points = $${values.length + 1}`);       values.push(b.perkPoints); }
  if (lotKeys !== undefined)           { fields.push(`assigned_lot_keys = $${values.length + 1}`);  values.push(JSON.stringify(lotKeys)); }
  if (lastImportedState !== undefined) { fields.push(`last_imported_state = $${values.length + 1}`); values.push(JSON.stringify(lastImportedState)); }

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(sbId);
  await query(`UPDATE small_businesses SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/small-businesses/:sbId
router.delete('/:sbId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, sbId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  await query('DELETE FROM small_businesses WHERE id = $1 AND save_file_id = $2', [sbId, saveFileId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

// POST /api/save-files/:id/small-businesses/:sbId/assign/:lotKey — ADD a lot.
router.post('/:sbId/assign/:lotKey', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, sbId } = req.params;
  const lotKey = decodeURIComponent(req.params.lotKey);
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const sb = (await query('SELECT assigned_lot_keys FROM small_businesses WHERE id = $1 AND save_file_id = $2', [sbId, saveFileId])).rows[0] as { assigned_lot_keys: string } | undefined;
  if (!sb) { res.status(404).json({ error: 'Small business not found' }); return; }

  const lot = (await query('SELECT id FROM lots WHERE save_file_id = $1 AND lot_key = $2', [saveFileId, lotKey])).rows[0];
  if (!lot) { res.status(404).json({ error: 'Lot not found' }); return; }

  const keys: string[] = JSON.parse(sb.assigned_lot_keys || '[]');
  if (!keys.includes(lotKey)) keys.push(lotKey);
  await query('UPDATE small_businesses SET assigned_lot_keys = $1 WHERE id = $2', [JSON.stringify(keys), sbId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/small-businesses/:sbId/assign/:lotKey — remove ONE lot.
router.delete('/:sbId/assign/:lotKey', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, sbId } = req.params;
  const lotKey = decodeURIComponent(req.params.lotKey);
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const sb = (await query('SELECT assigned_lot_keys FROM small_businesses WHERE id = $1 AND save_file_id = $2', [sbId, saveFileId])).rows[0] as { assigned_lot_keys: string } | undefined;
  if (!sb) { res.status(404).json({ error: 'Small business not found' }); return; }

  const keys: string[] = JSON.parse(sb.assigned_lot_keys || '[]').filter((k: string) => k !== lotKey);
  await query('UPDATE small_businesses SET assigned_lot_keys = $1 WHERE id = $2', [JSON.stringify(keys), sbId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/small-businesses/:sbId/assign — clear ALL lots.
// (Owner is decoupled from lots now, so this no longer touches owner_household_id.)
router.delete('/:sbId/assign', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, sbId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  await query(`UPDATE small_businesses SET assigned_lot_keys = '[]' WHERE id = $1`, [sbId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

export default router;
