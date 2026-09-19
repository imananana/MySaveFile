import { query } from '../db/client';

// Vanity slug for the public showcase URL (/s/<slug>). The slug follows the
// save's NAME: minted when the save first goes Live, re-minted on every rename
// after that. Old slugs stay in showcase_slugs forever and redirect to the
// current one, so a shared link survives renames.
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics left by NFKD
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'save';
}

// Point `saveId`'s current slug at its name. Collision rules (locked):
// - first save to claim a name owns the clean slug; later ones get -2, -3…
// - a save renamed back to a name it held before reuses its own old slug
//   (it's already in its history) rather than minting a numbered one.
// - slugs owned by OTHER saves are never freed or reassigned.
// Returns the resulting current slug.
export async function ensureSlugForName(saveId: string, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const existing = (await query(
      'SELECT save_file_id FROM showcase_slugs WHERE slug = $1',
      [candidate],
    )).rows[0] as { save_file_id: string } | undefined;

    if (existing && existing.save_file_id !== saveId) continue; // someone else's — try the next number

    if (!existing) {
      // Free — claim it. ON CONFLICT covers a concurrent claim of the same
      // slug; if we lose the race, loop again and take the next number.
      const claimed = await query(
        'INSERT INTO showcase_slugs (slug, save_file_id) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING',
        [candidate, saveId],
      );
      if (!claimed.rowCount) continue;
    }

    await query('UPDATE save_files SET showcase_slug = $1 WHERE id = $2', [candidate, saveId]);
    return candidate;
  }
  throw new Error('Could not allocate a showcase slug');
}
