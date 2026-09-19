import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { query, withTransaction } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateBody } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(requireAuth);

// Read-only game-truth fields (leaderSimId/criteria/rules/inviteOnly) are set on
// import and refreshed by the silent re-sync pass — never edited in the UI, but
// accepted on both create + patch so re-sync can update them.
const ClubCreateBody = z.object({
  name: z.string().min(1).max(200),
  icon: z.string().max(64).optional(),
  notes: z.string().max(10_000).optional(),
  description: z.string().max(10_000).optional(),
  memberSimIds: z.array(z.string().max(64)).max(100).optional(),
  leaderSimId: z.string().max(64).nullish(),
  criteria: z.array(z.record(z.string(), z.unknown())).max(32).optional(),
  rules: z.array(z.record(z.string(), z.unknown())).max(128).optional(),
  inviteOnly: z.boolean().optional(),
  hangoutVenueTypeId: z.string().max(32).nullish(),
  sourceId: z.string().max(64).nullish(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

const ClubPatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  icon: z.string().max(64).optional(),
  notes: z.string().max(10_000).optional(),
  description: z.string().max(10_000).optional(),
  memberSimIds: z.array(z.string().max(64)).max(100).optional(),
  leaderSimId: z.string().max(64).nullish(),
  criteria: z.array(z.record(z.string(), z.unknown())).max(32).optional(),
  rules: z.array(z.record(z.string(), z.unknown())).max(128).optional(),
  inviteOnly: z.boolean().optional(),
  hangoutVenueTypeId: z.string().max(32).nullish(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

async function ownsSaveFile(saveFileId: string, userId: string): Promise<boolean> {
  return !!((await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, userId])).rows[0]);
}

async function removeClubFromLot(saveFileId: string, clubId: string, client: PoolClient) {
  await client.query(
    `UPDATE lots
     SET club_ids = (
       SELECT COALESCE(json_agg(elem)::text, '[]')
       FROM json_array_elements_text(club_ids::json) AS t(elem)
       WHERE t.elem != $1
     )
     WHERE save_file_id = $2
       AND club_ids::jsonb @> to_jsonb($1::text)`,
    [clubId, saveFileId],
  );
}

// POST /api/save-files/:id/clubs
router.post('/', validateBody(ClubCreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const { name, icon, notes, description, memberSimIds, leaderSimId, criteria, rules, inviteOnly, hangoutVenueTypeId, sourceId, lastImportedState } = req.body as z.infer<typeof ClubCreateBody>;

  const id = nanoid();
  const members = memberSimIds ?? [];
  await query(
    `INSERT INTO clubs (id, save_file_id, name, icon, notes, description, member_sim_ids,
                        leader_sim_id, criteria, rules, invite_only, hangout_venue_type_id, source_id, last_imported_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [id, saveFileId, name, icon ?? '', notes ?? '', description ?? '', JSON.stringify(members),
     leaderSimId ?? null, JSON.stringify(criteria ?? []), JSON.stringify(rules ?? []), inviteOnly ?? false,
     hangoutVenueTypeId ?? null, sourceId ?? null, lastImportedState ? JSON.stringify(lastImportedState) : null],
  );
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.status(201).json({
    id, name, icon: icon ?? '', notes: notes ?? '', description: description ?? '', assignedLotKey: null,
    memberSimIds: members,
    leaderSimId: leaderSimId ?? null, criteria: criteria ?? [], rules: rules ?? [], inviteOnly: inviteOnly ?? false,
    hangoutVenueTypeId: hangoutVenueTypeId ?? null,
    sourceId: sourceId ?? null,
  });
}));

// PATCH /api/save-files/:id/clubs/:cId
router.patch('/:cId', validateBody(ClubPatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, cId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const c = (await query('SELECT id FROM clubs WHERE id = $1 AND save_file_id = $2', [cId, saveFileId])).rows[0];
  if (!c) { res.status(404).json({ error: 'Club not found' }); return; }

  const { name, icon, notes, description, memberSimIds, leaderSimId, criteria, rules, inviteOnly, hangoutVenueTypeId, lastImportedState } = req.body as z.infer<typeof ClubPatchBody>;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined)  { fields.push(`name = $${values.length + 1}`);  values.push(name); }
  if (icon !== undefined)  { fields.push(`icon = $${values.length + 1}`);  values.push(icon); }
  if (notes !== undefined) { fields.push(`notes = $${values.length + 1}`); values.push(notes); }
  if (description !== undefined) { fields.push(`description = $${values.length + 1}`); values.push(description); }
  if (memberSimIds !== undefined) {
    fields.push(`member_sim_ids = $${values.length + 1}`);
    values.push(JSON.stringify(memberSimIds));
  }
  if (leaderSimId !== undefined) { fields.push(`leader_sim_id = $${values.length + 1}`); values.push(leaderSimId ?? null); }
  if (criteria !== undefined) { fields.push(`criteria = $${values.length + 1}`); values.push(JSON.stringify(criteria)); }
  if (rules !== undefined) { fields.push(`rules = $${values.length + 1}`); values.push(JSON.stringify(rules)); }
  if (inviteOnly !== undefined) { fields.push(`invite_only = $${values.length + 1}`); values.push(inviteOnly); }
  if (hangoutVenueTypeId !== undefined) { fields.push(`hangout_venue_type_id = $${values.length + 1}`); values.push(hangoutVenueTypeId ?? null); }
  if (lastImportedState !== undefined) { fields.push(`last_imported_state = $${values.length + 1}`); values.push(JSON.stringify(lastImportedState)); }

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(cId);
  await query(`UPDATE clubs SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/clubs/:cId
router.delete('/:cId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, cId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  await withTransaction(async (client) => {
    await removeClubFromLot(saveFileId, cId, client);
    await client.query('DELETE FROM clubs WHERE id = $1 AND save_file_id = $2', [cId, saveFileId]);
    await client.query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  });

  res.json({ ok: true });
}));

// POST /api/save-files/:id/clubs/:cId/assign/:lotKey
router.post('/:cId/assign/:lotKey', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, cId } = req.params;
  const lotKey = decodeURIComponent(req.params.lotKey);
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const lot = (await query(
    'SELECT id, club_ids FROM lots WHERE save_file_id = $1 AND lot_key = $2',
    [saveFileId, lotKey],
  )).rows[0] as { id: string; club_ids: string } | undefined;
  if (!lot) { res.status(404).json({ error: 'Lot not found' }); return; }

  const club = (await query(
    'SELECT id, assigned_lot_key FROM clubs WHERE id = $1 AND save_file_id = $2',
    [cId, saveFileId],
  )).rows[0] as { id: string; assigned_lot_key: string | null } | undefined;
  if (!club) { res.status(404).json({ error: 'Club not found' }); return; }

  await withTransaction(async (client) => {
    // Strip the club from any lot it was previously on (idempotent if none).
    // See households.ts assign route for the same fix — re-reading the dest
    // lot inside the transaction is required when reassigning to the same lot.
    await client.query(
      `UPDATE lots
       SET club_ids = (
         SELECT COALESCE(json_agg(elem)::text, '[]')
         FROM json_array_elements_text(club_ids::json) AS t(elem)
         WHERE t.elem != $1
       )
       WHERE save_file_id = $2
         AND club_ids::jsonb @> to_jsonb($1::text)`,
      [cId, saveFileId],
    );

    const freshLot = (await client.query(
      'SELECT club_ids FROM lots WHERE id = $1',
      [lot.id],
    )).rows[0] as { club_ids: string } | undefined;
    const freshIds: string[] = freshLot ? JSON.parse(freshLot.club_ids || '[]') : [];
    if (!freshIds.includes(cId)) {
      await client.query('UPDATE lots SET club_ids = $1 WHERE id = $2', [
        JSON.stringify([...freshIds, cId]),
        lot.id,
      ]);
    }

    await client.query('UPDATE clubs SET assigned_lot_key = $1 WHERE id = $2', [lotKey, cId]);
    await client.query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  });

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/clubs/:cId/assign
router.delete('/:cId/assign', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, cId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const club = (await query(
    'SELECT assigned_lot_key FROM clubs WHERE id = $1 AND save_file_id = $2',
    [cId, saveFileId],
  )).rows[0] as { assigned_lot_key: string | null } | undefined;
  if (!club) { res.status(404).json({ error: 'Club not found' }); return; }

  await withTransaction(async (client) => {
    await removeClubFromLot(saveFileId, cId, client);
    await client.query('UPDATE clubs SET assigned_lot_key = NULL WHERE id = $1', [cId]);
    await client.query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  });

  res.json({ ok: true });
}));

export default router;
