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

const RelType = z.enum(['parent', 'spouse', 'engaged', 'partner', 'ex_spouse', 'ex_partner', 'ex_fiance', 'sibling', 'half_sibling']);

const Edge = z.object({
  simAId: z.string().min(1).max(64),
  simBId: z.string().min(1).max(64),
  relType: RelType,
}).strict();

// Import pushes the full current edge set; 4 edges/sim is a generous average.
const BulkBody = z.object({ edges: z.array(Edge).max(20_000) }).strict();
const ManualBody = Edge;

const rowOut = (r: Record<string, unknown>) => ({
  id: r.id,
  simAId: r.sim_a_id,
  simBId: r.sim_b_id,
  relType: r.rel_type,
  source: r.source,
});

// GET /api/save-files/:id/relationships
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }
  const rows = (await query(
    'SELECT id, sim_a_id, sim_b_id, rel_type, source FROM sim_relationships WHERE save_file_id = $1 ORDER BY created_at',
    [saveFileId],
  )).rows;
  res.json(rows.map(rowOut));
}));

// PUT /api/save-files/:id/relationships — replace all IMPORT-sourced edges
// with the given set (the re-sync "current state"). Manual edges are untouched.
router.put('/', validateBody(BulkBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }
  const { edges } = req.body as z.infer<typeof BulkBody>;

  // Every endpoint must be a sim of this save file.
  const simIds = new Set(
    (await query('SELECT id FROM sims WHERE save_file_id = $1', [saveFileId])).rows.map((r) => r.id as string),
  );
  for (const e of edges) {
    if (!simIds.has(e.simAId) || !simIds.has(e.simBId)) {
      res.status(400).json({ error: `Edge references a sim not in this save file (${e.simAId} ↔ ${e.simBId})` });
      return;
    }
  }

  await query('BEGIN');
  try {
    await query("DELETE FROM sim_relationships WHERE save_file_id = $1 AND source = 'import'", [saveFileId]);
    for (const e of edges) {
      await query(
        `INSERT INTO sim_relationships (id, save_file_id, sim_a_id, sim_b_id, rel_type, source)
         VALUES ($1, $2, $3, $4, $5, 'import')
         ON CONFLICT (save_file_id, sim_a_id, sim_b_id, rel_type) DO NOTHING`,
        [nanoid(), saveFileId, e.simAId, e.simBId, e.relType],
      );
    }
    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  res.json({ ok: true, count: edges.length });
}));

// POST /api/save-files/:id/relationships — add one MANUAL edge (Add-ancestor flow).
router.post('/', validateBody(ManualBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }
  const { simAId, simBId, relType } = req.body as z.infer<typeof ManualBody>;

  const count = (await query(
    'SELECT COUNT(*)::int AS n FROM sims WHERE save_file_id = $1 AND id = ANY($2)',
    [saveFileId, [simAId, simBId]],
  )).rows[0];
  if ((simAId === simBId ? 1 : 2) !== count.n) { res.status(400).json({ error: 'Sim not found in this save file' }); return; }
  if (simAId === simBId) { res.status(400).json({ error: 'Cannot relate a sim to itself' }); return; }

  const id = nanoid();
  await query(
    `INSERT INTO sim_relationships (id, save_file_id, sim_a_id, sim_b_id, rel_type, source)
     VALUES ($1, $2, $3, $4, $5, 'manual')
     ON CONFLICT (save_file_id, sim_a_id, sim_b_id, rel_type) DO NOTHING`,
    [id, saveFileId, simAId, simBId, relType],
  );
  res.status(201).json({ id, simAId, simBId, relType, source: 'manual' });
}));

// DELETE /api/save-files/:id/relationships/:edgeId — manual edges only.
router.delete('/:edgeId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, edgeId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }
  const row = (await query('SELECT source FROM sim_relationships WHERE id = $1 AND save_file_id = $2', [edgeId, saveFileId])).rows[0];
  if (!row) { res.status(404).json({ error: 'Edge not found' }); return; }
  if (row.source !== 'manual') { res.status(400).json({ error: 'Only manual edges can be deleted directly — import edges are managed by sync' }); return; }
  await query('DELETE FROM sim_relationships WHERE id = $1', [edgeId]);
  res.json({ ok: true });
}));

export default router;
