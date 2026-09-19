/**
 * Discover University (EP12) degree catalog. Base-game University has a fixed
 * set of 13 subjects, each offered at both schools — so this is a hand-built
 * constant (no per-pack scan needed; the whole feature gates on EP12).
 *
 * Two ways a degree shows in a save (see scripts/diagnostics/spikeUniDegree.ts,
 * spikeDegreeVerify.ts):
 *  - ENROLLED  → sim's f30.f30: f1 = program uid (below), f2 = university uid.
 *  - EARNED    → a trait on the sim (one of the 4 variant uids below). BA =
 *                Britechester, BS = Foxbury; the `Honors` variant = graduated
 *                with Honors (high GPA).
 *
 * DISTINGUISHED is derived, not stored: a degree is distinguished when its
 * field is the school's specialty — Britechester = humanities/social,
 * Foxbury = STEM. So `distinguished = (school === subject.specialtySchool)`.
 */
export type University = 'Britechester' | 'Foxbury';

export const UNIVERSITY_BY_UID: Record<string, University> = {
  '0x35a54': 'Britechester',
  '0x35a53': 'Foxbury',
};

export interface DegreeSubject {
  name: string;                 // display name
  specialtySchool: University;  // the school where this degree is distinguished
  program: string;              // enrolled program uid (f30.f30.f1)
  /** Earned-degree trait uids. BA → Britechester, BS → Foxbury. */
  traits: { ba: string; baHonors: string; bs: string; bsHonors: string };
}

// Specialty split confirmed from the seeded D1/D2 fixture (2026-06-16):
// Foxbury (STEM): Biology, Computer Science, Economics, Physics, Psychology, Villainy.
// Britechester (humanities/social): Art History, Communications, Culinary Arts,
// Drama, Fine Art, History, Language & Literature.
export const DEGREE_SUBJECTS: DegreeSubject[] = [
  { name: 'Art History',            specialtySchool: 'Britechester', program: '0x359a0', traits: { ba: '0x35400', baHonors: '0x35401', bs: '0x35402', bsHonors: '0x35403' } },
  { name: 'Biology',                specialtySchool: 'Foxbury',      program: '0x359a1', traits: { ba: '0x35405', baHonors: '0x35406', bs: '0x35407', bsHonors: '0x35408' } },
  { name: 'Communications',         specialtySchool: 'Britechester', program: '0x359a2', traits: { ba: '0x3540a', baHonors: '0x3540b', bs: '0x3540c', bsHonors: '0x3540d' } },
  { name: 'Computer Science',       specialtySchool: 'Foxbury',      program: '0x359a3', traits: { ba: '0x3540f', baHonors: '0x35410', bs: '0x35411', bsHonors: '0x35412' } },
  { name: 'Culinary Arts',          specialtySchool: 'Britechester', program: '0x359a4', traits: { ba: '0x35435', baHonors: '0x35436', bs: '0x35437', bsHonors: '0x35438' } },
  { name: 'Drama',                  specialtySchool: 'Britechester', program: '0x359a5', traits: { ba: '0x3543a', baHonors: '0x3543b', bs: '0x3543c', bsHonors: '0x3543d' } },
  { name: 'Economics',              specialtySchool: 'Foxbury',      program: '0x359a6', traits: { ba: '0x33a33', baHonors: '0x353c6', bs: '0x353c4', bsHonors: '0x353c5' } },
  { name: 'Fine Art',               specialtySchool: 'Britechester', program: '0x359a7', traits: { ba: '0x35440', baHonors: '0x35441', bs: '0x35442', bsHonors: '0x35443' } },
  { name: 'History',                specialtySchool: 'Britechester', program: '0x359a8', traits: { ba: '0x35446', baHonors: '0x35447', bs: '0x35448', bsHonors: '0x35449' } },
  { name: 'Language & Literature',  specialtySchool: 'Britechester', program: '0x359a9', traits: { ba: '0x3544b', baHonors: '0x3544c', bs: '0x3544d', bsHonors: '0x3544e' } },
  { name: 'Physics',                specialtySchool: 'Foxbury',      program: '0x359aa', traits: { ba: '0x35450', baHonors: '0x35451', bs: '0x35452', bsHonors: '0x35453' } },
  { name: 'Psychology',             specialtySchool: 'Foxbury',      program: '0x359ab', traits: { ba: '0x35456', baHonors: '0x35457', bs: '0x35458', bsHonors: '0x35459' } },
  { name: 'Villainy',               specialtySchool: 'Foxbury',      program: '0x359ac', traits: { ba: '0x3545b', baHonors: '0x3545c', bs: '0x3545d', bsHonors: '0x3545e' } },
];

// ─── Derived lookups ──────────────────────────────────────────────────────

/** enrolled program uid → subject */
const PROGRAM_TO_SUBJECT = new Map<string, DegreeSubject>();
/** earned trait uid → { subject, school, honors } */
const TRAIT_TO_EARNED = new Map<string, { subject: DegreeSubject; school: University; honors: boolean }>();
for (const s of DEGREE_SUBJECTS) {
  PROGRAM_TO_SUBJECT.set(s.program, s);
  TRAIT_TO_EARNED.set(s.traits.ba,       { subject: s, school: 'Britechester', honors: false });
  TRAIT_TO_EARNED.set(s.traits.baHonors, { subject: s, school: 'Britechester', honors: true });
  TRAIT_TO_EARNED.set(s.traits.bs,       { subject: s, school: 'Foxbury',      honors: false });
  TRAIT_TO_EARNED.set(s.traits.bsHonors, { subject: s, school: 'Foxbury',      honors: true });
}

export interface EarnedDegree {
  subject: string;
  school: University;
  honors: boolean;
  distinguished: boolean;
}
export interface EnrolledDegree {
  subject: string;
  school: University;
  distinguished: boolean;   // pursuing the distinguished version (field == school specialty)
}

const norm = (uid: string) => uid.toLowerCase();

/** Resolve an earned-degree trait uid (hex string) → degree, or null. */
export function earnedDegreeFromTrait(uid: string): EarnedDegree | null {
  const hit = TRAIT_TO_EARNED.get(norm(uid));
  if (!hit) return null;
  return {
    subject: hit.subject.name,
    school: hit.school,
    honors: hit.honors,
    distinguished: hit.school === hit.subject.specialtySchool,
  };
}

/** Resolve an enrolled program uid + university uid → enrollment, or null. */
export function enrolledDegreeFromUids(programUid: string, universityUid: string): EnrolledDegree | null {
  const subject = PROGRAM_TO_SUBJECT.get(norm(programUid));
  const school = UNIVERSITY_BY_UID[norm(universityUid)];
  if (!subject || !school) return null;
  return { subject: subject.name, school, distinguished: school === subject.specialtySchool };
}

const SUBJECT_BY_NAME = new Map(DEGREE_SUBJECTS.map((s) => [s.name, s]));
/** Re-derive `distinguished` from the current specialty mapping (keyed by
 *  subject name, since enrollment stores no uid). Used to canonicalize stored
 *  enrollment in the re-sync snapshot so a future specialty-mapping change can't
 *  read as a phantom "University changed". Subject/school are stable EA strings. */
export function resolveEnrolledDegree(d: EnrolledDegree): EnrolledDegree {
  const subject = SUBJECT_BY_NAME.get(d.subject);
  if (!subject) return d;
  return { subject: d.subject, school: d.school, distinguished: d.school === subject.specialtySchool };
}

/** All earned degrees from a sim's full trait id list. */
export function earnedDegreesFromTraits(traitIds: string[]): EarnedDegree[] {
  const out: EarnedDegree[] = [];
  for (const id of traitIds) { const d = earnedDegreeFromTrait(id); if (d) out.push(d); }
  return out;
}

const EARNED_TRAIT_SET = new Set(TRAIT_TO_EARNED.keys());
/** True if this single uid is an earned-degree trait. Used at import time to
 *  keep degree traits even though they aren't in the CAS trait catalog. */
export function isDegreeTrait(uid: string): boolean {
  return EARNED_TRAIT_SET.has(norm(uid));
}
/** True if any of the sim's trait ids is an earned-degree trait. */
export function hasDegreeTrait(traitIds: string[]): boolean {
  return traitIds.some((id) => EARNED_TRAIT_SET.has(norm(id)));
}

/** Human-readable label for an earned-degree trait uid, or null if not one.
 *  Used to render degree traits in English wherever raw traitIds are shown
 *  (e.g. the re-sync diff), since they aren't in the CAS STOCK_TRAITS catalog. */
export function degreeTraitLabel(uid: string): string | null {
  const d = earnedDegreeFromTrait(uid);
  if (!d) return null;
  return `${d.subject} Degree (${d.school}${d.honors ? ', Honors' : ''})`;
}
