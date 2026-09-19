import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { PoolClient } from 'pg';
import path from 'path';
import os from 'os';
import fs from 'fs';
import multer from 'multer';
import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';
import { query, withTransaction } from '../db/client';
import { getSeedLots } from '../db/seedLots';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { sanitizeUserUrl } from '../lib/safeUrl';
import { stripNullBytes } from '../middleware/stripNullBytes';
import { ensureSlugForName } from '../lib/showcaseSlug';
import { buildShowcasePayload, SHOWCASE_SAVE_COLUMNS, ShowcaseSaveRow } from '../lib/showcasePayload';
import { fetchFromR2, uploadToR2 } from '../lib/r2';
import { purgeSavePhotos } from '../lib/savePhotoCleanup';
import { warmSaveFilePhotos } from '../lib/photoWarm';

const router = Router();
router.use(requireAuth);

// .s4plan restores: the bundle can be ~1GB (every lot/household/portrait filled),
// so spool it to a temp file rather than buffering in memory, and stream-read it.
const backupUpload = multer({ storage: multer.diskStorage({ destination: os.tmpdir() }), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

const IMG_MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

// Dynasty row → API DTO. Shared by the read, export, and snapshot paths so the
// shape (and the jsonb decoding) stays consistent everywhere.
function rowToDynastyDTO(d: Record<string, unknown>) {
  return {
    id:          d.id,
    name:        d.name,
    description: d.description ?? '',
    notes:       d.notes ?? '',
    headSimId:   d.head_sim_id ?? null,
    members:     JSON.parse((d.members as string) || '[]'),
    valueIds:    JSON.parse((d.value_ids as string) || '[]'),
    crestBgHash: d.crest_bg_hash ?? null,
    crestFgHash: d.crest_fg_hash ?? null,
    prestige:    d.prestige ?? null,
    unity:       d.unity ?? null,
    perkIds:     JSON.parse((d.perk_ids as string) || '[]'),
    allianceSourceIds: JSON.parse((d.alliance_source_ids as string) || '[]'),
    rivalrySourceIds:  JSON.parse((d.rivalry_source_ids as string) || '[]'),
    sourceId:          d.source_id ?? null,
    lastImportedState: d.last_imported_state ?? null,
  };
}

// All save-scoped images a backup must carry: built photos (household strips, lot/
// world/sim shots) + any inspo library photos assigned into this save.
async function gatherSavePhotos(saveId: string, userId: string) {
  const photos = (await query(
    `SELECT id, type, target_type, target_key, filename, caption, categories, tags, gallery_creator, width, height
       FROM photos
      WHERE user_id = $2 AND ((save_file_id = $1 AND type = 'built')
                              OR id IN (SELECT photo_id FROM photo_assignments WHERE save_file_id = $1))`,
    [saveId, userId],
  )).rows;
  const assignments = (await query('SELECT photo_id, target_type, target_key FROM photo_assignments WHERE save_file_id = $1', [saveId])).rows;
  const exclusions = (await query('SELECT photo_id FROM photo_exclusions WHERE save_file_id = $1', [saveId])).rows;
  return { photos, assignments, exclusions };
}

// Recreate bundled photos on import: every bundled image was re-uploaded to the
// importer's R2 (filenameMap: old name → new key). Insert photo rows owned by the
// importer + remap assignment/exclusion photo ids and sim/household target keys.
interface Bundle { photos: Record<string, unknown>[]; assignments: Record<string, unknown>[]; exclusions: Record<string, unknown>[]; filenameMap: Record<string, string> }
async function createPhotosFromBundle(
  client: PoolClient, newSaveId: string, userId: string, bundle: Bundle,
  simIdMap: Map<string, string>, hhIdMap: Map<string, string>,
): Promise<Map<string, string>> {
  const remapTarget = (type: string, key: string): string | undefined =>
    type === 'sim' ? simIdMap.get(key) : type === 'household' ? hhIdMap.get(key) : key;
  const photoIdMap = new Map<string, string>();
  for (const p of bundle.photos) {
    const newFilename = bundle.filenameMap[p.filename as string];
    if (!newFilename) continue; // image wasn't in the bundle
    const key = p.target_key as string | null;
    const newKey = key != null ? remapTarget(p.target_type as string, key) : null;
    if (key != null && newKey === undefined) continue;
    const newPhotoId = nanoid();
    await client.query(
      `INSERT INTO photos (id, user_id, type, save_file_id, target_type, target_key, filename, caption, categories, tags, gallery_creator, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [newPhotoId, userId, p.type, newSaveId, p.target_type ?? null, newKey ?? null, newFilename, p.caption ?? '', p.categories ?? '[]', p.tags ?? '[]', p.gallery_creator ?? null, p.width ?? null, p.height ?? null],
    );
    photoIdMap.set(p.id as string, newPhotoId);
  }
  for (const a of bundle.assignments) {
    const newKey = remapTarget(a.target_type as string, a.target_key as string);
    const pid = photoIdMap.get(a.photo_id as string);
    if (newKey === undefined || !pid) continue;
    await client.query('INSERT INTO photo_assignments (photo_id, save_file_id, target_type, target_key) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [pid, newSaveId, a.target_type, newKey]);
  }
  for (const e of bundle.exclusions) {
    const pid = photoIdMap.get(e.photo_id as string);
    if (!pid) continue;
    await client.query('INSERT INTO photo_exclusions (photo_id, save_file_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [pid, newSaveId]);
  }
  return photoIdMap;
}

// Showcase settings reference households by id and photos by id; both get new
// ids on duplicate/restore, so the blob is remapped like every other
// cross-entity ref. World names and lot_keys are stable and pass through.
// A reference whose target didn't carry over is dropped — the showcase
// renderer treats missing ids as "not chosen" and falls back gracefully.
function remapShowcaseSettings(
  blob: Record<string, unknown>,
  hhIdMap: Map<string, string>,
  photoIdMap: Map<string, string>,
): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(blob)) as Record<string, unknown>;
  if (Array.isArray(out.featuredHouseholds)) {
    out.featuredHouseholds = (out.featuredHouseholds as string[])
      .map((id) => hhIdMap.get(id))
      .filter((id): id is string => !!id);
  }
  const cover = out.cover as Record<string, unknown> | undefined;
  if (cover && typeof cover.photoId === 'string') {
    cover.photoId = photoIdMap.get(cover.photoId) ?? null;
  }
  const worlds = out.worlds as Record<string, Record<string, unknown>> | undefined;
  if (worlds && typeof worlds === 'object') {
    for (const w of Object.values(worlds)) {
      if (typeof w?.leadPhotoId === 'string') w.leadPhotoId = photoIdMap.get(w.leadPhotoId) ?? null;
    }
  }
  return out;
}

async function seedLotsForSaveFile(saveFileId: string, client: PoolClient) {
  for (const row of getSeedLots()) {
    await client.query(
      `INSERT INTO lots (id, save_file_id, lot_key, world_name, lot_name, custom_name, location, default_type, custom_type, size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (save_file_id, lot_key) DO NOTHING`,
      [nanoid(), saveFileId, row.lotKey, row.worldName, row.lotName, row.lotName, row.location, row.defaultType, row.defaultType, row.size],
    );
  }
}

// ── Faithful save copy helpers ─────────────────────────────────────────────
// buildExportSaveFile reads a save into the portable export shape;
// createSaveFromExport writes that shape back as a new save. /export, /import,
// /snapshot, and /duplicate all route through these so the copy logic — and
// what it includes (lots, households, sims, clubs, businesses, holidays,
// custom venues) — lives in ONE place and can't drift.

async function buildExportSaveFile(saveId: string, userId: string): Promise<Record<string, unknown> | null> {
  const sf = (await query(
    'SELECT id, name, description, save_file_url, disabled_worlds, season_length, imported_season_length, neighborhood_captions, world_blurbs, source_save_filename, source_save_name, last_synced_at, showcase, detected_packs FROM save_files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [saveId, userId],
  )).rows[0] as Record<string, unknown> | undefined;
  if (!sf) return null;

  const [lotsRes, householdsRes, clubsRes, smallBizRes, holidaysRes, dynastiesRes, customVenuesRes, customVenuePresetsRes, simsRes, relsRes] = await Promise.all([
    query('SELECT * FROM lots WHERE save_file_id = $1', [saveId]),
    query('SELECT * FROM households WHERE save_file_id = $1', [saveId]),
    query('SELECT * FROM clubs WHERE save_file_id = $1', [saveId]),
    query('SELECT * FROM small_businesses WHERE save_file_id = $1', [saveId]),
    query('SELECT * FROM holidays WHERE save_file_id = $1', [saveId]),
    query('SELECT * FROM dynasties WHERE save_file_id = $1', [saveId]),
    query('SELECT lot_key, name, venue_schedule, notes, roles, slots, source, is_getaway, host_household_id, source_preset_id FROM custom_venues WHERE save_file_id = $1', [saveId]),
    query('SELECT id, kind, name, data, source FROM custom_venue_presets WHERE save_file_id = $1', [saveId]),
    query('SELECT * FROM sims WHERE save_file_id = $1 ORDER BY created_at', [saveId]),
    query('SELECT sim_a_id, sim_b_id, rel_type, source FROM sim_relationships WHERE save_file_id = $1', [saveId]),
  ]);
  // Mods + CC. The rows belong to the USER, not the save, so this is the one
  // part of the bundle that isn't save-scoped — it rides along because a save
  // that needs mods is not portable without the list. `excluded` is save-scoped
  // and travels with it, so a copy keeps whatever you'd hidden.
  const modsRes = await query(
    `SELECT m.name, m.url, m.type, m.importance, m.notes,
            CASE WHEN me.mod_id IS NOT NULL THEN TRUE ELSE FALSE END AS excluded
       FROM mods m
       LEFT JOIN mod_exclusions me ON me.mod_id = m.id AND me.save_file_id = $1
      WHERE m.user_id = $2
      ORDER BY m.name`,
    [saveId, userId],
  );

  const skillsRes = await query('SELECT ss.sim_id, ss.skill_id, ss.level, ss.points FROM sim_skills ss JOIN sims s ON s.id = ss.sim_id WHERE s.save_file_id = $1', [saveId]);
  const exportSkillsBySim = new Map<string, Array<{ skillId: string; level: number; points: number }>>();
  for (const r of skillsRes.rows) {
    const arr = exportSkillsBySim.get(r.sim_id) ?? [];
    arr.push({ skillId: r.skill_id, level: r.level, points: Number(r.points) });
    exportSkillsBySim.set(r.sim_id, arr);
  }

  return {
    name: sf.name,
    description: sf.description ?? '',
    saveFileUrl: sf.save_file_url ?? null,
    disabledWorlds: JSON.parse((sf.disabled_worlds as string) || '[]'),
    seasonLength: sf.season_length,
    importedSeasonLength: sf.imported_season_length ?? null,
    neighborhoodCaptions: JSON.parse((sf.neighborhood_captions as string) || '{}'),
    worldBlurbs: JSON.parse((sf.world_blurbs as string) || '{}'),
    sourceSaveFilename: sf.source_save_filename ?? null,  // keep the .save linkage so copies re-sync
    sourceSaveName: sf.source_save_name ?? null,
    lastSyncedAt: sf.last_synced_at ?? null,
    // Showcase-authored settings travel with the save. Live/slug do NOT — a
    // copy or restore starts unpublished and mints its own link on first Live.
    showcase: sf.showcase ?? {},
    detectedPacks: sf.detected_packs ?? null,
    lots: lotsRes.rows.map((l) => ({
      lotKey:             l.lot_key,
      customName:         l.custom_name,
      customType:         l.custom_type,
      status:             l.status,
      notes:              l.notes ?? '',
      householdIds:       JSON.parse((l.household_ids as string) || '[]'),
      clubIds:            JSON.parse((l.club_ids      as string) || '[]'),
      hasSmallBusiness:   Boolean(l.has_small_business),
      smallBusinessName:  l.small_business_name  ?? '',
      smallBusinessNotes: l.small_business_notes ?? '',
      smallBusinessIcon:  l.small_business_icon  ?? '',
      sourceId:           l.source_id ?? null,
      lastImportedState:  l.last_imported_state ?? null,
    })),
    households: householdsRes.rows.map((h) => ({
      id:             h.id,
      name:           h.name,
      composition:    JSON.parse(h.composition as string),
      assignedLotKey: h.assigned_lot_key ?? null,
      notes:          h.notes ?? '',
      description:    h.description ?? '',
      sourceId:          h.source_id ?? null,
      money:             h.money != null ? Number(h.money) : null,
      plannedMoney:      h.planned_money != null ? Number(h.planned_money) : null,
      provenance:        h.provenance ?? null,
      provenanceSub:     h.provenance_sub ?? null,
      creatorName:       h.creator_name ?? null,
      visibility:        h.visibility ?? 'auto',
      lastImportedState: h.last_imported_state ?? null,
    })),
    clubs: clubsRes.rows.map((c) => ({
      id:             c.id,
      name:           c.name,
      icon:           c.icon ?? '',
      assignedLotKey: c.assigned_lot_key ?? null,
      notes:          c.notes ?? '',
      memberSimIds:      JSON.parse((c.member_sim_ids as string) || '[]'),
      leaderSimId:       c.leader_sim_id ?? null,
      criteria:          JSON.parse((c.criteria as string) || '[]'),
      rules:             JSON.parse((c.rules as string) || '[]'),
      inviteOnly:        !!c.invite_only,
      hangoutVenueTypeId: c.hangout_venue_type_id ?? null,
      sourceId:          c.source_id ?? null,
      lastImportedState: c.last_imported_state ?? null,
    })),
    smallBusinesses: smallBizRes.rows.map((sb) => ({
      id:               sb.id,
      name:             sb.name,
      icon:             sb.icon ?? '',
      notes:            sb.notes ?? '',
      description:      sb.description ?? '',
      assignedLotKeys:  JSON.parse((sb.assigned_lot_keys as string) || '[]'),
      ownerSimId:       sb.owner_sim_id ?? null,
      employeeSimIds:    JSON.parse((sb.employee_sim_ids as string) || '[]'),
      customerCriteria:  JSON.parse((sb.customer_criteria as string) || '[]'),
      activities:        JSON.parse((sb.activities as string) || '[]'),
      feeMode:           sb.fee_mode ?? 'unknown',
      priceModifierPct:  sb.price_modifier_pct ?? 0,
      renownRank:        sb.renown_rank ?? null,
      alignment:         sb.alignment ?? null,
      perkPoints:        sb.perk_points ?? 0,
      sourceId:          sb.source_id ?? null,
      lastImportedState: sb.last_imported_state ?? null,
    })),
    holidays: holidaysRes.rows.map((h) => ({
      name:   h.name,
      icon:   h.icon ?? '',
      season: h.season ?? 'Spring',
      day:    h.day ?? 1,
      notes:  h.notes ?? '',
      traditions:        JSON.parse((h.traditions as string) || '[]'),
      unassigned:        !!h.unassigned,
      timeOff:           !!h.time_off,
      decorationPreset:  h.decoration_preset ?? null,
      sourceId:          h.source_id ?? null,
      scaledDates:       h.scaled_dates ?? null,
      lastImportedState: h.last_imported_state ?? null,
    })),
    dynasties: dynastiesRes.rows.map(rowToDynastyDTO),
    customVenues: customVenuesRes.rows.map((cv) => ({
      lotKey:          cv.lot_key ?? null,
      name:            cv.name ?? '',
      venueSchedule:   cv.venue_schedule ?? '',
      notes:           cv.notes ?? '',
      roles:           cv.roles ?? [],
      slots:           cv.slots ?? [],
      source:          cv.source ?? 'import',
      isGetaway:       cv.is_getaway ?? false,
      hostHouseholdId: cv.host_household_id ?? null,
      sourcePresetId: cv.source_preset_id ?? null,
    })),
    customVenuePresets: customVenuePresetsRes.rows.map((p) => ({
      id:     p.id,                              // for old→new remap (a venue's "started from")
      kind:   p.kind,
      name:   p.name ?? '',
      data:   p.data,
      source: p.source,
    })),
    sims: simsRes.rows.map((s) => ({
      id:           s.id,                      // for old→new remap (relationships, club members)
      householdId:  s.household_id,            // null for tree-only/stub/culled — preserved on import
      firstName:    s.first_name,
      lastName:     s.last_name,
      gender:       s.gender,
      lifestage:    s.lifestage,
      species:      s.species,
      petSubtype:   s.pet_subtype ?? 'pet',
      petBreed:     s.pet_breed ?? null,
      occult:       s.occult ?? 'none',
      isGhost:      Boolean(s.is_ghost),
      notes:        s.notes ?? '',
      traitIds:     (s.trait_ids ?? []) as string[],
      aspirationId: s.aspiration_id ?? null,
      deathCause:   s.death_cause ?? null,
      enrolledDegree: s.enrolled_degree ? JSON.parse(s.enrolled_degree) : null,
      career:       s.career ? JSON.parse(s.career) : null,
      sourceId:          s.source_id ?? null,
      recordStatus:      s.record_status ?? 'active',
      culledAt:          s.culled_at ?? null,
      skills:            exportSkillsBySim.get(s.id) ?? [],
      lastImportedState: s.last_imported_state ?? null,
      plannedSkillIds:   (s.planned_skill_ids ?? []) as string[],
      plannedCareerUid:  s.planned_career_uid ?? null,
      plannedMoveHouseholdId: s.planned_move_household_id ?? null,
    })),
    relationships: relsRes.rows.map((r) => ({
      simAId:  r.sim_a_id,
      simBId:  r.sim_b_id,
      relType: r.rel_type,
      source:  r.source ?? 'import',
    })),
    mods: modsRes.rows.map((m) => ({
      name:       m.name ?? '',
      url:        m.url ?? '',
      type:       m.type ?? 'Mod',
      importance: m.importance ?? 'recommended',
      notes:      m.notes ?? '',
      excluded:   !!m.excluded,
    })),
  };
}

// Copy a save's save-scoped photos (built household/lot/world/sim shots) + the
// portrait/cover assignments + exclusions onto a new save. Built rows are copied
// (new id) but SHARE the same R2 file (no re-upload, no storage multiplication;
// the refcount-aware photo delete keeps it safe). Inspo (library) photos aren't
// copied — assignments just keep pointing at the shared library photo. sim +
// household target keys are remapped to the new save's ids; lot/world keys are
// stable. Only runs for same-user in-DB copies (duplicate / snapshot / reset),
// never JSON import.
async function copyPhotosForDuplicate(
  client: PoolClient,
  sourceSaveId: string,
  newSaveId: string,
  simIdMap: Map<string, string>,
  hhIdMap: Map<string, string>,
): Promise<Map<string, string>> {
  const remapTarget = (type: string, key: string): string | undefined => {
    if (type === 'sim') return simIdMap.get(key);
    if (type === 'household') return hhIdMap.get(key);
    return key; // lot (lot_key) / world (world name) — stable across saves
  };

  const builtPhotoIdMap = new Map<string, string>();
  const built = (await client.query(`SELECT * FROM photos WHERE save_file_id = $1 AND type = 'built'`, [sourceSaveId])).rows;
  for (const p of built) {
    const key = p.target_key as string | null;
    const newKey = key != null ? remapTarget(p.target_type as string, key) : null;
    if (key != null && newKey === undefined) continue; // its sim/household didn't carry over
    const newPhotoId = nanoid();
    await client.query(
      `INSERT INTO photos (id, user_id, type, save_file_id, target_type, target_key, filename, caption, categories, tags, gallery_creator, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [newPhotoId, p.user_id, p.type, newSaveId, p.target_type, newKey ?? null, p.filename, p.caption ?? '', p.categories ?? '[]', p.tags ?? '[]', p.gallery_creator ?? null, p.width ?? null, p.height ?? null],
    );
    builtPhotoIdMap.set(p.id as string, newPhotoId);
  }

  const assigns = (await client.query(`SELECT * FROM photo_assignments WHERE save_file_id = $1`, [sourceSaveId])).rows;
  for (const a of assigns) {
    const newKey = remapTarget(a.target_type as string, a.target_key as string);
    if (newKey === undefined) continue;
    const photoId = builtPhotoIdMap.get(a.photo_id as string) ?? a.photo_id;
    await client.query(
      `INSERT INTO photo_assignments (photo_id, save_file_id, target_type, target_key) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [photoId, newSaveId, a.target_type, newKey],
    );
  }

  const excl = (await client.query(`SELECT * FROM photo_exclusions WHERE save_file_id = $1`, [sourceSaveId])).rows;
  for (const e of excl) {
    const photoId = builtPhotoIdMap.get(e.photo_id as string) ?? e.photo_id;
    await client.query(
      `INSERT INTO photo_exclusions (photo_id, save_file_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [photoId, newSaveId],
    );
  }
  return builtPhotoIdMap;
}

async function createSaveFromExport(
  client: PoolClient,
  sf: Record<string, unknown>,
  userId: string,
  opts: { name: string; deletedAt?: boolean; autoBackup?: boolean; copyPhotosFromSaveId?: string; duplicatedFrom?: string; bundle?: Bundle },
): Promise<string> {
  const lots         = (sf.lots            as Array<Record<string, unknown>>) ?? [];
  const households   = (sf.households      as Array<Record<string, unknown>>) ?? [];
  const clubs        = (sf.clubs           as Array<Record<string, unknown>>) ?? [];
  const smallBizList = (sf.smallBusinesses as Array<Record<string, unknown>>) ?? [];
  const holidays     = (sf.holidays        as Array<Record<string, unknown>>) ?? [];
  const dynasties    = (sf.dynasties       as Array<Record<string, unknown>>) ?? [];
  const customVenues = (sf.customVenues    as Array<Record<string, unknown>>) ?? [];
  const customVenuePresets = (sf.customVenuePresets as Array<Record<string, unknown>>) ?? [];
  const sims         = (sf.sims            as Array<Record<string, unknown>>) ?? [];

  const hhIdMap   = new Map<string, string>(households.map((h) => [h.id as string, nanoid()]));
  const clubIdMap = new Map<string, string>(clubs.map((c) => [c.id as string, nanoid()]));
  const sbIdMap   = new Map<string, string>(smallBizList.map((s) => [s.id as string, nanoid()]));
  // old sim id → new id, for remapping relationships + club membership. Sims
  // exported before this field carried `id` fall back to a fresh id (no remap).
  const simIdMap  = new Map<string, string>(sims.filter((s) => s.id).map((s) => [s.id as string, nanoid()]));
  // Venue presets get new ids like everything else, so the "this schedule
  // started from preset X" pointer a venue (or a role inside it) carries has to
  // travel through the same map — otherwise it names an id that no longer
  // exists and the provenance silently reads as hand-built.
  const presetIdMap = new Map<string, string>(
    customVenuePresets.filter((p) => p.id).map((p) => [p.id as string, nanoid()]),
  );
  const remapPreset = (id: unknown): string | null =>
    (typeof id === 'string' ? presetIdMap.get(id) ?? null : null);

  const newId = nanoid();

  await client.query(
    'INSERT INTO save_files (id, user_id, name, description, save_file_url, disabled_worlds, season_length, imported_season_length, neighborhood_captions, world_blurbs, deleted_at, auto_backup, source_save_filename, source_save_name, last_synced_at, duplicated_from) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)',
    [newId, userId, opts.name, (sf.description as string) ?? '', sanitizeUserUrl(sf.saveFileUrl as string | null | undefined), JSON.stringify(sf.disabledWorlds ?? []), sf.seasonLength ?? 1, (sf.importedSeasonLength as number | null | undefined) ?? sf.seasonLength ?? null, JSON.stringify(sf.neighborhoodCaptions ?? {}), JSON.stringify(sf.worldBlurbs ?? {}), opts.deletedAt ? new Date() : null, opts.autoBackup ?? false, sf.sourceSaveFilename ?? null, sf.sourceSaveName ?? null, sf.lastSyncedAt ?? null, opts.duplicatedFrom ?? null],
  );

  await seedLotsForSaveFile(newId, client);

  for (const lot of lots) {
    const newHhIds   = ((lot.householdIds as string[]) ?? []).map((id) => hhIdMap.get(id) ?? id);
    const newClubIds = ((lot.clubIds      as string[]) ?? []).map((id) => clubIdMap.get(id) ?? id);
    await client.query(
      `UPDATE lots SET
        custom_name = $1, custom_type = $2, status = $3, notes = $4,
        household_ids = $5, club_ids = $6,
        has_small_business = $7, small_business_name = $8,
        small_business_notes = $9, small_business_icon = $10,
        source_id = $13, last_imported_state = $14
       WHERE save_file_id = $11 AND lot_key = $12`,
      [
        lot.customName, lot.customType, lot.status, lot.notes ?? '',
        JSON.stringify(newHhIds), JSON.stringify(newClubIds),
        lot.hasSmallBusiness ? 1 : 0,
        lot.smallBusinessName ?? '', lot.smallBusinessNotes ?? '', lot.smallBusinessIcon ?? '',
        newId, lot.lotKey,
        lot.sourceId ?? null, lot.lastImportedState ? JSON.stringify(lot.lastImportedState) : null,
      ],
    );
  }

  for (const hh of households) {
    await client.query(
      'INSERT INTO households (id, save_file_id, name, composition, assigned_lot_key, notes, description, source_id, money, planned_money, provenance, provenance_sub, creator_name, visibility, last_imported_state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
      [hhIdMap.get(hh.id as string), newId, hh.name, JSON.stringify(hh.composition ?? {}), hh.assignedLotKey ?? null, hh.notes ?? '', hh.description ?? '', hh.sourceId ?? null, hh.money ?? null, hh.plannedMoney ?? null, hh.provenance ?? null, hh.provenanceSub ?? null, hh.creatorName ?? null, hh.visibility ?? 'auto', hh.lastImportedState ? JSON.stringify(hh.lastImportedState) : null],
    );
  }

  // Insert after households (FK). household_id is nullable: tree-only / stub /
  // culled sims have no household and must still be carried (they're the family
  // tree). Only a sim whose set household failed to map is treated as detached.
  for (const sim of sims) {
    const newHhId = sim.householdId ? (hhIdMap.get(sim.householdId as string) ?? null) : null;
    // The planned-move target is a household id → remap it like householdId so
    // the sticker survives restore instead of dangling at a stale id.
    const newPlannedMoveHhId = sim.plannedMoveHouseholdId ? (hhIdMap.get(sim.plannedMoveHouseholdId as string) ?? null) : null;
    const newSimId = (sim.id && simIdMap.get(sim.id as string)) || nanoid();
    await client.query(
      `INSERT INTO sims (id, save_file_id, household_id, first_name, last_name, gender, lifestage,
        species, pet_subtype, pet_breed, occult, is_ghost, notes, trait_ids, aspiration_id,
        death_cause, enrolled_degree, career, source_id, record_status, culled_at, last_imported_state,
        planned_skill_ids, planned_career_uid, planned_move_household_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [
        newSimId, newId, newHhId,
        sim.firstName ?? '', sim.lastName ?? '', sim.gender ?? 'female', sim.lifestage ?? 'adult',
        sim.species ?? 'human', sim.petSubtype ?? 'pet', sim.petBreed ?? null,
        sim.occult ?? 'none', sim.isGhost ? 1 : 0, sim.notes ?? '',
        (sim.traitIds as string[]) ?? [], sim.aspirationId ?? null,
        sim.deathCause ?? null,
        sim.enrolledDegree ? JSON.stringify(sim.enrolledDegree) : null,
        sim.career ? JSON.stringify(sim.career) : null,
        sim.sourceId ?? null, sim.recordStatus ?? 'active', sim.culledAt ?? null,
        sim.lastImportedState ? JSON.stringify(sim.lastImportedState) : null,
        (sim.plannedSkillIds as string[]) ?? [], sim.plannedCareerUid ?? null, newPlannedMoveHhId,
      ],
    );
    // Restore observed skills for this sim.
    for (const sk of (sim.skills as Array<{ skillId: string; level: number; points: number }>) ?? []) {
      await client.query('INSERT INTO sim_skills (sim_id, skill_id, level, points) VALUES ($1,$2,$3,$4) ON CONFLICT (sim_id, skill_id) DO NOTHING', [newSimId, sk.skillId, sk.level, sk.points]);
    }
  }

  // Relationships — remap both endpoints to the new sim ids; skip any edge whose
  // endpoints didn't both carry over.
  const relationships = (sf.relationships as Array<Record<string, unknown>>) ?? [];
  for (const rel of relationships) {
    const a = simIdMap.get(rel.simAId as string);
    const b = simIdMap.get(rel.simBId as string);
    if (!a || !b) continue;
    await client.query(
      'INSERT INTO sim_relationships (id, save_file_id, sim_a_id, sim_b_id, rel_type, source) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
      [nanoid(), newId, a, b, rel.relType, rel.source ?? 'import'],
    );
  }

  for (const club of clubs) {
    // Remap member sim ids old→new; drop any that didn't carry over.
    const newMembers = ((club.memberSimIds as string[]) ?? [])
      .map((id) => simIdMap.get(id))
      .filter((id): id is string => !!id);
    const newLeader = club.leaderSimId ? (simIdMap.get(club.leaderSimId as string) ?? null) : null;
    await client.query(
      `INSERT INTO clubs (id, save_file_id, name, icon, assigned_lot_key, notes, member_sim_ids,
                          leader_sim_id, criteria, rules, invite_only, hangout_venue_type_id, source_id, last_imported_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [clubIdMap.get(club.id as string), newId, club.name, club.icon ?? '', club.assignedLotKey ?? null, club.notes ?? '', JSON.stringify(newMembers),
       newLeader, JSON.stringify(club.criteria ?? []), JSON.stringify(club.rules ?? []), club.inviteOnly ?? false,
       (club.hangoutVenueTypeId as string) ?? null, club.sourceId ?? null, club.lastImportedState ? JSON.stringify(club.lastImportedState) : null],
    );
  }

  for (const sb of smallBizList) {
    const newOwnerId = sb.ownerSimId ? (simIdMap.get(sb.ownerSimId as string) ?? null) : null;
    const newEmployees = ((sb.employeeSimIds as string[]) ?? [])
      .map((eid) => simIdMap.get(eid))
      .filter((eid): eid is string => !!eid);
    await client.query(
      `INSERT INTO small_businesses (id, save_file_id, name, icon, notes, description, assigned_lot_keys, owner_sim_id,
         employee_sim_ids, customer_criteria, activities, fee_mode, price_modifier_pct, renown_rank, alignment, perk_points,
         source_id, last_imported_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [sbIdMap.get(sb.id as string), newId, sb.name, sb.icon ?? '', sb.notes ?? '', sb.description ?? '', JSON.stringify(sb.assignedLotKeys ?? []), newOwnerId,
       JSON.stringify(newEmployees), JSON.stringify(sb.customerCriteria ?? []), JSON.stringify(sb.activities ?? []),
       sb.feeMode ?? 'unknown', sb.priceModifierPct ?? 0, sb.renownRank ?? null, sb.alignment ?? null, sb.perkPoints ?? 0,
       sb.sourceId ?? null, sb.lastImportedState ? JSON.stringify(sb.lastImportedState) : null],
    );
  }

  for (const holiday of holidays) {
    await client.query(
      'INSERT INTO holidays (id, save_file_id, name, icon, season, day, notes, traditions, unassigned, time_off, decoration_preset, source_id, scaled_dates, last_imported_state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
      [nanoid(), newId, holiday.name, holiday.icon ?? '', holiday.season ?? 'Spring', holiday.day ?? 1, holiday.notes ?? '', JSON.stringify(holiday.traditions ?? []), holiday.unassigned ?? false, holiday.timeOff ?? false, holiday.decorationPreset ?? null, holiday.sourceId ?? null, holiday.scaledDates ? JSON.stringify(holiday.scaledDates) : null, holiday.lastImportedState ? JSON.stringify(holiday.lastImportedState) : null],
    );
  }

  for (const cv of customVenues) {
    const hostId = cv.hostHouseholdId ? (hhIdMap.get(cv.hostHouseholdId as string) ?? null) : null;
    // A role can carry its own "started from" pointer, so remap inside the JSON too.
    const roles = Array.isArray(cv.roles)
      ? (cv.roles as Array<Record<string, unknown>>).map((r) => (
          r && r.sourcePresetId ? { ...r, sourcePresetId: remapPreset(r.sourcePresetId) } : r
        ))
      : cv.roles;
    await client.query(
      'INSERT INTO custom_venues (id, save_file_id, lot_key, name, venue_schedule, notes, roles, slots, source, is_getaway, host_household_id, source_preset_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (save_file_id, lot_key) DO NOTHING',
      [nanoid(), newId, cv.lotKey ?? null, cv.name ?? '', cv.venueSchedule ?? '', cv.notes ?? '',
       roles ? JSON.stringify(roles) : null, cv.slots ? JSON.stringify(cv.slots) : null,
       (cv.source as string) ?? 'import', (cv.isGetaway as boolean) ?? false, hostId, remapPreset(cv.sourcePresetId)],
    );
  }

  for (const p of customVenuePresets) {
    await client.query(
      'INSERT INTO custom_venue_presets (id, save_file_id, kind, name, data, source) VALUES ($1, $2, $3, $4, $5, $6)',
      [presetIdMap.get(p.id as string) ?? nanoid(), newId, p.kind, p.name ?? '', JSON.stringify(p.data ?? {}), p.source ?? 'import'],
    );
  }

  // Assign new dynasty ids up front so authored alliance/rivalry refs (stored as
  // the partner's planner id) can be remapped old→new. Imported refs are game
  // source ids — not in the map, so they pass through untouched.
  const dynIdMap = new Map<string, string>();
  for (const dyn of dynasties) dynIdMap.set(dyn.id as string, nanoid());
  const remapRefs = (refs: unknown) => ((refs as string[]) ?? []).map((r) => dynIdMap.get(r) ?? r);

  for (const dyn of dynasties) {
    // Remap the head + member sim ids old→new; drop members that didn't carry over.
    const newHead = dyn.headSimId ? (simIdMap.get(dyn.headSimId as string) ?? null) : null;
    const newMembers = ((dyn.members as Array<{ simId: string; order: number; role: string | null }>) ?? [])
      .map((m) => ({ simId: simIdMap.get(m.simId), order: m.order, role: m.role ?? null }))
      .filter((m): m is { simId: string; order: number; role: string | null } => !!m.simId);
    await client.query(
      `INSERT INTO dynasties
         (id, save_file_id, name, description, notes, head_sim_id, members, value_ids,
          crest_bg_hash, crest_fg_hash, prestige, unity, perk_ids, alliance_source_ids,
          rivalry_source_ids, source_id, last_imported_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        dynIdMap.get(dyn.id as string), newId, dyn.name ?? '', dyn.description ?? '', dyn.notes ?? '', newHead,
        JSON.stringify(newMembers), JSON.stringify(dyn.valueIds ?? []),
        dyn.crestBgHash ?? null, dyn.crestFgHash ?? null, dyn.prestige ?? null, dyn.unity ?? null,
        JSON.stringify(dyn.perkIds ?? []), JSON.stringify(remapRefs(dyn.allianceSourceIds)),
        JSON.stringify(remapRefs(dyn.rivalrySourceIds)), dyn.sourceId ?? null,
        dyn.lastImportedState ? JSON.stringify(dyn.lastImportedState) : null,
      ],
    );
  }

  // Mods + CC — FIND OR CREATE, never blind insert.
  //
  // The rows belong to the user, not the save, and this helper runs on every
  // duplicate AND on the auto-backup taken before every sync. Inserting the
  // bundle's mods each time would multiply the account's list on a schedule.
  // So an entry the account already has (same name, same kind, ignoring case)
  // is reused, and only genuinely new ones are created — which in practice
  // means only a restore into a different account creates anything at all.
  //
  // An unnamed entry is skipped: there's nothing to match it on, so it could
  // only ever accumulate.
  const bundleMods = (sf.mods as Array<Record<string, unknown>> | undefined) ?? [];
  if (bundleMods.length) {
    const existing = new Map<string, string>();
    for (const row of (await client.query('SELECT id, name, type FROM mods WHERE user_id = $1', [userId])).rows) {
      existing.set(`${String(row.name ?? '').trim().toLowerCase()}::${row.type}`, row.id as string);
    }
    for (const m of bundleMods) {
      const name = String(m.name ?? '').trim();
      if (!name) continue;
      const type = m.type === 'CC' ? 'CC' : 'Mod';
      const key = `${name.toLowerCase()}::${type}`;
      let modId = existing.get(key);
      if (!modId) {
        modId = nanoid();
        await client.query(
          'INSERT INTO mods (id, user_id, name, url, type, importance, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [
            modId, userId, name,
            sanitizeUserUrl(m.url as string | null | undefined) ?? '',
            type,
            m.importance === 'required' ? 'required' : 'recommended',
            String(m.notes ?? ''),
          ],
        );
        existing.set(key, modId);
      }
      // Hidden-from-this-save is save-scoped, so it travels even when the entry
      // itself was already there — that's what makes a duplicate faithful.
      if (m.excluded) {
        await client.query(
          'INSERT INTO mod_exclusions (mod_id, save_file_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [modId, newId],
        );
      }
    }
  }

  // Photos: in-DB copies (duplicate / snapshot / reset) copy from the source save;
  // .s4plan restores recreate from the bundle's re-uploaded images. Both need the
  // sim + household id maps for target remapping.
  let photoIdMap = new Map<string, string>();
  if (opts.copyPhotosFromSaveId) {
    photoIdMap = await copyPhotosForDuplicate(client, opts.copyPhotosFromSaveId, newId, simIdMap, hhIdMap);
  } else if (opts.bundle) {
    photoIdMap = await createPhotosFromBundle(client, newId, userId, opts.bundle, simIdMap, hhIdMap);
  }

  // Showcase settings ride along (remapped) — but the copy is NOT live and has
  // no slug; publishing is a deliberate act on the new save.
  const showcase = (sf.showcase as Record<string, unknown>) ?? {};
  if (Object.keys(showcase).length) {
    await client.query('UPDATE save_files SET showcase = $1 WHERE id = $2', [
      JSON.stringify(remapShowcaseSettings(showcase, hhIdMap, photoIdMap)),
      newId,
    ]);
  }
  if (sf.detectedPacks) {
    await client.query('UPDATE save_files SET detected_packs = $1 WHERE id = $2', [
      JSON.stringify(sf.detectedPacks), newId,
    ]);
  }

  return newId;
}

// GET /api/save-files
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = (await query(
    'SELECT id, name, duplicated_from, created_at, updated_at, last_synced_at FROM save_files WHERE user_id = $1 AND deleted_at IS NULL ORDER BY COALESCE(last_opened_at, updated_at) DESC',
    [req.userId],
  )).rows;
  res.json(rows.map((r: Record<string, unknown>) => ({ ...r, duplicatedFrom: r.duplicated_from ?? null })));
}));

// GET /api/save-files/trash — soft-deleted saves, for the restore UI.
router.get('/trash', asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = (await query(
    'SELECT id, name, deleted_at, auto_backup, created_at, updated_at FROM save_files WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
    [req.userId],
  )).rows;
  res.json(rows);
}));

// POST /api/save-files
router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, sourceSaveFilename, sourceSaveName } = req.body as {
    name?: string;
    sourceSaveFilename?: string;
    sourceSaveName?: string;
  };
  const id = nanoid();
  // First-import saves get last_synced_at = NOW() so the "Synced N days ago"
  // indicator starts the clock from creation. Hand-created saves leave it null.
  const lastSyncedAt = sourceSaveFilename ? new Date() : null;
  await withTransaction(async (client) => {
    await client.query(
      'INSERT INTO save_files (id, user_id, name, source_save_filename, source_save_name, last_synced_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, req.userId, name ?? 'My Save File', sourceSaveFilename ?? null, sourceSaveName ?? null, lastSyncedAt],
    );
    await seedLotsForSaveFile(id, client);
  });
  const sf = (await query('SELECT id, name, source_save_filename, source_save_name, last_synced_at, created_at, updated_at FROM save_files WHERE id = $1', [id])).rows[0];
  res.status(201).json(sf);
}));

// POST /api/save-files/import — restore a .s4plan backup (zip: data.json +
// images), uploaded as multipart. Falls back to a legacy data-only JSON file.
router.post('/import', backupUpload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  let saveFile: Record<string, unknown> | undefined;
  let bundle: Bundle | undefined;

  if (req.file) {
    const tmpPath = req.file.path;
    try {
      // zip magic 'PK' → .s4plan; otherwise treat as a legacy data-only JSON.
      const head = Buffer.alloc(2);
      const fd = await fs.promises.open(tmpPath, 'r');
      await fd.read(head, 0, 2, 0);
      await fd.close();

      if (head[0] === 0x50 && head[1] === 0x4b) {
        const directory = await unzipper.Open.file(tmpPath);
        const dataEntry = directory.files.find((f) => f.path === 'data.json');
        if (!dataEntry) { res.status(400).json({ error: 'Invalid backup file' }); return; }
        const parsed = JSON.parse((await dataEntry.buffer()).toString('utf8'));
        saveFile = parsed.saveFile;
        // Re-upload each image (one at a time) to the importer's R2 under a fresh key.
        const filenameMap: Record<string, string> = {};
        for (const entry of directory.files) {
          if (entry.type !== 'File' || !entry.path.startsWith('images/')) continue;
          const orig = entry.path.slice('images/'.length);
          const ext = path.extname(orig).toLowerCase();
          const newKey = `${nanoid()}${ext}`;
          await uploadToR2(await entry.buffer(), newKey, IMG_MIME[ext] ?? 'application/octet-stream');
          filenameMap[orig] = newKey;
        }
        bundle = { photos: parsed.photos ?? [], assignments: parsed.assignments ?? [], exclusions: parsed.exclusions ?? [], filenameMap };
      } else {
        const parsed = JSON.parse(await fs.promises.readFile(tmpPath, 'utf8'));
        saveFile = parsed.saveFile;
      }
    } finally {
      fs.promises.unlink(tmpPath).catch(() => {});
    }
  } else {
    // Legacy JSON body (no file upload).
    saveFile = (req.body as { saveFile?: Record<string, unknown> })?.saveFile;
  }

  if (!saveFile) { res.status(400).json({ error: 'Invalid backup file' }); return; }

  // The bundle's data.json is parsed here, not by express.json, so the global
  // NUL scrub never saw it — a backup exported before the scrub existed could
  // still carry NULs that Postgres would reject.
  saveFile = stripNullBytes(saveFile);

  const newName = `${(saveFile.name as string) ?? 'Imported Save'} (Imported)`;
  let newId = '';
  await withTransaction(async (client) => {
    newId = await createSaveFromExport(client, saveFile!, req.userId!, { name: newName, bundle });
  });

  const result = (await query('SELECT id, name, created_at, updated_at FROM save_files WHERE id = $1', [newId])).rows[0];
  res.status(201).json(result);
}));

// GET /api/save-files/:id
router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sf = (await query(
    'SELECT id, name, description, disabled_worlds, season_length, imported_season_length, neighborhood_captions, world_blurbs, share_token, source_save_filename, source_save_name, last_synced_at, save_file_url, showcase, showcase_live, showcase_slug, created_at, updated_at FROM save_files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [req.params.id, req.userId],
  )).rows[0] as Record<string, unknown> | undefined;
  if (!sf) { res.status(404).json({ error: 'Not found' }); return; }

  // Stamp recency-of-use for the save picker's ordering (fire-and-forget).
  query('UPDATE save_files SET last_opened_at = NOW() WHERE id = $1', [req.params.id]).catch(() => {});

  const [lotsRes, householdsRes, clubsRes, smallBusinessesRes, holidaysRes, dynastiesRes, simsRes, customVenuesRes, customVenuePresetsRes, skillsRes] = await Promise.all([
    query('SELECT * FROM lots WHERE save_file_id = $1', [req.params.id]),
    query('SELECT * FROM households WHERE save_file_id = $1', [req.params.id]),
    query('SELECT * FROM clubs WHERE save_file_id = $1', [req.params.id]),
    query('SELECT * FROM small_businesses WHERE save_file_id = $1', [req.params.id]),
    query('SELECT * FROM holidays WHERE save_file_id = $1', [req.params.id]),
    query('SELECT * FROM dynasties WHERE save_file_id = $1', [req.params.id]),
    query('SELECT id, household_id, first_name, last_name, gender, lifestage, species, pet_subtype, pet_breed, occult, is_ghost, notes, source_id, trait_ids, aspiration_id, record_status, death_cause, culled_at, enrolled_degree, career, last_imported_state, planned_skill_ids, planned_career_uid, planned_move_household_id FROM sims WHERE save_file_id = $1 ORDER BY created_at', [req.params.id]),
    query('SELECT id, lot_key, name, venue_schedule, notes, roles, slots, source, is_getaway, host_household_id, source_preset_id FROM custom_venues WHERE save_file_id = $1 ORDER BY created_at', [req.params.id]),
    query('SELECT id, kind, name, data, source FROM custom_venue_presets WHERE save_file_id = $1 ORDER BY name', [req.params.id]),
    query('SELECT ss.sim_id, ss.skill_id, ss.level, ss.points FROM sim_skills ss JOIN sims s ON s.id = ss.sim_id WHERE s.save_file_id = $1', [req.params.id]),
  ]);
  // Group skills by sim for attachment below.
  const skillsBySim = new Map<string, Array<{ skillId: string; level: number; points: number }>>();
  for (const r of skillsRes.rows) {
    const arr = skillsBySim.get(r.sim_id) ?? [];
    arr.push({ skillId: r.skill_id, level: r.level, points: Number(r.points) });
    skillsBySim.set(r.sim_id, arr);
  }

  res.json({
    ...sf,
    disabled_worlds: JSON.parse(sf.disabled_worlds as string),
    neighborhood_captions: JSON.parse((sf.neighborhood_captions as string) || '{}'),
    world_blurbs: JSON.parse((sf.world_blurbs as string) || '{}'),
    lots: lotsRes.rows.map((l) => ({
      ...l,
      household_ids: JSON.parse(l.household_ids as string),
      club_ids: JSON.parse((l.club_ids as string) || '[]'),
    })),
    households: householdsRes.rows.map((h) => ({
      ...h,
      composition: JSON.parse(h.composition as string),
    })),
    clubs: clubsRes.rows.map((c) => ({
      ...c,
      member_sim_ids: JSON.parse((c.member_sim_ids as string) || '[]'),
      criteria: JSON.parse((c.criteria as string) || '[]'),
      rules: JSON.parse((c.rules as string) || '[]'),
    })),
    smallBusinesses: smallBusinessesRes.rows,
    holidays: holidaysRes.rows,
    dynasties: dynastiesRes.rows.map(rowToDynastyDTO),
    customVenues: customVenuesRes.rows.map((r) => ({
      id: r.id,
      lotKey: r.lot_key ?? null,
      name: r.name ?? '',
      venueSchedule: r.venue_schedule,
      notes: r.notes,
      roles: r.roles ?? [],
      slots: r.slots ?? [],
      source: r.source ?? 'import',
      isGetaway: r.is_getaway ?? false,
      hostHouseholdId: r.host_household_id ?? null,
      sourcePresetId: r.source_preset_id ?? null,
    })),
    customVenuePresets: customVenuePresetsRes.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name ?? '',
      data: r.data,
      source: r.source,
    })),
    sims: simsRes.rows.map((r) => ({
      id: r.id,
      householdId: r.household_id,
      firstName: r.first_name,
      lastName: r.last_name,
      gender: r.gender,
      lifestage: r.lifestage,
      species: r.species,
      petSubtype: r.pet_subtype ?? 'pet',
      petBreed: r.pet_breed ?? null,
      occult: r.occult ?? 'none',
      isGhost: !!r.is_ghost,
      notes: r.notes,
      sourceId: r.source_id ?? null,
      traitIds: (r.trait_ids ?? []) as string[],
      aspirationId: r.aspiration_id ?? null,
      recordStatus: r.record_status ?? 'active',
      deathCause: r.death_cause ?? null,
      culledAt: r.culled_at ?? null,
      enrolledDegree: r.enrolled_degree ? JSON.parse(r.enrolled_degree) : null,
      career: r.career ? JSON.parse(r.career) : null,
      skills: skillsBySim.get(r.id) ?? [],
      lastImportedState: r.last_imported_state ?? null,
      plannedSkillIds: (r.planned_skill_ids ?? []) as string[],
      plannedCareerUid: r.planned_career_uid ?? null,
      plannedMoveHouseholdId: r.planned_move_household_id ?? null,
    })),
  });
}));

// GET /api/save-files/:id/import-snapshots
// Returns the `last_imported_state` JSONB for every importable entity. Used
// by the re-import diff flow — never needed for normal app navigation.
router.get('/:id/import-snapshots', asyncHandler(async (req: AuthRequest, res: Response) => {
  const owned = (await query('SELECT id FROM save_files WHERE id = $1 AND user_id = $2', [req.params.id, req.userId])).rows[0];
  if (!owned) { res.status(404).json({ error: 'Not found' }); return; }

  const [lotsRes, householdsRes, simsRes, clubsRes, sbRes, holidaysRes, dynastiesRes, customVenuesRes] = await Promise.all([
    query('SELECT lot_key, source_id, last_imported_state FROM lots WHERE save_file_id = $1', [req.params.id]),
    query('SELECT id, source_id, last_imported_state FROM households WHERE save_file_id = $1', [req.params.id]),
    query('SELECT id, source_id, last_imported_state FROM sims WHERE save_file_id = $1', [req.params.id]),
    query('SELECT id, source_id, last_imported_state FROM clubs WHERE save_file_id = $1', [req.params.id]),
    query('SELECT id, source_id, last_imported_state FROM small_businesses WHERE save_file_id = $1', [req.params.id]),
    query('SELECT id, source_id, last_imported_state FROM holidays WHERE save_file_id = $1', [req.params.id]),
    query('SELECT id, source_id, last_imported_state FROM dynasties WHERE save_file_id = $1', [req.params.id]),
    // Custom venues are identified by lot_key (stable across saves, like lots),
    // not a game source_id. plannerId = id, identity key = lot_key.
    query('SELECT id, lot_key, last_imported_state FROM custom_venues WHERE save_file_id = $1', [req.params.id]),
  ]);

  res.json({
    lots:            lotsRes.rows,
    households:      householdsRes.rows,
    sims:            simsRes.rows,
    clubs:           clubsRes.rows,
    smallBusinesses: sbRes.rows,
    holidays:        holidaysRes.rows,
    dynasties:       dynastiesRes.rows,
    customVenues:    customVenuesRes.rows,
  });
}));

// GET /api/save-files/:id/export — a complete, self-contained .s4plan backup
// (a zip with a custom extension so the OS won't auto-expand it): data.json +
// every image the save shows. Restored via POST /import.
router.get('/:id/export', asyncHandler(async (req: AuthRequest, res: Response) => {
  const saveFile = await buildExportSaveFile(req.params.id, req.userId!);
  if (!saveFile) { res.status(404).json({ error: 'Not found' }); return; }

  const { photos, assignments, exclusions } = await gatherSavePhotos(req.params.id, req.userId!);

  const slug = (saveFile.name as string).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  res.setHeader('Content-Disposition', `attachment; filename="${slug}.s4plan"`);
  res.setHeader('Content-Type', 'application/octet-stream');

  // Stream the zip out as it's built. We fetch images from R2 with a small
  // concurrency WINDOW (overlapping network latency → fast even for huge saves),
  // but gate appends so we never run more than WINDOW entries ahead of what the
  // archive has flushed to the client. That keeps peak memory ~WINDOW images
  // regardless of save size and respects a slow client (no unbounded buffering).
  const WINDOW = 6;
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('error', (err: Error) => { res.destroy(err); });
  archive.pipe(res);

  let appended = 0;
  let processed = 0;
  const roomWaiters: (() => void)[] = [];
  archive.on('progress', (p: { entries: { processed: number } }) => {
    processed = p.entries.processed;
    while (roomWaiters.length) roomWaiters.shift()!();
  });
  const waitForRoom = async () => {
    while (appended - processed >= WINDOW) await new Promise<void>((r) => roomWaiters.push(r));
  };

  const uniqueFilenames = [...new Set(photos.map((p) => p.filename as string))];
  const ok = new Set<string>();
  let idx = 0;
  const worker = async () => {
    while (idx < uniqueFilenames.length) {
      const fn = uniqueFilenames[idx++];
      let buf: Buffer;
      try { buf = await fetchFromR2(fn); } catch { continue; } // missing in R2 → drop
      await waitForRoom();
      archive.append(buf, { name: `images/${fn}` });
      appended++;
      ok.add(fn);
    }
  };
  await Promise.all(Array.from({ length: WINDOW }, worker));

  const includedPhotos = photos.filter((p) => ok.has(p.filename as string));
  const keptIds = new Set(includedPhotos.map((p) => p.id));
  archive.append(JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    saveFile,
    photos: includedPhotos,
    assignments: assignments.filter((a) => keptIds.has(a.photo_id)),
    exclusions: exclusions.filter((e) => keptIds.has(e.photo_id)),
  }), { name: 'data.json' });

  await archive.finalize();
}));

// PATCH /api/save-files/:id
router.patch('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, description, disabledWorlds, seasonLength, importedSeasonLength, neighborhoodCaptions, worldBlurbs, touchSyncedAt, sourceSaveFilename, sourceSaveName, saveFileUrl, detectedPacks } = req.body as { name?: string; description?: string; disabledWorlds?: string[]; seasonLength?: number; importedSeasonLength?: number; neighborhoodCaptions?: Record<string, string>; worldBlurbs?: Record<string, string>; touchSyncedAt?: boolean; sourceSaveFilename?: string; sourceSaveName?: string; saveFileUrl?: string | null; detectedPacks?: string[] };
  if (!name && description === undefined && disabledWorlds === undefined && seasonLength === undefined && importedSeasonLength === undefined && neighborhoodCaptions === undefined && worldBlurbs === undefined && !touchSyncedAt && sourceSaveFilename === undefined && sourceSaveName === undefined && saveFileUrl === undefined && detectedPacks === undefined) {
    res.status(400).json({ error: 'name, description, disabledWorlds, seasonLength, importedSeasonLength, neighborhoodCaptions, worldBlurbs, touchSyncedAt, sourceSaveFilename, sourceSaveName, saveFileUrl, or detectedPacks is required' });
    return;
  }
  if (detectedPacks !== undefined) {
    // Per-save pack evidence, written by the import flow after detection.
    const result = await query(
      'UPDATE save_files SET detected_packs = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [JSON.stringify(Array.isArray(detectedPacks) ? detectedPacks : []), req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (saveFileUrl !== undefined) {
    // Empty/invalid clears the field; a valid http(s) URL replaces it. The
    // field is free-form (Patreon, Drive, etc.) but sanitizeUserUrl strips any
    // non-http(s) scheme so a javascript:/data: URL can never be stored and
    // later rendered as an href. The server never *fetches* this URL.
    const value = sanitizeUserUrl(saveFileUrl);
    const result = await query(
      'UPDATE save_files SET save_file_url = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [value || null, req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  // sourceSaveFilename + sourceSaveName are set together when a from-scratch
  // planner save is being linked to a .save file for the first time. Treat
  // them as a single atomic update so the identity is never half-populated.
  if (sourceSaveFilename !== undefined || sourceSaveName !== undefined) {
    const result = await query(
      'UPDATE save_files SET source_save_filename = COALESCE($1, source_save_filename), source_save_name = COALESCE($2, source_save_name), updated_at = NOW() WHERE id = $3 AND user_id = $4',
      [sourceSaveFilename ?? null, sourceSaveName ?? null, req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (touchSyncedAt) {
    const result = await query(
      'UPDATE save_files SET last_synced_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (disabledWorlds !== undefined) {
    const result = await query(
      'UPDATE save_files SET disabled_worlds = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [JSON.stringify(disabledWorlds), req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (seasonLength !== undefined) {
    const result = await query(
      'UPDATE save_files SET season_length = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [seasonLength, req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (importedSeasonLength !== undefined) {
    const result = await query(
      'UPDATE save_files SET imported_season_length = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [importedSeasonLength, req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (worldBlurbs !== undefined) {
    const result = await query(
      'UPDATE save_files SET world_blurbs = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [JSON.stringify(worldBlurbs), req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (neighborhoodCaptions !== undefined) {
    const result = await query(
      'UPDATE save_files SET neighborhood_captions = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [JSON.stringify(neighborhoodCaptions), req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (description !== undefined) {
    const result = await query(
      'UPDATE save_files SET description = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [description, req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  }
  if (name) {
    const result = await query(
      'UPDATE save_files SET name = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      [name, req.params.id, req.userId],
    );
    if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
    // The showcase link follows the save's name: a save that has ever gone
    // Live carries a slug, and a rename re-mints it (old slugs keep
    // redirecting via showcase_slugs). Saves that never went Live have no
    // slug and get one on their first Live toggle instead.
    const hasSlug = (await query('SELECT showcase_slug FROM save_files WHERE id = $1', [req.params.id])).rows[0]?.showcase_slug;
    if (hasSlug) await ensureSlugForName(req.params.id, name);
  }
  res.json({ ok: true });
}));

// GET /api/save-files/:id/showcase-payload — the SAME payload the public
// /api/public/s/:slug route serves, addressed by save id. This is how the
// owner opens their showcase before it has ever gone Live (no slug exists
// yet); after that, both routes serve identical data.
router.get('/:id/showcase-payload', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sf = (await query(
    `SELECT ${SHOWCASE_SAVE_COLUMNS}
     FROM save_files sf JOIN users u ON u.id = sf.user_id
     WHERE sf.id = $1 AND sf.user_id = $2 AND sf.deleted_at IS NULL`,
    [req.params.id, req.userId],
  )).rows[0] as ShowcaseSaveRow | undefined;
  if (!sf) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(await buildShowcasePayload(sf, true));
}));

// PATCH /api/save-files/:id/showcase — replace the showcase-authored settings
// blob (cover choice, world order/visibility, lead picks, featured lists,
// section orders). Client-owned JSON; the server only bounds its size.
router.patch('/:id/showcase', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { showcase } = req.body as { showcase?: Record<string, unknown> };
  if (showcase === undefined || typeof showcase !== 'object' || showcase === null || Array.isArray(showcase)) {
    res.status(400).json({ error: 'showcase object is required' });
    return;
  }
  const encoded = JSON.stringify(showcase);
  if (encoded.length > 200_000) { res.status(400).json({ error: 'showcase settings too large' }); return; }
  const result = await query(
    'UPDATE save_files SET showcase = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL',
    [encoded, req.params.id, req.userId],
  );
  if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
}));

// POST /api/save-files/:id/showcase-live { live } — the publish switch. The
// first Live mints the vanity slug from the save's name (first claimant owns
// the clean slug; copies get -2, -3…). Live off IS the revoke: the link then
// renders the not-live page. The slug is kept, so toggling back on restores
// the same link.
router.post('/:id/showcase-live', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { live } = req.body as { live?: boolean };
  if (typeof live !== 'boolean') { res.status(400).json({ error: 'live boolean is required' }); return; }
  const sf = (await query(
    'SELECT id, name, showcase_slug FROM save_files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [req.params.id, req.userId],
  )).rows[0] as { id: string; name: string; showcase_slug: string | null } | undefined;
  if (!sf) { res.status(404).json({ error: 'Not found' }); return; }

  let slug = sf.showcase_slug;
  if (live && !slug) slug = await ensureSlugForName(sf.id, sf.name);
  await query('UPDATE save_files SET showcase_live = $1, updated_at = NOW() WHERE id = $2', [live, sf.id]);
  // Going live is the moment before the audience arrives — make the CDN's
  // sized copies now so the first visitor never waits on them.
  if (live) warmSaveFilePhotos(sf.id, `go-live ${slug ?? sf.id}`);
  res.json({ live, slug });
}));

// DELETE /api/save-files/:id — soft delete (recoverable from the trash).
router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    'UPDATE save_files SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [req.params.id, req.userId],
  );
  if (!result.rowCount) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
}));

// POST /api/save-files/:id/restore — undo a soft delete.
router.post('/:id/restore', asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await query(
    'UPDATE save_files SET deleted_at = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL',
    [req.params.id, req.userId],
  );
  if (!result.rowCount) { res.status(404).json({ error: 'Not found in trash' }); return; }
  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/purge — permanently delete a trashed save.
// Only acts on already-soft-deleted saves, so it can't bypass the trash.
router.delete('/:id/purge', asyncHandler(async (req: AuthRequest, res: Response) => {
  // Confirm ownership + trashed state BEFORE touching photos, so a wrong id
  // can't strip a save's images and then fail to delete it.
  const owned = (await query(
    'SELECT id FROM save_files WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL',
    [req.params.id, req.userId],
  )).rows[0];
  if (!owned) { res.status(404).json({ error: 'Not found in trash' }); return; }

  // Photo rows don't cascade (no FK on save_file_id) — clear them first or they
  // outlive the save invisibly.
  await purgeSavePhotos(req.params.id);

  const result = await query(
    'DELETE FROM save_files WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL',
    [req.params.id, req.userId],
  );
  if (!result.rowCount) { res.status(404).json({ error: 'Not found in trash' }); return; }
  res.json({ ok: true });
}));

// POST /api/save-files/:id/snapshot — faithful copy parked in the trash, for
// recovery before a destructive operation (re-import / reset).
router.post('/:id/snapshot', asyncHandler(async (req: AuthRequest, res: Response) => {
  const saveFile = await buildExportSaveFile(req.params.id, req.userId!);
  if (!saveFile) { res.status(404).json({ error: 'Not found' }); return; }

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const name = `Auto-backup — ${saveFile.name} — ${stamp}`;
  let newId = '';
  await withTransaction(async (client) => {
    newId = await createSaveFromExport(client, saveFile, req.userId!, { name, deletedAt: true, autoBackup: true, copyPhotosFromSaveId: req.params.id });
  });
  res.status(201).json({ id: newId });
}));

// POST /api/save-files/:id/reset — wipe a save back to seed. Snapshots the
// current state to the trash first so it's recoverable.
//
// "Reset planner data" means ALL of it. It used to delete only lots + households
// (sims following by FK), which left clubs, businesses, holidays, dynasties and
// custom venues standing — still holding member/owner/host ids of sims and
// households that had just been deleted — plus every household-less sim (the
// family tree's ancestors and Unknown stubs). The screen claimed otherwise, and
// the leftovers were dangling references, so the sweep is the fix rather than the
// wording. What survives is deliberate: the save row itself, its .save link,
// name, description, share token, season length, pack signals and every photo.
router.post('/:id/reset', asyncHandler(async (req: AuthRequest, res: Response) => {
  const saveFile = await buildExportSaveFile(req.params.id, req.userId!);
  if (!saveFile) { res.status(404).json({ error: 'Not found' }); return; }

  await withTransaction(async (client) => {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    await createSaveFromExport(client, saveFile, req.userId!, {
      name: `Auto-backup before reset — ${saveFile.name} — ${stamp}`,
      deletedAt: true,
      autoBackup: true,
      copyPhotosFromSaveId: req.params.id,
    });
    // Order matters only for the two FK'd tables: sims reference households, and
    // relationships/skills reference sims. Everything else hangs off the save.
    for (const table of ['clubs', 'small_businesses', 'holidays', 'dynasties', 'custom_venues', 'custom_venue_presets', 'sim_relationships']) {
      await client.query(`DELETE FROM ${table} WHERE save_file_id = $1`, [req.params.id]);
    }
    // Every sim, not just the ones in a household — tree-only relatives, Unknown
    // ancestor stubs and culled sims have no household to cascade from.
    await client.query('DELETE FROM sims WHERE save_file_id = $1', [req.params.id]);
    await client.query('DELETE FROM households WHERE save_file_id = $1', [req.params.id]);
    await client.query('DELETE FROM lots WHERE save_file_id = $1', [req.params.id]);
    await seedLotsForSaveFile(req.params.id, client);
    await client.query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [req.params.id]);
  });

  res.json({ ok: true });
}));

// POST /api/save-files/:id/duplicate — full, faithful copy (routes through the
// shared helper, so it no longer drops sims/clubs/businesses like the old code).
router.post('/:id/duplicate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const saveFile = await buildExportSaveFile(req.params.id, req.userId!);
  if (!saveFile) { res.status(404).json({ error: 'Not found' }); return; }

  let newId = '';
  await withTransaction(async (client) => {
    newId = await createSaveFromExport(client, saveFile, req.userId!, { name: `${saveFile.name} (copy)`, copyPhotosFromSaveId: req.params.id, duplicatedFrom: saveFile.name as string });
  });

  const sf = (await query('SELECT id, name, created_at, updated_at FROM save_files WHERE id = $1', [newId])).rows[0];
  res.status(201).json(sf);
}));

export default router;
