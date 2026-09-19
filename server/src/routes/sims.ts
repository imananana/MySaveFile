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

const Gender    = z.enum(['male', 'female']);
const Lifestage = z.enum(['newborn', 'infant', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder', 'pet']);
const Species   = z.enum(['human', 'pet']);
const PetSub    = z.enum(['cat', 'dog', 'horse', 'pet']);
const Occult    = z.enum(['none', 'vampire', 'alien', 'mermaid', 'spellcaster', 'werewolf', 'fairy']);
const RecordStatus = z.enum(['active', 'tree_only', 'culled', 'stub', 'manual']);

// Hex tuning IDs are short — STOCK_TRAITS keys top out at 6 chars (e.g.
// '0x70718'). 16 chars is a generous cap that fits future-proofing.
const TuningHex = z.string().regex(/^0x[0-9a-f]+$/i).max(16);
// Authored career: a tuning uid, or 'none' = planned unemployed (null = mirror the save).
const PlannedCareerUid = z.union([TuningHex, z.literal('none')]);

// Currently-enrolled university degree (Discover University). Stored as JSON.
const EnrolledDegree = z.object({
  subject: z.string().max(60),
  school: z.enum(['Britechester', 'Foxbury']),
  distinguished: z.boolean(),
}).nullable();

// Active career (from the save's career tracker). Stored as JSON.
const Career = z.object({
  uid: TuningHex,
  name: z.string().max(80),
  kind: z.enum(['fulltime', 'parttime', 'teen', 'club', 'freelance', 'npc', 'school']),
  level: z.number().int().min(0).max(20),
}).nullable();

const SimCreateBody = z.object({
  householdId: z.string().min(1).max(64).nullish(),  // null = tree-only/stub/manual sim
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  gender: Gender.optional(),
  lifestage: Lifestage.optional(),
  species: Species.optional(),
  petSubtype: PetSub.optional(),
  petBreed: z.string().max(100).nullable().optional(),
  occult: Occult.optional(),
  isGhost: z.boolean().optional(),
  notes: z.string().max(10_000).optional(),
  sourceId: z.string().max(64).nullish(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
  traitIds: z.array(TuningHex).max(25).optional(),
  aspirationId: TuningHex.nullable().optional(),
  recordStatus: RecordStatus.optional(),
  deathCause: z.string().max(100).nullable().optional(),
  enrolledDegree: EnrolledDegree.optional(),
  career: Career.optional(),
  // Planner-authored goals (not diffed). plannedCareerUid: career uid, or the
  // sentinel 'none' = planned unemployed (overrides a save-mirrored career).
  plannedSkillIds: z.array(TuningHex).max(60).optional(),
  plannedCareerUid: PlannedCareerUid.nullable().optional(),
  // Planner-authored planned move: a household id (real or plan-only shell). Not diffed.
  plannedMoveHouseholdId: z.string().max(64).nullable().optional(),
  // Observed skills (read-only game-truth). Inserted into sim_skills; not diffed.
  skills: z.array(z.object({
    skillId: TuningHex,
    level: z.number().int().min(0).max(20),
    points: z.number().min(0),
  })).max(120).optional(),
}).strict();

const SimPatchBody = z.object({
  householdId: z.string().min(1).max(64).nullable().optional(),  // null = detach (sim leaves the roster for the family tree)
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  gender: Gender.optional(),
  lifestage: Lifestage.optional(),
  species: Species.optional(),
  petSubtype: PetSub.optional(),
  petBreed: z.string().max(100).nullable().optional(),
  occult: Occult.optional(),
  isGhost: z.boolean().optional(),
  notes: z.string().max(10_000).optional(),
  lastImportedState: z.record(z.string(), z.unknown()).optional(),
  traitIds: z.array(TuningHex).max(25).optional(),
  aspirationId: TuningHex.nullable().optional(),
  recordStatus: RecordStatus.optional(),
  deathCause: z.string().max(100).nullable().optional(),
  enrolledDegree: EnrolledDegree.optional(),
  career: Career.optional(),
  plannedSkillIds: z.array(TuningHex).max(60).optional(),
  plannedCareerUid: PlannedCareerUid.nullable().optional(),
  plannedMoveHouseholdId: z.string().max(64).nullable().optional(),
  // Observed skills (read-only game-truth). When present, WHOLESALE replaces
  // the sim's sim_skills rows — re-sync uses this to keep skills mirroring the
  // latest save (they're excluded from the field diff, so they refresh here).
  skills: z.array(z.object({
    skillId: TuningHex,
    level: z.number().int().min(0).max(20),
    points: z.number().min(0),
  })).max(120).optional(),
}).strict();

// GET /api/save-files/:id/sims
router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }
  const rows = (await query(
    'SELECT id, household_id, first_name, last_name, gender, lifestage, species, pet_subtype, pet_breed, occult, is_ghost, notes, source_id, trait_ids, aspiration_id, record_status, death_cause, culled_at, enrolled_degree, career, planned_skill_ids, planned_career_uid, planned_move_household_id FROM sims WHERE save_file_id = $1 ORDER BY created_at',
    [saveFileId],
  )).rows;
  res.json(rows.map((r) => ({
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
    plannedSkillIds: (r.planned_skill_ids ?? []) as string[],
    plannedCareerUid: r.planned_career_uid ?? null,
    plannedMoveHouseholdId: r.planned_move_household_id ?? null,
  })));
}));

// POST /api/save-files/:id/sims
router.post('/', validateBody(SimCreateBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const { householdId, firstName, lastName, gender, lifestage, species, petSubtype, petBreed, occult, isGhost, notes, sourceId, lastImportedState, traitIds, aspirationId, recordStatus, deathCause, enrolledDegree, career, plannedSkillIds, plannedCareerUid, plannedMoveHouseholdId, skills } = req.body as z.infer<typeof SimCreateBody>;

  if (householdId != null) {
    const hh = (await query('SELECT id FROM households WHERE id = $1 AND save_file_id = $2', [householdId, saveFileId])).rows[0];
    if (!hh) { res.status(404).json({ error: 'Household not found' }); return; }
  }

  // Zod already validated enums; just supply defaults for any unset fields.
  const g  = gender    ?? 'female';
  const ls = lifestage ?? 'adult';
  const sp = species   ?? 'human';
  const ps = petSubtype ?? 'pet';
  const pb = petBreed ?? null;
  const oc = occult    ?? 'none';
  const ig = isGhost ? 1 : 0;
  const ti = traitIds ?? [];
  const ai = aspirationId ?? null;
  const rs = recordStatus ?? 'active';
  const dc = deathCause ?? null;
  const ed = enrolledDegree ?? null;
  const cr = career ?? null;
  const psk = plannedSkillIds ?? [];
  const pcu = plannedCareerUid ?? null;
  const pmh = plannedMoveHouseholdId ?? null;

  const id = nanoid();
  await query(
    `INSERT INTO sims (id, save_file_id, household_id, first_name, last_name, gender, lifestage, species, pet_subtype, pet_breed, occult, is_ghost, notes, source_id, last_imported_state, trait_ids, aspiration_id, record_status, death_cause, enrolled_degree, career, planned_skill_ids, planned_career_uid, planned_move_household_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
    [id, saveFileId, householdId ?? null, firstName ?? '', lastName ?? '', g, ls, sp, ps, pb, oc, ig, notes ?? '', sourceId ?? null, lastImportedState ? JSON.stringify(lastImportedState) : null, ti, ai, rs, dc, ed ? JSON.stringify(ed) : null, cr ? JSON.stringify(cr) : null, psk, pcu, pmh],
  );
  // Observed skills (read-only) → sim_skills rows. Deduped by skill_id.
  if (skills && skills.length) {
    const seen = new Set<string>();
    for (const s of skills) {
      if (seen.has(s.skillId)) continue;
      seen.add(s.skillId);
      await query('INSERT INTO sim_skills (sim_id, skill_id, level, points) VALUES ($1, $2, $3, $4) ON CONFLICT (sim_id, skill_id) DO NOTHING', [id, s.skillId, s.level, s.points]);
    }
  }
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  res.status(201).json({
    id, householdId: householdId ?? null, firstName: firstName ?? '', lastName: lastName ?? '',
    gender: g, lifestage: ls, species: sp, petSubtype: ps, petBreed: pb, occult: oc, isGhost: !!ig, notes: notes ?? '',
    sourceId: sourceId ?? null,
    traitIds: ti,
    aspirationId: ai,
    recordStatus: rs,
    deathCause: dc,
    enrolledDegree: ed,
    career: cr,
    plannedSkillIds: psk,
    plannedCareerUid: pcu,
    plannedMoveHouseholdId: pmh,
  });
}));

// PATCH /api/save-files/:id/sims/:simId
router.patch('/:simId', validateBody(SimPatchBody), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, simId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }

  const sim = (await query('SELECT id FROM sims WHERE id = $1 AND save_file_id = $2', [simId, saveFileId])).rows[0];
  if (!sim) { res.status(404).json({ error: 'Sim not found' }); return; }

  const { householdId, firstName, lastName, gender, lifestage, species, petSubtype, petBreed, occult, isGhost, notes, lastImportedState, traitIds, aspirationId, recordStatus, deathCause, enrolledDegree, career, plannedSkillIds, plannedCareerUid, plannedMoveHouseholdId, skills } = req.body as z.infer<typeof SimPatchBody>;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (householdId !== undefined) {
    if (householdId !== null) {
      const hh = (await query('SELECT id FROM households WHERE id = $1 AND save_file_id = $2', [householdId, saveFileId])).rows[0];
      if (!hh) { res.status(400).json({ error: 'Household not found' }); return; }
    }
    fields.push(`household_id = $${values.length + 1}`); values.push(householdId);
  }
  if (firstName !== undefined) { fields.push(`first_name = $${values.length + 1}`); values.push(firstName); }
  if (lastName  !== undefined) { fields.push(`last_name = $${values.length + 1}`);  values.push(lastName); }
  if (gender    !== undefined) { fields.push(`gender = $${values.length + 1}`);    values.push(gender); }
  if (lifestage !== undefined) { fields.push(`lifestage = $${values.length + 1}`); values.push(lifestage); }
  if (species   !== undefined) { fields.push(`species = $${values.length + 1}`);   values.push(species); }
  if (petSubtype !== undefined) { fields.push(`pet_subtype = $${values.length + 1}`); values.push(petSubtype); }
  if (petBreed   !== undefined) { fields.push(`pet_breed = $${values.length + 1}`);   values.push(petBreed); }
  if (occult    !== undefined) { fields.push(`occult = $${values.length + 1}`);    values.push(occult); }
  if (isGhost   !== undefined) { fields.push(`is_ghost = $${values.length + 1}`); values.push(isGhost ? 1 : 0); }
  if (notes     !== undefined) { fields.push(`notes = $${values.length + 1}`); values.push(notes); }
  if (lastImportedState !== undefined) { fields.push(`last_imported_state = $${values.length + 1}`); values.push(JSON.stringify(lastImportedState)); }
  if (traitIds  !== undefined) { fields.push(`trait_ids = $${values.length + 1}`); values.push(traitIds); }
  if (aspirationId !== undefined) { fields.push(`aspiration_id = $${values.length + 1}`); values.push(aspirationId); }
  if (recordStatus !== undefined) {
    fields.push(`record_status = $${values.length + 1}`); values.push(recordStatus);
    // entering/leaving the culled state stamps/clears culled_at server-side
    fields.push(recordStatus === 'culled' ? `culled_at = NOW()` : `culled_at = NULL`);
  }
  if (deathCause !== undefined) { fields.push(`death_cause = $${values.length + 1}`); values.push(deathCause); }
  if (enrolledDegree !== undefined) { fields.push(`enrolled_degree = $${values.length + 1}`); values.push(enrolledDegree ? JSON.stringify(enrolledDegree) : null); }
  if (career !== undefined) { fields.push(`career = $${values.length + 1}`); values.push(career ? JSON.stringify(career) : null); }
  if (plannedSkillIds !== undefined) { fields.push(`planned_skill_ids = $${values.length + 1}`); values.push(plannedSkillIds); }
  if (plannedCareerUid !== undefined) { fields.push(`planned_career_uid = $${values.length + 1}`); values.push(plannedCareerUid); }
  if (plannedMoveHouseholdId !== undefined) { fields.push(`planned_move_household_id = $${values.length + 1}`); values.push(plannedMoveHouseholdId); }

  // Observed skills (read-only game-truth) refresh: wholesale replace the sim's
  // sim_skills rows to mirror the latest save. Deduped by skill_id like create.
  if (skills !== undefined) {
    await query('DELETE FROM sim_skills WHERE sim_id = $1', [simId]);
    const seen = new Set<string>();
    for (const s of skills) {
      if (seen.has(s.skillId)) continue;
      seen.add(s.skillId);
      await query('INSERT INTO sim_skills (sim_id, skill_id, level, points) VALUES ($1, $2, $3, $4) ON CONFLICT (sim_id, skill_id) DO NOTHING', [simId, s.skillId, s.level, s.points]);
    }
  }

  if (!fields.length && skills === undefined) { res.status(400).json({ error: 'No fields to update' }); return; }
  if (fields.length) {
    fields.push(`updated_at = NOW()`);
    values.push(simId);
    await query(`UPDATE sims SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  }
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);

  // Re-file the sim's portrait so it follows them into their new household's
  // photos. The portrait is a built household photo overlaid as the sim's
  // portrait (assignment target_type='sim'); keep its household target in sync
  // (null when the sim leaves all households). No-op if the portrait isn't a
  // built household photo.
  if (householdId !== undefined) {
    await query(
      `UPDATE photos SET target_key = $1
         WHERE type = 'built' AND target_type = 'household'
           AND id IN (SELECT photo_id FROM photo_assignments
                       WHERE save_file_id = $2 AND target_type = 'sim' AND target_key = $3)`,
      [householdId, saveFileId, simId],
    );
  }

  res.json({ ok: true });
}));

// DELETE /api/save-files/:id/sims/:simId
router.delete('/:simId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id: saveFileId, simId } = req.params;
  if (!await ownsSaveFile(saveFileId, req.userId!)) { res.status(404).json({ error: 'Not found' }); return; }
  await query('DELETE FROM sims WHERE id = $1 AND save_file_id = $2', [simId, saveFileId]);
  await query('UPDATE save_files SET updated_at = NOW() WHERE id = $1', [saveFileId]);
  res.json({ ok: true });
}));

export default router;
