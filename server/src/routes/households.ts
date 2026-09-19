import { Router, Response } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateBody } from '../middleware/validate';
import { uploadToR2, deleteFromR2 } from '../lib/r2';

// Household body schemas. The `composition` field is an opaque object — the
// app validates its shape at the type level (HouseholdComposition); on the
// server we just check that it's an object so we don't try to JSON.stringify
// a primitive.
// Household funds (Simoleons) — observed game-truth, surfaced read-only. The game
// caps at INT32_MAX, which fits a JS number, so it travels as a plain number.
const MoneySchema = z.number().int().min(0).max(2_147_483_647).nullish();

// Provenance — classified at import (Yours/EA/Mod + sub-label + creator). Set on
// create and refreshed on re-sync; never user-edited.
const ProvenanceSchema = z.enum(['yours', 'ea', 'mod']).nullish();
const ProvenanceSubSchema = z.string().max(64).nullish();
const CreatorNameSchema = z.string().max(200).nullish();
// Visibility override — user-authored, sticky. Defaults to 'auto' in the DB.
const VisibilitySchema = z.enum(['pinned', 'auto', 'sent_to_town']).optional();

const HouseholdCreateBody = z.object({
  name: z.string().min(1).max(200),
  composition: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(10_000).optional(),
  description: z.string().max(10_000).optional(),
  sourceId: z.string().max(64).nullish(),
  money: MoneySchema,
  plannedMoney: MoneySchema, // planner-authored funds GOAL (threshold target)
  provenance: ProvenanceSchema,
  provenanceSub: ProvenanceSubSchema,
  creatorName: CreatorNameSchema,
  visibility: VisibilitySchema,
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

const HouseholdPatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  composition: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(10_000).optional(),
  description: z.string().max(10_000).optional(),
  // Adopt-on-realization (Track B): a plan-only shell can be promoted to a real
  // household in place, taking the game record's source id. Nullable so a
  // household can also be de-linked back to plan-only if ever needed.
  sourceId: z.string().max(64).nullish(),
  money: MoneySchema,
  plannedMoney: MoneySchema,
  provenance: ProvenanceSchema,
  provenanceSub: ProvenanceSubSchema,
  creatorName: CreatorNameSchema,
  visibility: VisibilitySchema,
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

const thumbUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — household thumbs are ~50–120KB
});

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function ownsSaveFile(saveFileId: string, userId: string): Promise<boolean> {
  return !!((await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, userId])).rows[0]);
}

async function removeHouseholdFromLot(saveFileId: string, householdId: string, client: PoolClient) {
  await client.query(
    `UPDATE lots
     SET household_ids = (
       SELECT COALESCE(json_agg(elem)::text, '[]')
       FROM json_array_elements_text(household_ids::json) AS t(elem)
       WHERE t.elem != $1
     )
     WHERE save_file_id = $2
       AND household_ids::jsonb @> to_jsonb($1::text)`,
    [householdId, saveFileId],
  );
}

// POST /api/save-files/:id/households
router.post('/', validateBody(HouseholdCreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const { name, composition, notes, description, sourceId, money, plannedMoney, provenance, provenanceSub, creatorName, visibility, lastImportedState } = req.body as z.infer<typeof HouseholdCreateBody>;

  const id = nanoid();
  await query(
    'INSERT INTO households (id, save_file_id, name, composition, notes, description, source_id, money, planned_money, provenance, provenance_sub, creator_name, visibility, last_imported_state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
    [id, saveFileId, name, JSON.stringify(composition ?? {}), notes ?? '', description ?? '', sourceId ?? null, money ?? null, plannedMoney ?? null, provenance ?? null, provenanceSub ?? null, creatorName ?? null, visibility ?? 'auto', lastImportedState ? JSON.stringify(lastImportedState) : null],
  );
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.status(201).json({ id, name, composition: composition ?? {}, notes: notes ?? '', description: description ?? '', assignedLotKey: null, sourceId: sourceId ?? null, money: money ?? null, provenance: provenance ?? null, provenanceSub: provenanceSub ?? null, creatorName: creatorName ?? null, visibility: visibility ?? 'auto', thumbnailFilename: null });
}));

// PATCH /api/save-files/:id/households/:hId
router.patch('/:hId', validateBody(HouseholdPatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, hId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const h = (await query('SELECT id FROM households WHERE id = $1 AND save_file_id = $2', [hId, saveFileId])).rows[0];
  if (!h) { res.status(404).json({ error: 'Household not found' }); return; }

  const { name, composition, notes, description, sourceId, money, plannedMoney, provenance, provenanceSub, creatorName, visibility, lastImportedState } = req.body as z.infer<typeof HouseholdPatchBody>;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined)              { fields.push(`name = $${values.length + 1}`);                 values.push(name); }
  if (composition !== undefined)       { fields.push(`composition = $${values.length + 1}`);          values.push(JSON.stringify(composition)); }
  if (notes !== undefined)             { fields.push(`notes = $${values.length + 1}`);                values.push(notes); }
  if (description !== undefined)       { fields.push(`description = $${values.length + 1}`);          values.push(description); }
  if (sourceId !== undefined)          { fields.push(`source_id = $${values.length + 1}`);            values.push(sourceId); }
  if (money !== undefined)             { fields.push(`money = $${values.length + 1}`);                values.push(money); }
  if (plannedMoney !== undefined)      { fields.push(`planned_money = $${values.length + 1}`);        values.push(plannedMoney); }
  if (provenance !== undefined)        { fields.push(`provenance = $${values.length + 1}`);           values.push(provenance); }
  if (provenanceSub !== undefined)     { fields.push(`provenance_sub = $${values.length + 1}`);       values.push(provenanceSub); }
  if (creatorName !== undefined)       { fields.push(`creator_name = $${values.length + 1}`);         values.push(creatorName); }
  if (visibility !== undefined)        { fields.push(`visibility = $${values.length + 1}`);           values.push(visibility); }
  if (lastImportedState !== undefined) { fields.push(`last_imported_state = $${values.length + 1}`);  values.push(JSON.stringify(lastImportedState)); }

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(hId);
  await query(`UPDATE households SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/households/:hId
router.delete('/:hId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, hId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  let preservedSimIds: string[] = [];
  let deletedSimIds: string[] = [];
  await withTransaction(async (client) => {
    await removeHouseholdFromLot(saveFileId, hId, client);

    // The family tree is a durable memorial: any member who appears in a family
    // relationship is KEPT (moved to 'tree_only', off the roster, portrait
    // intact) rather than cascade-deleted with the household. Members with no
    // relationships (random NPCs) are deleted along with the household.
    const members = (await client.query(
      'SELECT id FROM sims WHERE save_file_id = $1 AND household_id = $2',
      [saveFileId, hId],
    )).rows as Array<{ id: string }>;
    const related = (await client.query(
      `SELECT DISTINCT s.id FROM sims s
        WHERE s.save_file_id = $1 AND s.household_id = $2
          AND EXISTS (SELECT 1 FROM sim_relationships r
                       WHERE r.save_file_id = $1 AND (r.sim_a_id = s.id OR r.sim_b_id = s.id))`,
      [saveFileId, hId],
    )).rows as Array<{ id: string }>;
    const keep = new Set(related.map((r) => r.id));
    preservedSimIds = [...keep];
    deletedSimIds = members.map((m) => m.id).filter((id) => !keep.has(id));

    if (preservedSimIds.length) {
      await client.query(
        `UPDATE sims SET household_id = NULL, record_status = 'tree_only', updated_at = NOW()
          WHERE save_file_id = $1 AND id = ANY($2::text[])`,
        [saveFileId, preservedSimIds],
      );
    }
    // Any sim with a planned move TO this household now points at nothing — clear
    // the dangling sticker (planned_move_household_id has no FK to cascade).
    await client.query(
      'UPDATE sims SET planned_move_household_id = NULL, updated_at = NOW() WHERE save_file_id = $1 AND planned_move_household_id = $2',
      [saveFileId, hId],
    );
    // remaining (relationship-less) members cascade-delete with the household
    await client.query('DELETE FROM households WHERE id = $1 AND save_file_id = $2', [hId, saveFileId]);
    await client.query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  });

  res.json({ ok: true, preservedSimIds, deletedSimIds });
}));

// Removes one household from every lot in the save that lists it. Used both to
// strip the household being assigned off its old lot, and to move an occupant
// out to make room (the `displace` path below).
const STRIP_FROM_LOTS = `
  UPDATE lots
  SET household_ids = (
    SELECT COALESCE(json_agg(elem)::text, '[]')
    FROM json_array_elements_text(household_ids::json) AS t(elem)
    WHERE t.elem != $1
  )
  WHERE save_file_id = $2
    AND household_ids::jsonb @> to_jsonb($1::text)`;

/**
 * How many households a lot holds — the mirror of maxHouseholdsForLot in
 * src/data/worlds.ts. Until this existed the cap was enforced ONLY by the two
 * pickers hiding full lots, so anything that assigned directly (notably the
 * Households panel's revert-to-save) could silently put two households in a
 * one-household house.
 *
 * Deliberately COUNT-ONLY — not the lot editor's stricter "a venue holds zero"
 * rule. A re-sync legitimately assigns a household to a lot the plan types as a
 * venue, because the save says someone lives there; coherence's
 * venueLotsToRevert then corrects the lot's TYPE afterwards. Refusing it here
 * would make the sync silently drop a move the player actually made in-game.
 */
function lotCapacity(customType: string | null): number {
  return customType === 'Residential Rental' ? 6 : 1;
}

// POST /api/save-files/:id/households/:hId/assign/:lotKey
// `?displace=1` — caller asserts reality outranks the plan (the re-sync). A full
// lot then makes room by moving plan-only households out rather than refusing.
router.post('/:hId/assign/:lotKey', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, hId } = req.params;
  const lotKey = decodeURIComponent(req.params.lotKey);
  const displace = req.query.displace === '1';

  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const lot = (await query(
    'SELECT id, household_ids, custom_name, custom_type FROM lots WHERE save_file_id = $1 AND lot_key = $2',
    [saveFileId, lotKey],
  )).rows[0] as { id: string; household_ids: string; custom_name: string | null; custom_type: string | null } | undefined;
  if (!lot) { res.status(404).json({ error: 'Lot not found' }); return; }

  const h = (await query(
    'SELECT id, assigned_lot_key FROM households WHERE id = $1 AND save_file_id = $2',
    [hId, saveFileId],
  )).rows[0] as { id: string; assigned_lot_key: string | null } | undefined;
  if (!h) { res.status(404).json({ error: 'Household not found' }); return; }

  // ── Capacity ────────────────────────────────────────────────────────────
  // Re-assigning a household to the lot it's already on is a no-op that must
  // stay allowed (the sync leans on it to heal drift), so it never counts.
  const occupants: string[] = JSON.parse(lot.household_ids || '[]');
  const capacity = lotCapacity(lot.custom_type);
  let displacing: string[] = [];
  if (!occupants.includes(hId) && occupants.length >= capacity) {
    if (!displace) {
      res.status(409).json({ error: `${lot.custom_name || 'That lot'} is full.` });
      return;
    }
    // Reality wins: move plan-only households (no save origin) out to make
    // room, the same "step aside" the first-link sync already does by hand.
    // If that isn't enough the assign still goes through — a sync must never
    // silently drop a move the save actually made.
    displacing = ((await query(
      `SELECT id FROM households
       WHERE save_file_id = $1 AND source_id IS NULL AND id::text = ANY($2::text[])`,
      [saveFileId, occupants],
    )).rows as { id: string }[])
      .map((r) => r.id)
      .slice(0, occupants.length - capacity + 1);
  }

  await withTransaction(async (client) => {
    for (const displacedId of displacing) {
      await client.query(STRIP_FROM_LOTS, [displacedId, saveFileId]);
      await client.query('UPDATE households SET assigned_lot_key = NULL WHERE id = $1', [displacedId]);
    }

    // Strip the household from any old lot it was on (could be the same lot
    // we're about to assign to — that's fine, we re-add below using FRESH
    // lot state). Doing this for every lot in the save (filtered by membership)
    // also self-heals stray references on lots we no longer claim.
    await client.query(STRIP_FROM_LOTS, [hId, saveFileId]);

    // Re-read the destination lot's household_ids from inside the transaction
    // so we see the result of the strip above. Critical when reassigning to the
    // same lot the household was already on: without a fresh read we'd skip the
    // re-add (using stale pre-transaction data) and end up booted from the lot
    // while household.assigned_lot_key still points at it.
    const freshLot = (await client.query(
      'SELECT household_ids FROM lots WHERE id = $1',
      [lot.id],
    )).rows[0] as { household_ids: string } | undefined;
    const freshIds: string[] = freshLot ? JSON.parse(freshLot.household_ids) : [];
    if (!freshIds.includes(hId)) {
      await client.query('UPDATE lots SET household_ids = $1 WHERE id = $2', [
        JSON.stringify([...freshIds, hId]),
        lot.id,
      ]);
    }

    await client.query('UPDATE households SET assigned_lot_key = $1 WHERE id = $2', [lotKey, hId]);
    await client.query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  });

  res.json({ ok: true });
}));

// PUT /api/save-files/:id/households/:hId/thumbnail — upload household portrait (JPEG)
// Stores BOTH a `households.thumbnail_filename` reference AND a row in the
// `photos` table tagged as a 'built' household photo with caption "Auto-imported portrait".
// The photos-table entry makes the portrait appear in the household's photo strip on
// the showcase page, alongside any user-uploaded photos; the household card's cover
// picks the newest photo, so later user uploads naturally take over as the main image.
router.put('/:hId/thumbnail', thumbUpload.single('thumbnail'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, hId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }
  if (!req.file) { res.status(400).json({ error: 'thumbnail file required' }); return; }

  const h = (await query(
    'SELECT thumbnail_filename FROM households WHERE id = $1 AND save_file_id = $2',
    [hId, saveFileId],
  )).rows[0] as { thumbnail_filename: string | null } | undefined;
  if (!h) { res.status(404).json({ error: 'Household not found' }); return; }

  const mimetype = req.file.mimetype || 'image/jpeg';
  const ext = mimetype === 'image/png' ? 'png' : 'jpg';
  const filename = `household-thumbs/${nanoid()}.${ext}`;
  await uploadToR2(req.file.buffer, filename, mimetype);

  // Remove the previous auto-imported portrait, if any (file + photo row).
  if (h.thumbnail_filename) {
    deleteFromR2(h.thumbnail_filename).catch(() => { /* ignore */ });
    await query(
      `DELETE FROM photos WHERE save_file_id = $1 AND target_type = 'household' AND target_key = $2 AND filename = $3`,
      [saveFileId, hId, h.thumbnail_filename],
    );
  }

  const photoId = nanoid();
  await query(
    `INSERT INTO photos (id, user_id, type, save_file_id, target_type, target_key, filename, caption, categories, tags, gallery_creator)
     VALUES ($1, $2, 'built', $3, 'household', $4, $5, $6, '[]', '[]', NULL)`,
    [photoId, req.userId, saveFileId, hId, filename, ''],
  );

  await query('UPDATE households SET thumbnail_filename = $1 WHERE id = $2', [filename, hId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ thumbnailFilename: filename, photoId });
}));

// DELETE /api/save-files/:id/households/:hId/thumbnail
router.delete('/:hId/thumbnail', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, hId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const h = (await query(
    'SELECT thumbnail_filename FROM households WHERE id = $1 AND save_file_id = $2',
    [hId, saveFileId],
  )).rows[0] as { thumbnail_filename: string | null } | undefined;
  if (!h) { res.status(404).json({ error: 'Household not found' }); return; }

  if (h.thumbnail_filename) {
    deleteFromR2(h.thumbnail_filename).catch(() => { /* ignore */ });
    await query(
      `DELETE FROM photos WHERE save_file_id = $1 AND target_type = 'household' AND target_key = $2 AND filename = $3`,
      [saveFileId, hId, h.thumbnail_filename],
    );
  }
  await query('UPDATE households SET thumbnail_filename = NULL WHERE id = $1', [hId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/households/:hId/assign
router.delete('/:hId/assign', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, hId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const h = (await query(
    'SELECT assigned_lot_key FROM households WHERE id = $1 AND save_file_id = $2',
    [hId, saveFileId],
  )).rows[0] as { assigned_lot_key: string | null } | undefined;
  if (!h) { res.status(404).json({ error: 'Household not found' }); return; }

  await withTransaction(async (client) => {
    await removeHouseholdFromLot(saveFileId, hId, client);
    await client.query('UPDATE households SET assigned_lot_key = NULL WHERE id = $1', [hId]);
    await client.query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  });

  res.json({ ok: true });
}));

export default router;
