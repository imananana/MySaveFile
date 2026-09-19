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

// One row per lot tracked as a Custom Venue. `lotKey` is the matching key —
// it's unique per save and stable across re-imports, so we don't need a
// separate source_id like small_businesses/clubs/holidays.
// roles/slots are the parser's ParsedVenueRole[] / ParsedVenueSlot[] arrays,
// stored verbatim as JSONB (raw tuning ids; labels resolve at the display layer).
// We validate they're arrays but don't pin the element shape — the parser owns
// it, and pinning would couple this route to byte-format details.
const jsonArray = z.array(z.unknown());

const CustomVenueCreateBody = z.object({
  // Planner venues can be created lot-less (build the schedule first, assign a
  // lot later or never); imported venues always pass their lotKey.
  lotKey: z.string().min(1).max(200).nullable().optional(),
  name: z.string().max(200).optional(),
  venueSchedule: z.string().max(10_000).optional(),
  notes: z.string().max(10_000).optional(),
  roles: jsonArray.optional(),
  slots: jsonArray.optional(),
  // 'import' (default) for venues parsed from the save; 'planner' for ones the
  // user builds in the editor (those are never auto-removed on re-sync).
  source: z.enum(['import', 'planner']).optional(),
  isGetaway: z.boolean().optional(),
  hostHouseholdId: z.string().max(200).nullable().optional(),
  sourcePresetId: z.string().max(200).nullable().optional(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

const CustomVenuePatchBody = z.object({
  name: z.string().max(200).optional(),
  venueSchedule: z.string().max(10_000).optional(),
  notes: z.string().max(10_000).optional(),
  roles: jsonArray.optional(),
  slots: jsonArray.optional(),
  // lotKey can be set (assign a lot) or cleared to null (unassign).
  lotKey: z.string().min(1).max(200).nullable().optional(),
  isGetaway: z.boolean().optional(),
  hostHouseholdId: z.string().max(200).nullable().optional(),
  sourcePresetId: z.string().max(200).nullable().optional(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

// POST /api/save-files/:id/custom-venues
router.post('/', validateBody(CustomVenueCreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const { lotKey, name, venueSchedule, notes, roles, slots, source, isGetaway, hostHouseholdId, sourcePresetId, lastImportedState } = req.body as z.infer<typeof CustomVenueCreateBody>;

  // Confirm the lot exists in this save before binding (only when one's given —
  // planner venues may be created lot-less).
  if (lotKey) {
    const lot = (await query(
      'SELECT id FROM lots WHERE save_file_id = $1 AND lot_key = $2',
      [saveFileId, lotKey],
    )).rows[0];
    if (!lot) { res.status(404).json({ error: 'Lot not found' }); return; }
  }

  const id = nanoid();
  try {
    await query(
      'INSERT INTO custom_venues (id, save_file_id, lot_key, name, venue_schedule, notes, roles, slots, source, is_getaway, host_household_id, source_preset_id, last_imported_state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
      [id, saveFileId, lotKey ?? null, name ?? '', venueSchedule ?? '', notes ?? '',
       roles ? JSON.stringify(roles) : null, slots ? JSON.stringify(slots) : null,
       source ?? 'import', isGetaway ?? false, hostHouseholdId ?? null, sourcePresetId ?? null,
       lastImportedState ? JSON.stringify(lastImportedState) : null],
    );
  } catch (err) {
    // UNIQUE(save_file_id, lot_key) — one row per lot. Surface a clean 409
    // instead of bubbling the Postgres error so the client can decide whether
    // to patch the existing row.
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Custom venue already exists for this lot' });
      return;
    }
    throw err;
  }
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.status(201).json({
    id, lotKey: lotKey ?? null, name: name ?? '', venueSchedule: venueSchedule ?? '', notes: notes ?? '',
    roles: roles ?? [], slots: slots ?? [], source: source ?? 'import',
    isGetaway: isGetaway ?? false, hostHouseholdId: hostHouseholdId ?? null, sourcePresetId: sourcePresetId ?? null,
  });
}));

// PATCH /api/save-files/:id/custom-venues/:cvId
router.patch('/:cvId', validateBody(CustomVenuePatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, cvId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const cv = (await query('SELECT id FROM custom_venues WHERE id = $1 AND save_file_id = $2', [cvId, saveFileId])).rows[0];
  if (!cv) { res.status(404).json({ error: 'Custom venue not found' }); return; }

  const { name, venueSchedule, notes, roles, slots, lotKey, isGetaway, hostHouseholdId, sourcePresetId, lastImportedState } = req.body as z.infer<typeof CustomVenuePatchBody>;

  // Assigning a lot: confirm it exists in this save (null = unassign, no check).
  if (lotKey) {
    const lot = (await query('SELECT id FROM lots WHERE save_file_id = $1 AND lot_key = $2', [saveFileId, lotKey])).rows[0];
    if (!lot) { res.status(404).json({ error: 'Lot not found' }); return; }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined)              { fields.push(`name = $${values.length + 1}`);                 values.push(name); }
  if (venueSchedule !== undefined)     { fields.push(`venue_schedule = $${values.length + 1}`);      values.push(venueSchedule); }
  if (notes !== undefined)             { fields.push(`notes = $${values.length + 1}`);               values.push(notes); }
  if (roles !== undefined)             { fields.push(`roles = $${values.length + 1}`);               values.push(JSON.stringify(roles)); }
  if (slots !== undefined)             { fields.push(`slots = $${values.length + 1}`);               values.push(JSON.stringify(slots)); }
  if (lotKey !== undefined)            { fields.push(`lot_key = $${values.length + 1}`);             values.push(lotKey); }
  if (isGetaway !== undefined)         { fields.push(`is_getaway = $${values.length + 1}`);          values.push(isGetaway); }
  if (hostHouseholdId !== undefined)   { fields.push(`host_household_id = $${values.length + 1}`);   values.push(hostHouseholdId); }
  if (sourcePresetId !== undefined)    { fields.push(`source_preset_id = $${values.length + 1}`);   values.push(sourcePresetId); }
  if (lastImportedState !== undefined) { fields.push(`last_imported_state = $${values.length + 1}`); values.push(JSON.stringify(lastImportedState)); }

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }
  fields.push(`updated_at = NOW()`);

  values.push(cvId);
  try {
    await query(`UPDATE custom_venues SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  } catch (err) {
    // UNIQUE(save_file_id, lot_key) — the target lot already has a venue.
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That lot already has a custom venue' });
      return;
    }
    throw err;
  }
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/custom-venues/:cvId
//
// Deletes the tracking row only. The underlying lot's `customType = 'Custom
// Venue'` is intentionally NOT reset — the user can change the lot type
// separately if they also want to convert away.
router.delete('/:cvId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, cvId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  await query('DELETE FROM custom_venues WHERE id = $1 AND save_file_id = $2', [cvId, saveFileId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

export default router;
