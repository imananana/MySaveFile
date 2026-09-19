// The public showcase payload (GET /api/public/s/:slug, or the owner's
// GET /api/save-files/:id/showcase-payload — same shape) and the
// showcase-authored settings blob. Reality only: no notes, no planned_*.

export interface ShowcasePhoto {
  id: string;
  filename: string;
  caption: string;
  width: number | null;
  height: number | null;
  galleryCreator: string | null;
  createdAt: string;
  targetType: string | null; // 'world' | 'lot' | 'household' | null
  targetKey: string | null;  // world name / lot_key / household id
}

export interface ShowcaseLot {
  lotKey: string;
  worldName: string;
  lotName: string;
  customName: string;
  location: string;
  defaultType: string;
  customType: string;
  size: string;
  status: string;
  description: string;
  householdIds: string[];
  /** From the game save — its description is read-only, sync refreshes it. */
  imported: boolean;
}

export interface ShowcaseHousehold {
  id: string;
  name: string;
  composition: Record<string, unknown>;
  assignedLotKey: string | null;
  description: string;
  thumbnailFilename: string | null;
  provenance: string | null; // 'yours' | 'ea' | 'mod' | null
  creatorName: string | null;
  /** From the game save — its description is read-only, sync refreshes it. */
  imported: boolean;
}

export interface ShowcaseSim {
  id: string;
  householdId: string | null;
  firstName: string;
  lastName: string;
  gender: string;
  lifestage: string;
  species: string;
  petSubtype: string;
  occult: string;
  isGhost: boolean;
}

export interface ShowcaseMod {
  name: string;
  url: string;
  type: 'Mod' | 'CC';
  importance: 'required' | 'recommended';
}

export interface ShowcaseCreator {
  name: string | null;
  socialLinks: Record<string, string>;
  profilePhotoFilename: string | null;
}

export interface ShowcasePayload {
  slug: string | null;
  live: boolean;
  isOwner?: boolean;
  saveFileId?: string;
  name: string;
  description: string;
  saveFileUrl: string | null;
  lastSyncedAt: string | null;
  showcase: ShowcaseSettings;
  disabledWorlds: string[];
  worldBlurbs: Record<string, string>;
  detectedPacks: string[] | null;
  creator: ShowcaseCreator;
  lots: ShowcaseLot[];
  households: ShowcaseHousehold[];
  sims: ShowcaseSim[];
  photos: ShowcasePhoto[];
  mods: ShowcaseMod[];
}

// ── the settings blob (client-owned; server only bounds its size) ──────────
// household ids + photo ids in here are remapped on duplicate/restore by
// server/src/routes/saveFiles.ts remapShowcaseSettings — keep that function
// in step with any new id-bearing field added here.

export type CoverKind = 'photo' | 'poster' | 'postcard';
export type LeadKind = 'photo' | 'collage' | 'hhcollage' | 'map';

export interface ShowcaseWorldSettings {
  /** Creator override; absent = auto (shown iff the world has a built photo). */
  shown?: boolean;
  lead?: LeadKind;
  leadPhotoId?: string | null;
  /** Which section leads on the world page. absent/'auto' = the save-level rule. */
  sectionOrder?: 'auto' | 'lots' | 'hh';
  lotOrder?: string[];      // lot_keys
  hiddenLots?: string[];    // lot_keys hidden by the creator
  featuredLots?: string[];  // lot_keys, ONE list: world-page big cards + front peek row
  lotsShown?: boolean;
  hhShown?: boolean;
}

export interface ShowcaseSettings {
  // (tagline is retired — it only ever rendered on the photo hero and
  // duplicated the description; stored values are simply ignored.)
  cover?: { kind: CoverKind; palette?: string; photoId?: string | null };
  hhBandTop?: boolean;
  hhBandShown?: boolean;
  featuredHouseholds?: string[]; // household ids, front-band order
  worldOrder?: string[];         // world names; default = game release order
  worlds?: Record<string, ShowcaseWorldSettings>;
}
