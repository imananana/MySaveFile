import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { query } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateBody } from '../middleware/validate';
import { sanitizeUserUrl } from '../lib/safeUrl';

const router = Router();
router.use(requireAuth);

const ModType       = z.enum(['Mod', 'CC']);
const ModImportance = z.enum(['required', 'recommended']);

const ModCreateBody = z.object({
  name: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  type: ModType.optional(),
  importance: ModImportance.optional(),
  notes: z.string().max(10_000).optional(),
}).strict();

const ModPatchBody = z.object({
  name: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  type: ModType.optional(),
  importance: ModImportance.optional(),
  notes: z.string().max(10_000).optional(),
}).strict();

async function ownsMod(modId: string, userId: string): Promise<boolean> {
  return !!((await query('SELECT id FROM mods WHERE id = $1 AND user_id = $2', [modId, userId])).rows[0]);
}

// GET /api/mods?saveFileId=
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { saveFileId } = req.query as { saveFileId?: string };

  let rows: Record<string, unknown>[];
  if (saveFileId) {
    rows = (await query(
      `SELECT m.*, CASE WHEN me.mod_id IS NOT NULL THEN 1 ELSE 0 END AS excluded
       FROM mods m
       LEFT JOIN mod_exclusions me ON me.mod_id = m.id AND me.save_file_id = $1
       WHERE m.user_id = $2
       ORDER BY m.name`,
      [saveFileId, req.userId!],
    )).rows as Record<string, unknown>[];
  } else {
    rows = (await query(
      'SELECT *, 0 AS excluded FROM mods WHERE user_id = $1 ORDER BY name',
      [req.userId!],
    )).rows as Record<string, unknown>[];
  }

  res.json(rows.map((r) => ({ ...r, excluded: r.excluded === 1 || r.excluded === true })));
}));

// POST /api/mods
router.post('/', validateBody(ModCreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, url, type, importance, notes } = req.body as z.infer<typeof ModCreateBody>;
  const safeUrl = sanitizeUserUrl(url) ?? '';

  const id = nanoid();
  await query(
    'INSERT INTO mods (id, user_id, name, url, type, importance, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, req.userId!, name ?? '', safeUrl, type ?? 'Mod', importance ?? 'recommended', notes ?? ''],
  );

  res.status(201).json({ id, name: name ?? '', url: safeUrl, type: type ?? 'Mod', importance: importance ?? 'recommended', notes: notes ?? '', excluded: false });
}));

// PATCH /api/mods/:modId
router.patch('/:modId', validateBody(ModPatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { modId } = req.params;
  if (!await ownsMod(modId, req.userId!)) { res.status(404).json({ error: 'Mod not found' }); return; }

  const { name, url, type, importance, notes } = req.body as z.infer<typeof ModPatchBody>;

  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined)       { fields.push(`name = $${values.length + 1}`);       values.push(name); }
  if (url !== undefined)        { fields.push(`url = $${values.length + 1}`);         values.push(sanitizeUserUrl(url) ?? ''); }
  if (type !== undefined)       { fields.push(`type = $${values.length + 1}`);        values.push(type); }
  if (importance !== undefined) { fields.push(`importance = $${values.length + 1}`);  values.push(importance); }
  if (notes !== undefined)      { fields.push(`notes = $${values.length + 1}`);       values.push(notes); }

  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(modId);
  await query(`UPDATE mods SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

  res.json({ ok: true });
}));

// DELETE /api/mods/:modId
router.delete('/:modId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { modId } = req.params;
  if (!await ownsMod(modId, req.userId!)) { res.status(404).json({ error: 'Mod not found' }); return; }

  await query('DELETE FROM mods WHERE id = $1', [modId]);
  res.json({ ok: true });
}));

// POST /api/mods/:modId/exclude/:saveFileId
router.post('/:modId/exclude/:saveFileId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { modId, saveFileId } = req.params;
  if (!await ownsMod(modId, req.userId!)) { res.status(404).json({ error: 'Mod not found' }); return; }

  await query(
    'INSERT INTO mod_exclusions (mod_id, save_file_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [modId, saveFileId],
  );

  res.json({ ok: true });
}));

// DELETE /api/mods/:modId/exclude/:saveFileId
router.delete('/:modId/exclude/:saveFileId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { modId, saveFileId } = req.params;
  if (!await ownsMod(modId, req.userId!)) { res.status(404).json({ error: 'Mod not found' }); return; }

  await query('DELETE FROM mod_exclusions WHERE mod_id = $1 AND save_file_id = $2', [modId, saveFileId]);
  res.json({ ok: true });
}));

export default router;
