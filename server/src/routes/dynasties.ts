import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateBody } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const MemberSchema = z.object({ simId: z.string().max(64), order: z.number().int(), role: z.string().max(64).nullable() }).strict();

const DynastyCreateBody = z.object({
  name: z.string().max(200),
  description: z.string().max(10_000).optional(),
  notes: z.string().max(10_000).optional(),
  headSimId: z.string().max(64).nullish(),
  members: z.array(MemberSchema).max(64).optional(),
  valueIds: z.array(z.string().max(16)).max(32).optional(),
  crestBgHash: z.string().max(32).nullish(),
  crestFgHash: z.string().max(32).nullish(),
  prestige: z.number().nullish(),
  unity: z.number().nullish(),
  perkIds: z.array(z.number().int()).max(128).optional(),
  allianceSourceIds: z.array(z.string().max(32)).max(64).optional(),
  rivalrySourceIds: z.array(z.string().max(32)).max(64).optional(),
  sourceId: z.string().max(64).nullish(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

// notes/description are user-editable; the rest are game-truth fields the
// re-sync flow refreshes from a newly-parsed save (notes is left untouched
// unless explicitly provided, so a sync never clobbers the user's notes).
const DynastyPatchBody = z.object({
  name: z.string().max(200).optional(),
  notes: z.string().max(10_000).optional(),
  description: z.string().max(10_000).optional(),
  headSimId: z.string().max(64).nullish(),
  members: z.array(MemberSchema).max(64).optional(),
  valueIds: z.array(z.string().max(16)).max(32).optional(),
  crestBgHash: z.string().max(32).nullish(),
  crestFgHash: z.string().max(32).nullish(),
  prestige: z.number().nullish(),
  unity: z.number().nullish(),
  perkIds: z.array(z.number().int()).max(128).optional(),
  allianceSourceIds: z.array(z.string().max(32)).max(64).optional(),
  rivalrySourceIds: z.array(z.string().max(32)).max(64).optional(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
}).strict();

async function ownsSaveFile(saveFileId: string, userId: string): Promise<boolean> {
  return !!((await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, userId])).rows[0]);
}

// POST /api/save-files/:id/dynasties
router.post('/', validateBody(DynastyCreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const b = req.body as z.infer<typeof DynastyCreateBody>;
  const id = nanoid();
  const members = b.members ?? [];
  const valueIds = b.valueIds ?? [];
  const perkIds = b.perkIds ?? [];
  const allianceSourceIds = b.allianceSourceIds ?? [];
  const rivalrySourceIds = b.rivalrySourceIds ?? [];
  await query(
    `INSERT INTO dynasties
       (id, save_file_id, name, description, notes, head_sim_id, members, value_ids,
        crest_bg_hash, crest_fg_hash, prestige, unity, perk_ids, alliance_source_ids,
        rivalry_source_ids, source_id, last_imported_state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      id, saveFileId, b.name, b.description ?? '', b.notes ?? '', b.headSimId ?? null,
      JSON.stringify(members), JSON.stringify(valueIds), b.crestBgHash ?? null, b.crestFgHash ?? null,
      b.prestige ?? null, b.unity ?? null, JSON.stringify(perkIds),
      JSON.stringify(allianceSourceIds), JSON.stringify(rivalrySourceIds), b.sourceId ?? null,
      b.lastImportedState ? JSON.stringify(b.lastImportedState) : null,
    ],
  );
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.status(201).json({
    id, name: b.name, description: b.description ?? '', notes: b.notes ?? '',
    headSimId: b.headSimId ?? null, members, valueIds,
    crestBgHash: b.crestBgHash ?? null, crestFgHash: b.crestFgHash ?? null,
    prestige: b.prestige ?? null, unity: b.unity ?? null, perkIds,
    allianceSourceIds, rivalrySourceIds, sourceId: b.sourceId ?? null,
  });
}));

// PATCH /api/save-files/:id/dynasties/:dId  (notes / description only)
router.patch('/:dId', validateBody(DynastyPatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, dId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const d = (await query('SELECT id FROM dynasties WHERE id = $1 AND save_file_id = $2', [dId, saveFileId])).rows[0];
  if (!d) { res.status(404).json({ error: 'Dynasty not found' }); return; }

  const b = req.body as z.infer<typeof DynastyPatchBody>;
  const fields: string[] = [];
  const values: unknown[] = [];
  const add = (col: string, val: unknown) => { fields.push(`${col} = $${values.length + 1}`); values.push(val); };
  if (b.name !== undefined)        add('name', b.name);
  if (b.notes !== undefined)       add('notes', b.notes);
  if (b.description !== undefined) add('description', b.description);
  if (b.headSimId !== undefined)   add('head_sim_id', b.headSimId ?? null);
  if (b.members !== undefined)     add('members', JSON.stringify(b.members));
  if (b.valueIds !== undefined)    add('value_ids', JSON.stringify(b.valueIds));
  if (b.crestBgHash !== undefined) add('crest_bg_hash', b.crestBgHash ?? null);
  if (b.crestFgHash !== undefined) add('crest_fg_hash', b.crestFgHash ?? null);
  if (b.prestige !== undefined)    add('prestige', b.prestige ?? null);
  if (b.unity !== undefined)       add('unity', b.unity ?? null);
  if (b.perkIds !== undefined)     add('perk_ids', JSON.stringify(b.perkIds));
  if (b.allianceSourceIds !== undefined) add('alliance_source_ids', JSON.stringify(b.allianceSourceIds));
  if (b.rivalrySourceIds !== undefined)  add('rivalry_source_ids', JSON.stringify(b.rivalrySourceIds));
  if (b.lastImportedState !== undefined) add('last_imported_state', JSON.stringify(b.lastImportedState));
  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(dId);
  await query(`UPDATE dynasties SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/dynasties/:dId (re-sync removes dynasties gone from the save)
router.delete('/:dId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, dId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }
  await query('DELETE FROM dynasties WHERE id = $1 AND save_file_id = $2', [dId, saveFileId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  res.json({ ok: true });
}));

export default router;
