/**
 * Photo cleanup for a save that is about to be deleted for good.
 *
 * `photos.save_file_id` carries no foreign key, so a hard DELETE of the save row
 * takes its assignments and exclusions with it (those DO cascade) and leaves the
 * built-photo rows behind: owned by a save that no longer exists, unreachable
 * from any screen, still counted in storage. Invisible, so it grew quietly.
 *
 * Call this BEFORE deleting the save row — it needs the rows to still be there.
 *
 * The R2 object is only removed once nothing references its filename any more.
 * Duplicates and auto-backups deliberately SHARE one object per image, so
 * deleting a copy must never break the original — same refcount rule the
 * single-photo delete route uses.
 */
import { query } from '../db/client';
import { deleteFromR2 } from './r2';

export async function purgeSavePhotos(saveFileId: string): Promise<{ rows: number; objects: number }> {
  const photos = (await query(
    `SELECT id, filename FROM photos WHERE save_file_id = $1`,
    [saveFileId],
  )).rows as Array<{ id: string; filename: string }>;
  if (!photos.length) return { rows: 0, objects: 0 };

  await query(`DELETE FROM photos WHERE save_file_id = $1`, [saveFileId]);

  let objects = 0;
  for (const filename of new Set(photos.map((p) => p.filename))) {
    const stillUsed = (await query('SELECT 1 FROM photos WHERE filename = $1 LIMIT 1', [filename])).rows[0];
    if (stillUsed) continue;
    try {
      await deleteFromR2(filename);
      objects++;
    } catch (e) {
      // A missing object is the expected failure and is fine — the row is gone
      // either way, which is the part that was leaking.
      console.warn(`[save-photo-cleanup] R2 delete failed for ${filename}:`, (e as Error).message);
    }
  }
  return { rows: photos.length, objects };
}
