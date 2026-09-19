/**
 * Shared option catalogs for the in-game "criteria" pickers — club membership
 * requirements, small-business customer requirements, and (later) custom-venue
 * role criteria. One source so every tool offers the same, correct set:
 *
 *  - skills .... the visibility-derived criteria set (data/skillCriteriaIds.ts:
 *                Skill_All_Visible minus toddler), NOT the icon manifest (which
 *                includes hidden/retail skills like Sales/Maintenance/Juice Pong)
 *  - careers ... real holdable careers by the confirmed `kind` — excludes only
 *                npc (service sims) and teen (which are exact duplicates of the
 *                part-time jobs: Babysitter/Barista/Fast Food/…). KEEPS the High
 *                School teams (kind 'club': Cheer/Chess/Football/Scouting/…) and
 *                the High School tracker — those are real things a sim holds.
 *  - traits .... CAS personality traits with art, dropping infant/toddler/child-
 *                only picks
 *  - activities  icon-bearing club interaction groups (with pie-menu category)
 */
import { STOCK_SKILLS } from './stockSkills';
import { STOCK_TRAITS, traitIconUrlById } from './stockTraits';
import { STOCK_CAREERS } from './stockCareers';
import { careerIconUrlById } from './careerIcons';
import { SKILL_CRITERIA_IDS } from './skillCriteriaIds';
import { STOCK_CLUB_ACTIVITIES, CLUB_ACTIVITY_CATEGORY, clubActivityIconUrl } from './stockClubActivities';
import { STOCK_ACTIVITIES } from './stockActivities';
import { activityIconUrl } from './venueIcons';

export type Choice = { id: string; name: string; icon?: string; cat?: string };

const byName = (a: Choice, b: Choice) => a.name.localeCompare(b.name);
const YOUNG_ONLY = new Set(['infant', 'toddler', 'child']);

export const SKILL_CHOICES: Choice[] = Object.entries(STOCK_SKILLS)
  .filter(([hex]) => SKILL_CRITERIA_IDS.has(hex.replace(/^0x/, '')))
  .map(([hex, name]) => ({ id: String(parseInt(hex, 16)), name, icon: `/skill-icons/${hex.replace(/^0x/, '')}.png` }))
  .sort(byName);

export const TRAIT_CHOICES: Choice[] = Object.entries(STOCK_TRAITS)
  .filter(([, t]) => t.iconInstance && (t.ages.length === 0 || t.ages.some((a) => !YOUNG_ONLY.has(a))))
  .map(([hex, t]) => ({ id: String(parseInt(hex, 16)), name: t.name, icon: traitIconUrlById(hex) ?? undefined }))
  .sort(byName);

// Drop only service-NPC careers and the teen jobs (the latter duplicate the
// part-time entries by name). Everything else — full-time, part-time, freelance,
// High School teams (kind 'club'), the HS tracker — is a real holdable career.
const CAREER_KINDS_EXCLUDED = new Set(['npc', 'teen']);
export const CAREER_CHOICES: Choice[] = Object.entries(STOCK_CAREERS)
  .filter(([, c]) => !CAREER_KINDS_EXCLUDED.has(c.kind))
  .map(([hex, c]) => ({ id: String(parseInt(hex, 16)), name: c.name, icon: careerIconUrlById(hex) ?? undefined }))
  .sort(byName);

export const ACTIVITY_CHOICES: Choice[] = Object.entries(STOCK_CLUB_ACTIVITIES)
  .map(([hex, name]) => ({ id: hex, name, icon: clubActivityIconUrl(hex) ?? undefined, cat: CLUB_ACTIVITY_CATEGORY[hex] }))
  .filter((c) => c.icon)
  .sort(byName);

// Custom-venue / getaway role activities — the in-game "custom schedule" subset
// (STOCK_ACTIVITIES with the `venue` context flag). Distinct from the club set:
// venues use getaway-only activities the club picker doesn't. id = the decimal
// tuning id the save stores; icon resolves to the category art via venueIcons.
export const VENUE_ACTIVITY_CHOICES: Choice[] = Object.entries(STOCK_ACTIVITIES)
  .filter(([, a]) => a.venue)
  .map(([id, a]) => ({ id, name: a.name, icon: activityIconUrl(Number(id)) ?? undefined, cat: a.category ?? undefined }))
  .sort(byName);
