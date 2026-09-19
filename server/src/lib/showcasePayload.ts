import { query } from '../db/client';

// One payload for the whole showcase (front + world views navigate in-page).
// Reality only: explicit column lists, never SELECT * — private `notes` and
// every planner-authored goal field (planned_*) stay behind the boundary.
// Shared by the public by-slug route and the owner by-id route so the shape
// can't drift between them.

export interface ShowcaseSaveRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  save_file_url: string | null;
  last_synced_at: string | null;
  showcase: Record<string, unknown> | null;
  showcase_live: boolean;
  showcase_slug: string | null;
  disabled_worlds: string | string[];
  world_blurbs: string | Record<string, string>;
  detected_packs: string[] | null;
  creator_name: string | null;
  social_links: Record<string, string> | null;
  profile_photo_url: string | null;
}

export const SHOWCASE_SAVE_COLUMNS = `
  sf.id, sf.user_id, sf.name, sf.description, sf.save_file_url, sf.last_synced_at,
  sf.showcase, sf.showcase_live, sf.showcase_slug, sf.disabled_worlds, sf.world_blurbs, sf.detected_packs,
  u.creator_name, u.social_links, u.profile_photo_url`;

export async function buildShowcasePayload(sf: ShowcaseSaveRow, isOwner: boolean): Promise<Record<string, unknown>> {
  const saveId = sf.id;
  const [lotsRes, householdsRes, simsRes, photosRes, modsRes] = await Promise.all([
    query(
      `SELECT lot_key, world_name, lot_name, custom_name, location, default_type, custom_type, size, status, description, household_ids, source_id
       FROM lots WHERE save_file_id = $1`,
      [saveId],
    ),
    query(
      `SELECT id, name, composition, assigned_lot_key, description, thumbnail_filename, provenance, creator_name, source_id
       FROM households WHERE save_file_id = $1`,
      [saveId],
    ),
    // Roster sims only — tree-only/culled/stub records are planner
    // scaffolding, not part of the delivered save's cast.
    query(
      `SELECT id, household_id, first_name, last_name, gender, lifestage, species, pet_subtype, occult, is_ghost
       FROM sims WHERE save_file_id = $1 AND record_status = 'active'`,
      [saveId],
    ),
    // Built photos owned by or assigned into this save, minus per-save
    // exclusions and anything assigned to a sim (no sim pages, ever). The
    // assignment's target wins over the photo's own (cross-save assignments).
    query(
      `SELECT p.id, p.filename, p.caption, p.width, p.height, p.gallery_creator, p.created_at,
              COALESCE(pa.target_type, p.target_type) AS target_type,
              COALESCE(pa.target_key,  p.target_key)  AS target_key
       FROM photos p
       LEFT JOIN photo_assignments pa ON pa.photo_id = p.id AND pa.save_file_id = $1
       WHERE p.type = 'built'
         AND (p.save_file_id = $1 OR pa.save_file_id = $1)
         AND p.id NOT IN (SELECT photo_id FROM photo_exclusions WHERE save_file_id = $1)
         AND NOT EXISTS (SELECT 1 FROM photo_assignments spa WHERE spa.photo_id = p.id AND spa.save_file_id = $1 AND spa.target_type = 'sim')
       ORDER BY p.created_at ASC`,
      [saveId],
    ),
    query(
      `SELECT m.name, m.url, m.type, m.importance
       FROM mods m
       WHERE m.user_id = $2
         AND NOT EXISTS (SELECT 1 FROM mod_exclusions me WHERE me.mod_id = m.id AND me.save_file_id = $1)
       ORDER BY m.name`,
      [saveId, sf.user_id],
    ),
  ]);

  return {
    slug: sf.showcase_slug,
    live: !!sf.showcase_live,
    ...(isOwner ? { isOwner: true, saveFileId: saveId } : {}),
    name: sf.name,
    description: sf.description ?? '',
    saveFileUrl: sf.save_file_url ?? null,
    lastSyncedAt: sf.last_synced_at ?? null,
    showcase: sf.showcase ?? {},
    disabledWorlds: typeof sf.disabled_worlds === 'string' ? JSON.parse(sf.disabled_worlds) : (sf.disabled_worlds ?? []),
    worldBlurbs: typeof sf.world_blurbs === 'string' ? JSON.parse(sf.world_blurbs) : (sf.world_blurbs ?? {}),
    detectedPacks: sf.detected_packs ?? null,
    creator: {
      name: sf.creator_name ?? null,
      socialLinks: sf.social_links ?? {},
      profilePhotoFilename: sf.profile_photo_url ?? null,
    },
    lots: lotsRes.rows.map((l) => ({
      lotKey: l.lot_key,
      worldName: l.world_name,
      lotName: l.lot_name,
      customName: l.custom_name,
      location: l.location,
      defaultType: l.default_type,
      customType: l.custom_type,
      size: l.size ?? '',
      status: l.status,
      description: l.description ?? '',
      householdIds: JSON.parse((l.household_ids as string) || '[]'),
      // Game-sourced entities keep their descriptions read-only on the page,
      // exactly like the planner — sync refreshes them, editing would fight it.
      imported: l.source_id != null,
    })),
    households: householdsRes.rows.map((h) => ({
      id: h.id,
      name: h.name,
      composition: JSON.parse((h.composition as string) || '{}'),
      assignedLotKey: h.assigned_lot_key ?? null,
      description: h.description ?? '',
      thumbnailFilename: h.thumbnail_filename ?? null,
      provenance: h.provenance ?? null,
      creatorName: h.creator_name ?? null,
      imported: h.source_id != null,
    })),
    sims: simsRes.rows.map((s) => ({
      id: s.id,
      householdId: s.household_id,
      firstName: s.first_name,
      lastName: s.last_name,
      gender: s.gender,
      lifestage: s.lifestage,
      species: s.species,
      petSubtype: s.pet_subtype ?? 'pet',
      occult: s.occult ?? 'none',
      isGhost: !!s.is_ghost,
    })),
    photos: photosRes.rows.map((p) => ({
      id: p.id,
      filename: p.filename,
      caption: p.caption ?? '',
      width: p.width ?? null,
      height: p.height ?? null,
      galleryCreator: p.gallery_creator ?? null,
      createdAt: p.created_at,
      targetType: p.target_type ?? null,
      targetKey: p.target_key ?? null,
    })),
    mods: modsRes.rows.map((m) => ({
      name: m.name ?? '',
      url: m.url ?? '',
      type: m.type ?? 'Mod',
      importance: m.importance ?? 'recommended',
    })),
  };
}
