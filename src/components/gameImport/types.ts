/**
 * Review-modal shape: what each row in the import-review UI knows about the
 * thing it's about to create. These are slightly different from `ParsedX` (the
 * raw parser output) because they carry resolved planner keys + selection
 * state.
 */
import type { SimGender, SimLifestage, SimSpecies, SimPetSubtype, SimOccult, SimEnrolledDegree, SimCareer } from '../../types';
import type { VenueCriterion, ParsedClubRule, SmallBusinessCustomerCriterion } from '../../lib/parser/types';

export interface ReviewSim {
  parsedId: bigint;
  firstName: string;
  lastName: string;
  gender: SimGender;
  lifestage: SimLifestage;
  species: SimSpecies;
  petSubtype: SimPetSubtype;
  petBreed: string | null;
  occult: SimOccult;
  isGhost: boolean;
  deathCause: string | null;   // e.g. 'Cowplant'; null = alive or unmapped
  traitIds: bigint[];          // raw bigint trait IDs from save; filtered at write time
  aspirationId: bigint | null; // raw bigint aspiration tuning ID from save
  enrolledDegree: SimEnrolledDegree | null; // currently-enrolled university degree
  career: SimCareer | null;                 // active career from the save
  skills: { skillId: string; level: number; points: number }[]; // observed skills (read-only)
}

export interface ReviewHousehold {
  parsedId: bigint;
  name: string;
  description: string;
  money: number | null;   // household funds (Simoleons) from the save; null if absent
  provenance: 'yours' | 'ea' | 'mod' | null;  // classified at parse (Yours/EA/Mod)
  provenanceSub: string | null;               // sub-label
  creatorName: string | null;                 // gallery/mod creator, if any
  sims: ReviewSim[];
  lotKey: string | null;
  gameLotName: string | null;
  hasLotInSave: boolean;
  selected: boolean;
}

export interface LotChange {
  lotKey: string;
  defaultName: string;
  defaultType: string;
  newName: string | null;     // null if unchanged
  newType: string | null;     // null if unchanged
}

export interface ReviewClub {
  parsedId: bigint;
  name: string;                       // resolved: stored ?? stock-map ?? placeholder
  description: string;                // empty if not set in the save
  icon: string;                       // ResourceKey instance hex, '' if not in our library
  hangoutLotKey: string | null;       // planner lot_key (Specific Location hangout), or null
  hangoutVenueTypeId: string | null;  // venue tuning id hex (General Venue hangout), or null
  isStock: boolean;                   // true when name came from stock map or placeholder
  memberSimIds: bigint[];             // save's sim_ids — resolved to planner sim.id at import time
  leaderSimId: bigint | null;         // founder sim_id — resolved to planner sim.id at import time
  criteria: VenueCriterion[];         // membership requirements (read-only)
  rules: ParsedClubRule[];            // encouraged/discouraged activities + target (read-only)
  inviteOnly: boolean;                // false = Open Invitation, true = Invite Only
}

export interface ReviewHoliday {
  holidayType: bigint;
  name: string;                       // resolved: stored ?? stock-map ?? fallback
  icon: string;                       // ResourceKey instance hex, '' if not in our library
  season: 'Summer' | 'Fall' | 'Winter' | 'Spring';
  day: number;
  isStock: boolean;                   // true when name came from stock map
  traditions: string[];               // tradition tuning ids (hex); name+icon resolved at render
  timeOff: boolean;                   // "Day off Work/School"
  decorationPreset: string | null;    // decoration-theme preset id (decimal string); null = None
  scaledDates: Record<string, { day: number; season: 'Summer' | 'Fall' | 'Winter' | 'Spring' }>; // per-length placement, for re-scaling
}

export interface ReviewSmallBusiness {
  parsedId: bigint;
  name: string;
  description: string;
  icon: string;                       // ResourceKey instance hex; '' until icons renamed
  ownerParsedSimId: bigint | null;    // save's owning sim_id — resolved to the planner sim at import time
  lotKey: string | null;              // planner lot_key (primary), or null if lot doesn't map
  lotKeys: string[];                  // all planner lot_keys the business spans (multi-lot)
  employeeParsedSimIds: bigint[];     // save sim_ids — resolved to planner sim.id at import time
  customerCriteria: SmallBusinessCustomerCriterion[];
  activities: { id: string; name: string }[];
  feeMode: 'disabled' | 'hourly' | 'one-time' | 'unknown';
  priceModifierPct: number;
  renownRank: number | null;
  alignment: number | null;
  perkPoints: number;
}

export const STOCK_CLUB_FALLBACK_NAME = 'Stock Club';
export const STOCK_HOLIDAY_FALLBACK_NAME = 'Unknown Holiday';

export type Step = 'pick' | 'parsing' | 'review' | 'importing';

export interface GameImportProps {
  onCancel: () => void;
  onComplete: (saveFileId: string, saveName: string) => void;
  /**
   * A file already chosen by the caller, which skips the pick step entirely.
   * First-run does this: it asks for the file on its own hero rather than
   * behind a modal that teaches folder paths and then makes you press a
   * second button to do the thing you already asked for.
   */
  initialFile?: File;
}
