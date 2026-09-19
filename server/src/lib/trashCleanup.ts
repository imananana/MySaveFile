/**
 * Trash retention. Soft-deleted saves are purged on a schedule:
 *   - auto-backups (created before re-import/reset): 7 days
 *   - user-deleted saves: 30 days
 * Runs once on boot, then daily. Errors are logged, never fatal.
 *
 * Each expired save's photos go first: `photos.save_file_id` has no foreign key,
 * so deleting the save row alone leaves them behind, owned by nothing. This job
 * is the busiest purger in the product, so it was also the biggest leak.
 */
import { query } from '../db/client';
import { purgeSavePhotos } from './savePhotoCleanup';

const AUTO_BACKUP_TTL_DAYS = 7;
const DELETED_TTL_DAYS = 30;

export async function purgeExpiredTrash(): Promise<number> {
  const expired = (await query(
    `SELECT id FROM save_files
      WHERE deleted_at IS NOT NULL
        AND (
          (auto_backup = TRUE  AND deleted_at < NOW() - ($1 || ' days')::interval) OR
          (auto_backup = FALSE AND deleted_at < NOW() - ($2 || ' days')::interval)
        )`,
    [AUTO_BACKUP_TTL_DAYS, DELETED_TTL_DAYS],
  )).rows as Array<{ id: string }>;
  if (!expired.length) return 0;

  let photoRows = 0;
  let objects = 0;
  let count = 0;
  for (const { id } of expired) {
    // Per-save rather than one bulk DELETE: a photo failure on one expired save
    // shouldn't strand the rest, and the R2 refcount check is per filename.
    try {
      const photos = await purgeSavePhotos(id);
      photoRows += photos.rows;
      objects += photos.objects;
      const result = await query('DELETE FROM save_files WHERE id = $1', [id]);
      count += result.rowCount ?? 0;
    } catch (e) {
      console.error(`[trash-cleanup] failed to purge ${id}:`, (e as Error).message);
    }
  }
  if (count > 0) {
    console.log(`[trash-cleanup] purged ${count} expired save(s), ${photoRows} photo row(s), ${objects} image(s)`);
  }
  return count;
}

export function startTrashCleanup(): void {
  const run = () => purgeExpiredTrash().catch((e) => console.error('[trash-cleanup] failed:', e));
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
