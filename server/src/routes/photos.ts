import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { query } from '../db/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { s3, R2_BUCKET, uploadToR2, deleteFromR2, GetObjectCommand } from '../lib/r2';
import { warmPhotoFile } from '../lib/photoWarm';

// Accept large raw uploads (TS4 screenshots are uncompressed 1440p/4K PNGs,
// commonly 10–14MB). We immediately downscale + re-encode to JPEG on the server
// (see processImage), so what lands in R2 is ~0.5–1MB regardless.
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024; // 32MB ceiling on the incoming file
const MAX_EDGE = 2560;                     // longest stored edge (retina-sharp in the lightbox)
const JPEG_QUALITY = 82;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/**
 * Downscale to MAX_EDGE (never upscale) and re-encode to JPEG. Flattens any
 * transparency onto white (TS4 screenshots are opaque; this only matters for
 * the rare PNG-with-alpha inspo upload) and strips EXIF after honoring its
 * orientation. Returns null when sharp can't decode the file at all — that is
 * the site's real "is this an image?" test, since the mime filter upstream only
 * sees a type the browser guessed from the extension.
 */
async function processImage(
  buf: Buffer,
): Promise<{ buffer: Buffer; ext: string; contentType: string; width: number | null; height: number | null } | null> {
  try {
    // resolveWithObject hands back the final dimensions for free — stored so the
    // masonry gallery can reserve each tile's box and never reflow on load.
    const { data, info } = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, ext: '.jpg', contentType: 'image/jpeg', width: info.width ?? null, height: info.height ?? null };
  } catch {
    // sharp couldn't decode it, so it isn't an image — say so instead of
    // storing it.
    //
    // This used to fall back to "store the original untouched", which sounds
    // careful and isn't: multer's filter only checks the DECLARED mime type,
    // which browsers derive from the file extension. Rename a text file to
    // .png and it sails through the filter, fails to decode, and is kept
    // forever as a photo that renders as a broken tile with no way to tell why.
    // sharp with `failOn: 'none'` already accepts everything a browser can
    // produce, so a decode failure here means the file is genuinely not an image.
    return null;
  }
}

function parsePhotoRow(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...p,
    categories: typeof p.categories === 'string' ? JSON.parse(p.categories) : (p.categories ?? []),
    tags: typeof p.tags === 'string' ? JSON.parse(p.tags) : (p.tags ?? []),
  };
}

const router = Router();
router.use(requireAuth);

// POST /api/photos/upload
router.post('/upload', upload.single('photo'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const { type, saveFileId, targetType, targetKey, caption, galleryCreator } = req.body as {
    type?: string; saveFileId?: string; targetType?: string; targetKey?: string; caption?: string; galleryCreator?: string;
  };

  const photoType = type === 'built' ? 'built' : 'inspo';

  if (photoType === 'built' && (!saveFileId || !targetType || !targetKey)) {
    res.status(400).json({ error: 'Built photos require saveFileId, targetType, targetKey' });
    return;
  }

  if (photoType === 'built' && saveFileId) {
    const sf = (await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, req.userId])).rows[0];
    if (!sf) { res.status(404).json({ error: 'Save file not found' }); return; }
  }

  const processed = await processImage(req.file.buffer);
  if (!processed) {
    res.status(400).json({ error: "That file isn't an image the site can read." });
    return;
  }
  const { buffer, ext, contentType, width, height } = processed;
  const filename = `${nanoid()}${ext}`;

  await uploadToR2(buffer, filename, contentType);

  const id = nanoid();
  const gcValue = (photoType === 'built' && (targetType === 'lot' || targetType === 'household'))
    ? (galleryCreator?.trim() || null)
    : null;

  await query(
    `INSERT INTO photos (id, user_id, type, save_file_id, target_type, target_key, filename, caption, categories, tags, gallery_creator, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id, req.userId, photoType,
      photoType === 'built' ? saveFileId : null,
      photoType === 'built' ? targetType : null,
      photoType === 'built' ? targetKey  : null,
      filename, caption ?? '', '[]', '[]', gcValue, width, height,
    ],
  );

  const raw = (await query('SELECT * FROM photos WHERE id = $1', [id])).rows[0] as Record<string, unknown>;
  // The CDN's sized copies get made now, not when the first visitor asks.
  warmPhotoFile(filename);
  res.status(201).json(parsePhotoRow(raw));
}));

// GET /api/photos/inspo?saveFileId=
router.get('/inspo', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { saveFileId } = req.query as { saveFileId?: string };

  const photos = (await query(
    'SELECT * FROM photos WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC',
    [req.userId, 'inspo'],
  )).rows as Array<Record<string, unknown>>;

  if (!saveFileId) {
    res.json(photos.map((p) => ({ ...parsePhotoRow(p), assignment: null, excluded: false })));
    return;
  }

  const [assignmentsRes, exclusionsRes] = await Promise.all([
    query('SELECT photo_id, target_type, target_key FROM photo_assignments WHERE save_file_id = $1', [saveFileId]),
    query('SELECT photo_id FROM photo_exclusions WHERE save_file_id = $1', [saveFileId]),
  ]);

  const assignMap = new Map(assignmentsRes.rows.map((a: Record<string, unknown>) => [a.photo_id, { target_type: a.target_type, target_key: a.target_key }]));
  const excludedSet = new Set(exclusionsRes.rows.map((e: Record<string, unknown>) => e.photo_id));

  res.json(photos.map((p) => ({
    ...parsePhotoRow(p),
    assignment: assignMap.get(p.id as string) ?? null,
    excluded: excludedSet.has(p.id as string),
  })));
}));

// GET /api/photos/built?saveFileId=&targetType=&targetKey=
router.get('/built', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { saveFileId, targetType, targetKey } = req.query as { saveFileId?: string; targetType?: string; targetKey?: string };

  if (!saveFileId || !targetType) { res.status(400).json({ error: 'saveFileId and targetType required' }); return; }

  const sf = (await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, req.userId])).rows[0];
  if (!sf) { res.status(404).json({ error: 'Save file not found' }); return; }

  const photos = targetKey
    ? (await query(`SELECT * FROM photos WHERE type = 'built' AND save_file_id = $1 AND target_type = $2 AND target_key = $3 ORDER BY created_at ASC`, [saveFileId, targetType, targetKey])).rows
    : (await query(`SELECT * FROM photos WHERE type = 'built' AND save_file_id = $1 AND target_type = $2 ORDER BY created_at ASC`, [saveFileId, targetType])).rows;

  res.json(photos);
}));

// GET /api/photos/built-lots?saveFileId=
router.get('/built-lots', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { saveFileId } = req.query as { saveFileId?: string };
  if (!saveFileId) { res.status(400).json({ error: 'saveFileId required' }); return; }

  const sf = (await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, req.userId])).rows[0];
  if (!sf) { res.status(404).json({ error: 'Save file not found' }); return; }

  const photos = (await query(
    `SELECT * FROM photos WHERE type = 'built' AND save_file_id = $1 AND target_type = 'lot' ORDER BY created_at ASC`,
    [saveFileId],
  )).rows;
  res.json(photos);
}));

// GET /api/photos/sim-portraits?saveFileId=  → [{ simId, photoId, filename }]
// A sim's portrait is one photo overlaid via photo_assignments (target_type
// 'sim'), independent of that photo's own household/lot role — and untouched by
// sim re-imports, which only rewrite the sims table.
router.get('/sim-portraits', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { saveFileId } = req.query as { saveFileId?: string };
  if (!saveFileId) { res.status(400).json({ error: 'saveFileId required' }); return; }

  const sf = (await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, req.userId])).rows[0];
  if (!sf) { res.status(404).json({ error: 'Save file not found' }); return; }

  const rows = (await query(
    `SELECT a.target_key AS sim_id, a.photo_id, p.filename
       FROM photo_assignments a JOIN photos p ON p.id = a.photo_id
      WHERE a.save_file_id = $1 AND a.target_type = 'sim' AND p.user_id = $2`,
    [saveFileId, req.userId],
  )).rows;
  res.json(rows.map((r: Record<string, unknown>) => ({ simId: r.sim_id, photoId: r.photo_id, filename: r.filename })));
}));

// PUT /api/photos/sim-portrait  { saveFileId, simId, photoId|null }
// Sets (or clears, with photoId=null) the sim's single portrait. Clears any
// existing portrait for the sim first, so there's always at most one.
router.put('/sim-portrait', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { saveFileId, simId, photoId } = req.body as { saveFileId?: string; simId?: string; photoId?: string | null };
  if (!saveFileId || !simId) { res.status(400).json({ error: 'saveFileId and simId required' }); return; }

  const sf = (await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, req.userId])).rows[0];
  if (!sf) { res.status(404).json({ error: 'Save file not found' }); return; }

  await query(`DELETE FROM photo_assignments WHERE save_file_id = $1 AND target_type = 'sim' AND target_key = $2`, [saveFileId, simId]);
  if (photoId) {
    const photo = (await query('SELECT id FROM photos WHERE id = $1 AND user_id = $2', [photoId, req.userId])).rows[0];
    if (!photo) { res.status(404).json({ error: 'Photo not found' }); return; }
    await query(
      `INSERT INTO photo_assignments (photo_id, save_file_id, target_type, target_key) VALUES ($1, $2, 'sim', $3)
       ON CONFLICT (photo_id, save_file_id) DO UPDATE SET target_type = 'sim', target_key = $3`,
      [photoId, saveFileId, simId],
    );
  }
  res.json({ ok: true });
}));

// PATCH /api/photos/:id
router.patch('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { caption, categories, tags, galleryCreator } = req.body as { caption?: string; categories?: string[]; tags?: string[]; galleryCreator?: string | null };
  if (caption === undefined && categories === undefined && tags === undefined && galleryCreator === undefined) {
    res.status(400).json({ error: 'caption, categories, tags, or galleryCreator required' });
    return;
  }

  const photo = (await query('SELECT id FROM photos WHERE id = $1 AND user_id = $2', [req.params.id, req.userId])).rows[0];
  if (!photo) { res.status(404).json({ error: 'Photo not found' }); return; }

  if (caption !== undefined)         await query('UPDATE photos SET caption = $1 WHERE id = $2', [caption, req.params.id]);
  if (categories !== undefined)      await query('UPDATE photos SET categories = $1 WHERE id = $2', [JSON.stringify(categories), req.params.id]);
  if (tags !== undefined) {
    await query('UPDATE photos SET tags = $1 WHERE id = $2', [JSON.stringify(tags), req.params.id]);
    // Any tag we see joins the user's vocabulary and STAYS there. Without this
    // a tag only existed while some photo carried it, so coining one and then
    // taking it off that photo destroyed it. Registering on write means it
    // survives regardless of where it was coined — pool or World Inspo.
    for (const t of tags) {
      const name = String(t).trim().toLowerCase();
      if (!name) continue;
      await query(
        'INSERT INTO inspo_tags (user_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.userId, name],
      );
    }
  }
  if (galleryCreator !== undefined)  await query('UPDATE photos SET gallery_creator = $1 WHERE id = $2', [galleryCreator?.trim() || null, req.params.id]);

  res.json({ ok: true });
}));

// ─── Inspo tag vocabulary ────────────────────────────────────────────────────
// Per-user, like the pool itself. Reads UNION the stored vocabulary with tags
// actually in use, so pre-existing data needs no backfill and a tag can never
// vanish while a photo still carries it.

async function readTagVocabulary(userId: string): Promise<string[]> {
  const [stored, inUse] = await Promise.all([
    query('SELECT name FROM inspo_tags WHERE user_id = $1', [userId]),
    query(
      `SELECT DISTINCT jsonb_array_elements_text(tags::jsonb) AS name
         FROM photos WHERE user_id = $1 AND type = 'inspo' AND tags <> '[]'`,
      [userId],
    ),
  ]);
  const names = new Set<string>();
  for (const r of [...stored.rows, ...inUse.rows]) names.add((r as { name: string }).name);
  return [...names].sort();
}

// Rewrites every inspo photo carrying `from`. Done in JS rather than SQL: the
// volume is small and jsonb array surgery is far easier to get wrong.
async function rewriteTagOnPhotos(userId: string, from: string, to: string | null) {
  const rows = (await query(
    `SELECT id, tags FROM photos WHERE user_id = $1 AND type = 'inspo'`,
    [userId],
  )).rows as Array<{ id: string; tags: string }>;

  for (const row of rows) {
    let current: string[];
    try { current = JSON.parse(row.tags ?? '[]'); } catch { continue; }
    if (!current.includes(from)) continue;
    const next = to
      ? Array.from(new Set(current.map((t) => (t === from ? to : t))))  // dedupe: renaming onto an existing tag must not double it
      : current.filter((t) => t !== from);
    await query('UPDATE photos SET tags = $1 WHERE id = $2', [JSON.stringify(next), row.id]);
  }
}

// GET /api/photos/tags
router.get('/tags', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await readTagVocabulary(req.userId!));
}));

// POST /api/photos/tags  { name }  — coin a tag with no photo attached yet
router.post('/tags', asyncHandler(async (req: AuthRequest, res: Response) => {
  const name = String((req.body as { name?: string }).name ?? '').trim().toLowerCase();
  if (!name) { res.status(400).json({ error: 'name required' }); return; }
  await query(
    'INSERT INTO inspo_tags (user_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.userId, name],
  );
  res.json(await readTagVocabulary(req.userId!));
}));

// PATCH /api/photos/tags/:name  { name }  — rename everywhere
router.patch('/tags/:name', asyncHandler(async (req: AuthRequest, res: Response) => {
  const from = decodeURIComponent(req.params.name).trim().toLowerCase();
  const to = String((req.body as { name?: string }).name ?? '').trim().toLowerCase();
  if (!to) { res.status(400).json({ error: 'name required' }); return; }
  if (from === to) { res.json(await readTagVocabulary(req.userId!)); return; }

  await query('DELETE FROM inspo_tags WHERE user_id = $1 AND name = $2', [req.userId, from]);
  await query(
    'INSERT INTO inspo_tags (user_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.userId, to],
  );
  await rewriteTagOnPhotos(req.userId!, from, to);
  res.json(await readTagVocabulary(req.userId!));
}));

// DELETE /api/photos/tags/:name — drops it from the vocabulary AND off every
// photo. Without this the only way to retire a tag was to find every photo
// using it by hand.
router.delete('/tags/:name', asyncHandler(async (req: AuthRequest, res: Response) => {
  const name = decodeURIComponent(req.params.name).trim().toLowerCase();
  await query('DELETE FROM inspo_tags WHERE user_id = $1 AND name = $2', [req.userId, name]);
  await rewriteTagOnPhotos(req.userId!, name, null);
  res.json(await readTagVocabulary(req.userId!));
}));

// POST /api/photos/:id/dimensions  { width, height }
// Self-heal backfill: the gallery reports a legacy photo's intrinsic size from
// the loaded <img>, so future renders can reserve its box. Idempotent — only
// fills rows that don't have dimensions yet.
router.post('/:id/dimensions', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { width, height } = req.body as { width?: number; height?: number };
  if (!width || !height) { res.status(400).json({ error: 'width and height required' }); return; }
  await query(
    'UPDATE photos SET width = $1, height = $2 WHERE id = $3 AND user_id = $4 AND width IS NULL',
    [Math.round(width), Math.round(height), req.params.id, req.userId],
  );
  res.json({ ok: true });
}));

// DELETE /api/photos/:id
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const photo = (await query(
    'SELECT filename FROM photos WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId],
  )).rows[0] as { filename: string } | undefined;

  if (!photo) { res.status(404).json({ error: 'Photo not found' }); return; }

  await query('DELETE FROM photos WHERE id = $1', [req.params.id]);
  // Duplicate/backup copies SHARE the same R2 object (same filename) across saves.
  // Only remove the object once no photo row references it anymore — otherwise
  // deleting a photo in one save would break the identical one in another.
  const stillUsed = (await query('SELECT 1 FROM photos WHERE filename = $1 LIMIT 1', [photo.filename])).rows[0];
  if (!stillUsed) await deleteFromR2(photo.filename);

  res.json({ ok: true });
}));

// POST /api/photos/:id/assign
router.post('/:id/assign', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { saveFileId, targetType, targetKey } = req.body as { saveFileId?: string; targetType?: string; targetKey?: string };

  if (!saveFileId || !targetType || !targetKey) {
    res.status(400).json({ error: 'saveFileId, targetType, targetKey required' });
    return;
  }
  if (targetType === 'household') {
    res.status(400).json({ error: 'Inspo photos cannot be assigned to households' });
    return;
  }

  const photo = (await query(`SELECT id FROM photos WHERE id = $1 AND user_id = $2 AND type = 'inspo'`, [req.params.id, req.userId])).rows[0];
  if (!photo) { res.status(404).json({ error: 'Inspo photo not found' }); return; }

  const sf = (await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [saveFileId, req.userId])).rows[0];
  if (!sf) { res.status(404).json({ error: 'Save file not found' }); return; }

  await query(
    `INSERT INTO photo_assignments (photo_id, save_file_id, target_type, target_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (photo_id, save_file_id) DO UPDATE SET target_type = EXCLUDED.target_type, target_key = EXCLUDED.target_key`,
    [req.params.id, saveFileId, targetType, targetKey],
  );

  res.json({ ok: true });
}));

// DELETE /api/photos/:id/assign/:saveFileId
router.delete('/:id/assign/:saveFileId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const photo = (await query(`SELECT id FROM photos WHERE id = $1 AND user_id = $2 AND type = 'inspo'`, [req.params.id, req.userId])).rows[0];
  if (!photo) { res.status(404).json({ error: 'Inspo photo not found' }); return; }

  await query('DELETE FROM photo_assignments WHERE photo_id = $1 AND save_file_id = $2', [req.params.id, req.params.saveFileId]);
  res.json({ ok: true });
}));

// POST /api/photos/:id/exclude/:saveFileId
router.post('/:id/exclude/:saveFileId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const photo = (await query(`SELECT id FROM photos WHERE id = $1 AND user_id = $2 AND type = 'inspo'`, [req.params.id, req.userId])).rows[0];
  if (!photo) { res.status(404).json({ error: 'Inspo photo not found' }); return; }

  await query(
    'INSERT INTO photo_exclusions (photo_id, save_file_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, req.params.saveFileId],
  );
  res.json({ ok: true });
}));

// DELETE /api/photos/:id/exclude/:saveFileId
router.delete('/:id/exclude/:saveFileId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const photo = (await query(`SELECT id FROM photos WHERE id = $1 AND user_id = $2 AND type = 'inspo'`, [req.params.id, req.userId])).rows[0];
  if (!photo) { res.status(404).json({ error: 'Inspo photo not found' }); return; }

  await query('DELETE FROM photo_exclusions WHERE photo_id = $1 AND save_file_id = $2', [req.params.id, req.params.saveFileId]);
  res.json({ ok: true });
}));

// GET /api/photos/files/:filename — proxy R2 file (avoids CORS for PDF export)
router.get('/files/:filename(*)', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const filename = req.params.filename;
  const obj = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: filename }));
  res.setHeader('Content-Type', obj.ContentType ?? 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (obj.Body) {
    const chunks: Buffer[] = [];
    for await (const chunk of obj.Body as AsyncIterable<Buffer>) chunks.push(chunk);
    res.end(Buffer.concat(chunks));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
}));

export default router;
