import { create } from 'zustand';
import { isLotVisible } from '../data/worlds';
import type { PlannedLot, Household, Club, SmallBusiness, Holiday, Dynasty, Mod, Sim, SimRelationship, SimRelType, SeasonLength, SaveFile, CustomVenue, CustomVenuePreset } from '../types';
import { api } from '../lib/api';
import { announceSaveRename, onSaveRenamed, onTabVisible } from '../lib/saveNameSync';
import { toast } from './useToast';
import {
  seedLots,
  rowToLot,
  rowToClub,
  rowToSmallBusiness,
  rowToHoliday,
  rowToDynasty,
  rowToMod,
  rowToHousehold,
  rowToCustomVenue,
  rowToCustomVenuePreset,
} from './mappers';

interface SaveFileStore extends SaveFile {
  saveFileId: string | null;
  loadSaveFile: (saveFileId: string) => Promise<void>;
  updateLot: (lotKey: string, patch: Partial<PlannedLot>) => Promise<void>;
  addHousehold: (household: Omit<Household, 'id'>) => Promise<string>;
  setHouseholdThumbnail: (id: string, jpegBlob: Blob) => Promise<void>;
  deleteHouseholdThumbnail: (id: string) => Promise<void>;
  updateHousehold: (id: string, patch: Partial<Household>) => Promise<void>;
  deleteHousehold: (id: string) => Promise<{ preservedSimIds: string[]; deletedSimIds: string[] }>;
  addSim: (sim: Omit<Sim, 'id'>) => Promise<string>;
  updateSim: (id: string, patch: Partial<Sim>) => Promise<void>;
  deleteSim: (id: string) => Promise<void>;
  // Family relationship edges. The store is the single source of truth; the
  // tree, Sims page and household manager all read from `relationships`.
  loadRelationships: () => Promise<void>;
  addRelationship: (edge: { simAId: string; simBId: string; relType: SimRelType }) => Promise<SimRelationship>;
  deleteRelationship: (id: string) => Promise<void>;
  assignHousehold: (lotKey: string, householdId: string) => Promise<void>;
  unassignHousehold: (lotKey: string, householdId: string) => Promise<void>;
  addClub: (club: Omit<Club, 'id'>) => Promise<string>;
  updateClub: (id: string, patch: Partial<Club>) => Promise<void>;
  deleteClub: (id: string) => Promise<void>;
  assignClub: (lotKey: string, clubId: string) => Promise<void>;
  unassignClub: (lotKey: string, clubId: string) => Promise<void>;
  addSmallBusiness: (sb: Omit<SmallBusiness, 'id'>) => Promise<string>;
  updateSmallBusiness: (id: string, patch: Partial<SmallBusiness>) => Promise<void>;
  deleteSmallBusiness: (id: string) => Promise<void>;
  assignSmallBusiness: (sbId: string, lotKey: string) => Promise<void>;
  unassignSmallBusinessLot: (sbId: string, lotKey: string) => Promise<void>;
  unassignSmallBusiness: (sbId: string) => Promise<void>;
  addHoliday: (holiday: Omit<Holiday, 'id'>) => Promise<string>;
  updateHoliday: (id: string, patch: Partial<Holiday>) => Promise<void>;
  deleteHoliday: (id: string) => Promise<void>;
  addDynasty: (dynasty: Omit<Dynasty, 'id'>) => Promise<string>;
  updateDynasty: (id: string, patch: Partial<Pick<Dynasty, 'name' | 'description' | 'notes' | 'headSimId' | 'members' | 'valueIds' | 'crestBgHash' | 'crestFgHash' | 'allianceSourceIds' | 'rivalrySourceIds'>>) => Promise<void>;
  deleteDynasty: (id: string) => Promise<void>;
  addCustomVenue: (cv: Omit<CustomVenue, 'id' | 'source' | 'isGetaway' | 'hostHouseholdId' | 'sourcePresetId'> & { source?: 'import' | 'planner'; isGetaway?: boolean; hostHouseholdId?: string | null; sourcePresetId?: string | null }) => Promise<string>;
  updateCustomVenue: (id: string, patch: Partial<CustomVenue>) => Promise<void>;
  deleteCustomVenue: (id: string) => Promise<void>;
  addCustomVenuePreset: (preset: Omit<CustomVenuePreset, 'id' | 'source'>) => Promise<string>;
  updateCustomVenuePreset: (id: string, patch: { name?: string; data?: CustomVenuePreset['data'] }) => Promise<void>;
  deleteCustomVenuePreset: (id: string) => Promise<void>;
  addMod: (mod: Omit<Mod, 'id' | 'excluded'>) => Promise<string>;
  updateMod: (id: string, patch: Partial<Mod>) => Promise<void>;
  deleteMod: (id: string) => Promise<void>;
  excludeMod: (id: string) => Promise<void>;
  unexcludeMod: (id: string) => Promise<void>;
  updateSeasonLength: (seasonLength: SeasonLength) => Promise<void>;
  resetSave: () => Promise<void>;
  renameSave: (name: string) => Promise<void>;
  toggleWorldDisabled: (worldName: string) => Promise<void>;
  setNeighborhoodCaption: (worldName: string, location: string, caption: string) => Promise<void>;
  setWorldBlurb: (worldName: string, blurb: string) => Promise<void>;
  description: string;
  setDescription: (description: string) => Promise<void>;
  touchSyncedAt: () => Promise<void>;
  setSaveFileUrl: (url: string | null) => Promise<void>;
}

export const useSaveFile = create<SaveFileStore>()((set, get) => ({
  saveFileId: null,
  name: 'My Save File',
  lots: seedLots(),
  households: {},
  sims: {},
  relationships: {},
  clubs: {},
  smallBusinesses: {},
  holidays: {},
  dynasties: {},
  customVenues: {},
  customVenuePresets: [],
  mods: {},
  seasonLength: 4 as SeasonLength,
  importedSeasonLength: null,
  disabledWorlds: [],
  neighborhoodCaptions: {},
  worldBlurbs: {},
  sourceSaveFilename: null,
  sourceSaveName: null,
  lastSyncedAt: null,
  saveFileUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  description: '',

  loadSaveFile: async (saveFileId) => {
    const data = await api.getSaveFile(saveFileId);
    const lots: Record<string, PlannedLot> = {};
    for (const row of data.lots) {
      const lot = rowToLot(row);
      lots[lot.lotKey] = lot;
    }
    const households: Record<string, Household> = {};
    for (const row of data.households) {
      const h = rowToHousehold(row);
      households[h.id] = h;
    }
    const clubs: Record<string, Club> = {};
    for (const row of data.clubs ?? []) {
      const c = rowToClub(row);
      clubs[c.id] = c;
    }
    const smallBusinesses: Record<string, SmallBusiness> = {};
    for (const row of data.smallBusinesses ?? []) {
      const sb = rowToSmallBusiness(row);
      smallBusinesses[sb.id] = sb;
    }
    const holidays: Record<string, Holiday> = {};
    for (const row of data.holidays ?? []) {
      const h = rowToHoliday(row);
      holidays[h.id] = h;
    }
    const dynasties: Record<string, Dynasty> = {};
    for (const row of (data as { dynasties?: Record<string, unknown>[] }).dynasties ?? []) {
      const d = rowToDynasty(row);
      dynasties[d.id] = d;
    }
    const customVenues: Record<string, CustomVenue> = {};
    for (const row of (data as { customVenues?: CustomVenue[] }).customVenues ?? []) {
      customVenues[row.id] = rowToCustomVenue(row);
    }
    const customVenuePresets = ((data as { customVenuePresets?: CustomVenuePreset[] }).customVenuePresets ?? [])
      .map(rowToCustomVenuePreset);
    const sims: Record<string, Sim> = {};
    for (const row of (data as { sims?: Sim[] }).sims ?? []) {
      sims[row.id] = row;
    }
    const [modRows, relRows] = await Promise.all([
      api.listMods(saveFileId),
      api.listRelationships(saveFileId).catch(() => [] as SimRelationship[]),
    ]);
    const mods: Record<string, Mod> = {};
    for (const row of modRows) {
      mods[row.id] = rowToMod(row as unknown as Record<string, unknown>);
    }
    const relationships: Record<string, SimRelationship> = {};
    for (const r of relRows) relationships[r.id] = r;
    set({
      saveFileId,
      name: data.name,
      lots,
      households,
      sims,
      relationships,
      clubs,
      smallBusinesses,
      holidays,
      dynasties,
      customVenues,
      customVenuePresets,
      mods,
      seasonLength: ((data as Record<string, unknown>).season_length as SeasonLength) ?? 4,
      importedSeasonLength: ((data as Record<string, unknown>).imported_season_length as SeasonLength | null) ?? null,
      disabledWorlds: (data as Record<string, unknown>).disabled_worlds as string[] ?? [],
      neighborhoodCaptions: ((data as Record<string, unknown>).neighborhood_captions as Record<string, string>) ?? {},
      worldBlurbs: ((data as Record<string, unknown>).world_blurbs as Record<string, string>) ?? {},
      sourceSaveFilename: ((data as Record<string, unknown>).source_save_filename as string | null) ?? null,
      sourceSaveName: ((data as Record<string, unknown>).source_save_name as string | null) ?? null,
      lastSyncedAt: ((data as Record<string, unknown>).last_synced_at as string | null) ?? null,
      saveFileUrl: ((data as Record<string, unknown>).save_file_url as string | null) ?? null,
      description: ((data as Record<string, unknown>).description as string) ?? '',
      createdAt: (data as Record<string, unknown>).created_at as string,
      updatedAt: (data as Record<string, unknown>).updated_at as string,
    });
  },

  updateLot: async (lotKey, patch) => {
    const { saveFileId, lots } = get();
    if (!saveFileId) return;
    // Optimistic update
    set((state) => ({
      lots: { ...state.lots, [lotKey]: { ...state.lots[lotKey], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateLot(saveFileId, lotKey, {
        status: patch.status,
        customName: patch.customName,
        customType: patch.customType,
        notes: patch.notes,
        description: patch.description,
        hasSmallBusiness: patch.hasSmallBusiness,
        smallBusinessName: patch.smallBusinessName,
        smallBusinessNotes: patch.smallBusinessNotes,
        smallBusinessIcon: patch.smallBusinessIcon,
      });
    } catch (err) {
      // Revert on failure
      set((state) => ({ lots: { ...state.lots, [lotKey]: lots[lotKey] } }));
      throw err;
    }
  },

  addHousehold: async (household) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const created = await api.createHousehold(saveFileId, {
      name: household.name,
      composition: household.composition,
      notes: household.notes,
      description: household.description,
      sourceId: household.sourceId,
      money: household.money,
      provenance: household.provenance,
      provenanceSub: household.provenanceSub,
      creatorName: household.creatorName,
      visibility: household.visibility,
    });
    set((state) => ({
      households: {
        ...state.households,
        [created.id]: { ...household, id: created.id },
      },
      updatedAt: new Date().toISOString(),
    }));
    return created.id;
  },

  setHouseholdThumbnail: async (id, jpegBlob) => {
    const { saveFileId, households } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const result = await api.uploadHouseholdThumbnail(saveFileId, id, jpegBlob);
    set((state) => ({
      households: {
        ...state.households,
        [id]: { ...households[id], thumbnailFilename: result.thumbnailFilename },
      },
      updatedAt: new Date().toISOString(),
    }));
  },

  deleteHouseholdThumbnail: async (id) => {
    const { saveFileId, households } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    await api.deleteHouseholdThumbnail(saveFileId, id);
    set((state) => ({
      households: {
        ...state.households,
        [id]: { ...households[id], thumbnailFilename: null },
      },
      updatedAt: new Date().toISOString(),
    }));
  },

  updateHousehold: async (id, patch) => {
    const { saveFileId, households } = get();
    if (!saveFileId) return;
    // Optimistic update
    set((state) => ({
      households: { ...state.households, [id]: { ...state.households[id], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateHousehold(saveFileId, id, {
        name: patch.name,
        composition: patch.composition,
        notes: patch.notes,
        description: patch.description,
        money: patch.money,
        plannedMoney: patch.plannedMoney,
        provenance: patch.provenance,
        provenanceSub: patch.provenanceSub,
        creatorName: patch.creatorName,
        visibility: patch.visibility,
      });
    } catch (err) {
      set((state) => ({ households: { ...state.households, [id]: households[id] } }));
      throw err;
    }
  },

  deleteHousehold: async (id) => {
    const { saveFileId } = get();
    if (!saveFileId) return { preservedSimIds: [], deletedSimIds: [] };
    // Optimistically remove the household + lot references. Sims are reconciled
    // AFTER the server decides who's preserved for the family tree (members with
    // relationships become 'tree_only'; the rest are deleted).
    set((state) => {
      const newHouseholds = { ...state.households };
      delete newHouseholds[id];
      const newLots = { ...state.lots };
      for (const lotKey of Object.keys(newLots)) {
        const lot = newLots[lotKey];
        if (lot.householdIds.includes(id)) {
          newLots[lotKey] = { ...lot, householdIds: lot.householdIds.filter((x) => x !== id) };
        }
      }
      return { households: newHouseholds, lots: newLots, updatedAt: new Date().toISOString() };
    });
    const result = await api.deleteHousehold(saveFileId, id);
    set((state) => {
      const newSims = { ...state.sims };
      for (const sid of result.deletedSimIds) delete newSims[sid];
      for (const sid of result.preservedSimIds) {
        if (newSims[sid]) newSims[sid] = { ...newSims[sid], householdId: null, recordStatus: 'tree_only' };
      }
      // safety net: drop any leftover sims still pointing at the gone household
      for (const sid of Object.keys(newSims)) if (newSims[sid].householdId === id) delete newSims[sid];
      // clear planned-move stickers that targeted the deleted household (server
      // does the same; keep the client in sync so no dangling "Planned move → X")
      for (const sid of Object.keys(newSims)) {
        if (newSims[sid].plannedMoveHouseholdId === id) newSims[sid] = { ...newSims[sid], plannedMoveHouseholdId: null };
      }
      // DB cascades edges off deleted sims; preserved (tree_only) sims keep theirs.
      const gone = new Set(result.deletedSimIds);
      const newRels = { ...state.relationships };
      for (const rid of Object.keys(newRels)) {
        if (gone.has(newRels[rid].simAId) || gone.has(newRels[rid].simBId)) delete newRels[rid];
      }
      return { sims: newSims, relationships: newRels, updatedAt: new Date().toISOString() };
    });
    return result;
  },

  addSim: async (sim) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const created = await api.createSim(saveFileId, {
      householdId: sim.householdId,
      firstName: sim.firstName,
      lastName: sim.lastName,
      gender: sim.gender,
      lifestage: sim.lifestage,
      species: sim.species,
      petSubtype: sim.petSubtype,
      petBreed: sim.petBreed,
      occult: sim.occult,
      isGhost: sim.isGhost,
      notes: sim.notes,
      sourceId: sim.sourceId,
      traitIds: sim.traitIds,
      aspirationId: sim.aspirationId,
      recordStatus: sim.recordStatus,
      deathCause: sim.deathCause,
      enrolledDegree: sim.enrolledDegree ?? null,
      career: sim.career ?? null,
      plannedSkillIds: sim.plannedSkillIds ?? [],
      plannedCareerUid: sim.plannedCareerUid ?? null,
      plannedMoveHouseholdId: sim.plannedMoveHouseholdId ?? null,
    });
    set((state) => ({
      sims: { ...state.sims, [created.id]: { ...sim, id: created.id } },
      updatedAt: new Date().toISOString(),
    }));
    return created.id;
  },

  updateSim: async (id, patch) => {
    const { saveFileId, sims } = get();
    if (!saveFileId) return;
    set((state) => ({
      sims: { ...state.sims, [id]: { ...state.sims[id], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateSim(saveFileId, id, {
        householdId: patch.householdId ?? undefined,
        firstName: patch.firstName,
        lastName: patch.lastName,
        gender: patch.gender,
        lifestage: patch.lifestage,
        species: patch.species,
        petSubtype: patch.petSubtype,
        petBreed: patch.petBreed,
        occult: patch.occult,
        isGhost: patch.isGhost,
        notes: patch.notes,
        traitIds: patch.traitIds,
        aspirationId: patch.aspirationId,
        recordStatus: patch.recordStatus,
        deathCause: patch.deathCause,
        enrolledDegree: patch.enrolledDegree,
        career: patch.career,
        plannedSkillIds: patch.plannedSkillIds,
        plannedCareerUid: patch.plannedCareerUid,
        plannedMoveHouseholdId: patch.plannedMoveHouseholdId,
      });
    } catch (err) {
      set((state) => ({ sims: { ...state.sims, [id]: sims[id] } }));
      throw err;
    }
  },

  deleteSim: async (id) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const newSims = { ...state.sims };
      delete newSims[id];
      // DB cascades relationship edges off the sim; mirror that in the store.
      const newRels = { ...state.relationships };
      for (const rid of Object.keys(newRels)) {
        if (newRels[rid].simAId === id || newRels[rid].simBId === id) delete newRels[rid];
      }
      return { sims: newSims, relationships: newRels, updatedAt: new Date().toISOString() };
    });
    await api.deleteSim(saveFileId, id);
  },

  loadRelationships: async () => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    const rows = await api.listRelationships(saveFileId);
    const relationships: Record<string, SimRelationship> = {};
    for (const r of rows) relationships[r.id] = r;
    set({ relationships });
  },

  addRelationship: async (edge) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const created = await api.createManualRelationship(saveFileId, edge);
    set((state) => ({
      relationships: { ...state.relationships, [created.id]: created },
      updatedAt: new Date().toISOString(),
    }));
    return created;
  },

  deleteRelationship: async (id) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const newRels = { ...state.relationships };
      delete newRels[id];
      return { relationships: newRels, updatedAt: new Date().toISOString() };
    });
    await api.deleteManualRelationship(saveFileId, id);
  },

  assignHousehold: async (lotKey, householdId) => {
    const { saveFileId, lots, households } = get();
    if (!saveFileId) return;
    // Optimistic
    set((state) => {
      const newLots = { ...state.lots };
      const newHouseholds = { ...state.households };
      const household = newHouseholds[householdId];
      if (household?.assignedLotKey && household.assignedLotKey !== lotKey) {
        const oldLot = newLots[household.assignedLotKey];
        if (oldLot) {
          newLots[household.assignedLotKey] = {
            ...oldLot,
            householdIds: oldLot.householdIds.filter((id) => id !== householdId),
          };
        }
      }
      const lot = newLots[lotKey];
      if (lot && !lot.householdIds.includes(householdId)) {
        newLots[lotKey] = { ...lot, householdIds: [...lot.householdIds, householdId] };
      }
      newHouseholds[householdId] = { ...newHouseholds[householdId], assignedLotKey: lotKey };
      return { lots: newLots, households: newHouseholds, updatedAt: new Date().toISOString() };
    });
    try {
      await api.assignHousehold(saveFileId, householdId, lotKey);
    } catch (err) {
      // The server refuses a move that would overfill a lot. Until this had a
      // catch, the optimistic state above stuck and the screen showed two
      // households in a one-household house until the next reload — which is
      // how the Households panel's revert-to-save quietly produced that state.
      set({ lots, households });
      toast((err as Error).message);
      throw err;
    }
  },

  unassignHousehold: async (lotKey, householdId) => {
    const { saveFileId, lots, households } = get();
    if (!saveFileId) return;
    // Optimistic
    set((state) => {
      const newLots = { ...state.lots };
      const newHouseholds = { ...state.households };
      const lot = newLots[lotKey];
      if (lot) {
        newLots[lotKey] = { ...lot, householdIds: lot.householdIds.filter((id) => id !== householdId) };
      }
      const household = newHouseholds[householdId];
      if (household) {
        newHouseholds[householdId] = { ...household, assignedLotKey: null };
      }
      return { lots: newLots, households: newHouseholds, updatedAt: new Date().toISOString() };
    });
    try {
      await api.unassignHousehold(saveFileId, householdId);
    } catch (err) {
      // Same rollback as assign: without it a failed move-out left the household
      // gone from the lot on screen but still living there in the database, and
      // said nothing. Resetting a lot fires one of these per household, so a
      // blip halfway through used to half-apply in silence.
      set({ lots, households });
      toast((err as Error).message);
      throw err;
    }
  },

  addClub: async (club) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const created = await api.createClub(saveFileId, {
      name: club.name, icon: club.icon, notes: club.notes,
      description: club.description,
      memberSimIds: club.memberSimIds,
      leaderSimId: club.leaderSimId, criteria: club.criteria, rules: club.rules, inviteOnly: club.inviteOnly,
      hangoutVenueTypeId: club.hangoutVenueTypeId,
      sourceId: club.sourceId,
    });
    set((state) => ({
      clubs: { ...state.clubs, [created.id]: { ...club, id: created.id } },
      updatedAt: new Date().toISOString(),
    }));
    return created.id;
  },

  updateClub: async (id, patch) => {
    const { saveFileId, clubs } = get();
    if (!saveFileId) return;
    set((state) => ({
      clubs: { ...state.clubs, [id]: { ...state.clubs[id], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateClub(saveFileId, id, {
        name: patch.name, icon: patch.icon, notes: patch.notes,
        description: patch.description,
        memberSimIds: patch.memberSimIds,
        leaderSimId: patch.leaderSimId, criteria: patch.criteria, rules: patch.rules, inviteOnly: patch.inviteOnly,
        hangoutVenueTypeId: patch.hangoutVenueTypeId,
      });
    } catch (err) {
      set((state) => ({ clubs: { ...state.clubs, [id]: clubs[id] } }));
      throw err;
    }
  },

  deleteClub: async (id) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const newClubs = { ...state.clubs };
      const club = newClubs[id];
      delete newClubs[id];
      const newLots = { ...state.lots };
      if (club?.assignedLotKey) {
        const lot = newLots[club.assignedLotKey];
        if (lot) {
          newLots[club.assignedLotKey] = { ...lot, clubIds: lot.clubIds.filter((x) => x !== id) };
        }
      }
      return { clubs: newClubs, lots: newLots, updatedAt: new Date().toISOString() };
    });
    await api.deleteClub(saveFileId, id);
  },

  assignClub: async (lotKey, clubId) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const newLots = { ...state.lots };
      const newClubs = { ...state.clubs };
      const club = newClubs[clubId];
      if (club?.assignedLotKey && club.assignedLotKey !== lotKey) {
        const oldLot = newLots[club.assignedLotKey];
        if (oldLot) {
          newLots[club.assignedLotKey] = { ...oldLot, clubIds: oldLot.clubIds.filter((id) => id !== clubId) };
        }
      }
      const lot = newLots[lotKey];
      if (lot && !lot.clubIds.includes(clubId)) {
        newLots[lotKey] = { ...lot, clubIds: [...lot.clubIds, clubId] };
      }
      newClubs[clubId] = { ...newClubs[clubId], assignedLotKey: lotKey };
      return { lots: newLots, clubs: newClubs, updatedAt: new Date().toISOString() };
    });
    await api.assignClub(saveFileId, clubId, lotKey);
  },

  unassignClub: async (lotKey, clubId) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const newLots = { ...state.lots };
      const newClubs = { ...state.clubs };
      const lot = newLots[lotKey];
      if (lot) {
        newLots[lotKey] = { ...lot, clubIds: lot.clubIds.filter((id) => id !== clubId) };
      }
      const club = newClubs[clubId];
      if (club) {
        newClubs[clubId] = { ...club, assignedLotKey: null };
      }
      return { lots: newLots, clubs: newClubs, updatedAt: new Date().toISOString() };
    });
    await api.unassignClub(saveFileId, clubId);
  },

  addSmallBusiness: async (sb) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const created = await api.createSmallBusiness(saveFileId, {
      name: sb.name, icon: sb.icon, notes: sb.notes, description: sb.description,
      employeeSimIds: sb.employeeSimIds, customerCriteria: sb.customerCriteria, activities: sb.activities,
      feeMode: sb.feeMode, priceModifierPct: sb.priceModifierPct,
      renownRank: sb.renownRank, alignment: sb.alignment, perkPoints: sb.perkPoints,
      sourceId: sb.sourceId,
    });
    set((state) => ({
      smallBusinesses: { ...state.smallBusinesses, [created.id]: { ...sb, id: created.id } },
      updatedAt: new Date().toISOString(),
    }));
    return created.id;
  },

  updateSmallBusiness: async (id, patch) => {
    const { saveFileId, smallBusinesses } = get();
    if (!saveFileId) return;
    set((state) => ({
      smallBusinesses: { ...state.smallBusinesses, [id]: { ...state.smallBusinesses[id], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateSmallBusiness(saveFileId, id, {
        name: patch.name,
        icon: patch.icon,
        notes: patch.notes,
        description: patch.description,
        ownerSimId: patch.ownerSimId,
        employeeSimIds: patch.employeeSimIds,
        customerCriteria: patch.customerCriteria,
        activities: patch.activities,
        feeMode: patch.feeMode,
        priceModifierPct: patch.priceModifierPct,
        renownRank: patch.renownRank,
        alignment: patch.alignment,
        perkPoints: patch.perkPoints,
      });
    } catch (err) {
      set((state) => ({ smallBusinesses: { ...state.smallBusinesses, [id]: smallBusinesses[id] } }));
      throw err;
    }
  },

  deleteSmallBusiness: async (id) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const newSBs = { ...state.smallBusinesses };
      delete newSBs[id];
      return { smallBusinesses: newSBs, updatedAt: new Date().toISOString() };
    });
    await api.deleteSmallBusiness(saveFileId, id);
  },

  assignSmallBusiness: async (sbId, lotKey) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const cur = state.smallBusinesses[sbId];
      const keys = cur.assignedLotKeys.includes(lotKey) ? cur.assignedLotKeys : [...cur.assignedLotKeys, lotKey];
      return {
        smallBusinesses: { ...state.smallBusinesses, [sbId]: { ...cur, assignedLotKeys: keys } },
        updatedAt: new Date().toISOString(),
      };
    });
    await api.assignSmallBusiness(saveFileId, sbId, lotKey);
  },

  // Remove a single lot from a multi-lot business.
  unassignSmallBusinessLot: async (sbId, lotKey) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const cur = state.smallBusinesses[sbId];
      return {
        smallBusinesses: { ...state.smallBusinesses, [sbId]: { ...cur, assignedLotKeys: cur.assignedLotKeys.filter((k) => k !== lotKey) } },
        updatedAt: new Date().toISOString(),
      };
    });
    await api.unassignSmallBusinessLot(saveFileId, sbId, lotKey);
  },

  // Clear all lots (owner is decoupled, so it stays).
  unassignSmallBusiness: async (sbId) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => ({
      smallBusinesses: {
        ...state.smallBusinesses,
        [sbId]: { ...state.smallBusinesses[sbId], assignedLotKeys: [] },
      },
      updatedAt: new Date().toISOString(),
    }));
    await api.unassignSmallBusiness(saveFileId, sbId);
  },

  addHoliday: async (holiday) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const created = await api.createHoliday(saveFileId, {
      name: holiday.name,
      icon: holiday.icon,
      season: holiday.season,
      day: holiday.day,
      notes: holiday.notes,
      traditions: holiday.traditions,
      unassigned: holiday.unassigned,
      timeOff: holiday.timeOff,
      decorationPreset: holiday.decorationPreset,
      sourceId: holiday.sourceId,
      scaledDates: holiday.scaledDates,
    });
    set((state) => ({
      holidays: { ...state.holidays, [created.id]: { ...holiday, id: created.id } },
      updatedAt: new Date().toISOString(),
    }));
    return created.id;
  },

  updateHoliday: async (id, patch) => {
    const { saveFileId, holidays } = get();
    if (!saveFileId) return;
    set((state) => ({
      holidays: { ...state.holidays, [id]: { ...state.holidays[id], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateHoliday(saveFileId, id, {
        name: patch.name,
        icon: patch.icon,
        season: patch.season,
        day: patch.day,
        notes: patch.notes,
        traditions: patch.traditions,
        unassigned: patch.unassigned,
        timeOff: patch.timeOff,
        decorationPreset: patch.decorationPreset,
        scaledDates: patch.scaledDates,
      });
    } catch (err) {
      set((state) => ({ holidays: { ...state.holidays, [id]: holidays[id] } }));
      throw err;
    }
  },

  // Dynasties are read-only display data; only notes (+ public description) edit.
  addDynasty: async (dynasty) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const created = await api.createDynasty(saveFileId, {
      name: dynasty.name, description: dynasty.description, notes: dynasty.notes,
      headSimId: dynasty.headSimId, members: dynasty.members, valueIds: dynasty.valueIds,
      crestBgHash: dynasty.crestBgHash, crestFgHash: dynasty.crestFgHash,
      prestige: dynasty.prestige, unity: dynasty.unity, perkIds: dynasty.perkIds,
      allianceSourceIds: dynasty.allianceSourceIds, rivalrySourceIds: dynasty.rivalrySourceIds,
      sourceId: dynasty.sourceId,
    });
    set((state) => ({
      dynasties: { ...state.dynasties, [created.id]: { ...dynasty, id: created.id } },
      updatedAt: new Date().toISOString(),
    }));
    return created.id;
  },

  updateDynasty: async (id, patch) => {
    const { saveFileId, dynasties } = get();
    if (!saveFileId) return;
    set((state) => ({
      dynasties: { ...state.dynasties, [id]: { ...state.dynasties[id], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateDynasty(saveFileId, id, patch);
    } catch (err) {
      set((state) => ({ dynasties: { ...state.dynasties, [id]: dynasties[id] } }));
      throw err;
    }
  },

  deleteDynasty: async (id) => {
    const { saveFileId, dynasties } = get();
    if (!saveFileId) return;
    const prev = dynasties[id];
    set((state) => {
      const next = { ...state.dynasties };
      delete next[id];
      return { dynasties: next, updatedAt: new Date().toISOString() };
    });
    try {
      await api.deleteDynasty(saveFileId, id);
    } catch (err) {
      if (prev) set((state) => ({ dynasties: { ...state.dynasties, [id]: prev } }));
      throw err;
    }
  },

  deleteHoliday: async (id) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const next = { ...state.holidays };
      delete next[id];
      return { holidays: next, updatedAt: new Date().toISOString() };
    });
    await api.deleteHoliday(saveFileId, id);
  },

  addCustomVenue: async (cv) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    // Venues added through the planner (the "Add Venue" button) are always
    // 'planner'-sourced so re-sync never auto-removes them.
    const source = cv.source ?? 'planner';
    const created = await api.createCustomVenue(saveFileId, {
      lotKey: cv.lotKey,
      name: cv.name,
      venueSchedule: cv.venueSchedule,
      notes: cv.notes,
      roles: cv.roles,
      slots: cv.slots,
      source,
      isGetaway: cv.isGetaway,
      hostHouseholdId: cv.hostHouseholdId,
      sourcePresetId: cv.sourcePresetId,
    });
    set((state) => ({
      customVenues: {
        ...state.customVenues,
        [created.id]: { id: created.id, ...cv, source, isGetaway: cv.isGetaway ?? false, hostHouseholdId: cv.hostHouseholdId ?? null, sourcePresetId: cv.sourcePresetId ?? null },
      },
      updatedAt: new Date().toISOString(),
    }));
    return created.id;
  },

  updateCustomVenue: async (id, patch) => {
    const { saveFileId, customVenues } = get();
    if (!saveFileId) return;
    set((state) => ({
      customVenues: { ...state.customVenues, [id]: { ...state.customVenues[id], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateCustomVenue(saveFileId, id, {
        name: patch.name,
        venueSchedule: patch.venueSchedule,
        notes: patch.notes,
        roles: patch.roles,
        slots: patch.slots,
        lotKey: patch.lotKey,
        isGetaway: patch.isGetaway,
        hostHouseholdId: patch.hostHouseholdId,
        sourcePresetId: patch.sourcePresetId,
      });
    } catch (err) {
      set((state) => ({ customVenues: { ...state.customVenues, [id]: customVenues[id] } }));
      throw err;
    }
  },

  deleteCustomVenue: async (id) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set((state) => {
      const next = { ...state.customVenues };
      delete next[id];
      return { customVenues: next, updatedAt: new Date().toISOString() };
    });
    await api.deleteCustomVenue(saveFileId, id);
  },

  addCustomVenuePreset: async (preset) => {
    const { saveFileId } = get();
    if (!saveFileId) throw new Error('No save file loaded');
    const created = await api.createCustomVenuePreset(saveFileId, { kind: preset.kind, name: preset.name, data: preset.data });
    const full: CustomVenuePreset = { id: created.id, kind: preset.kind, name: preset.name, data: preset.data, source: 'planner' };
    set((state) => ({ customVenuePresets: [...state.customVenuePresets, full], updatedAt: new Date().toISOString() }));
    return created.id;
  },

  updateCustomVenuePreset: async (id, patch) => {
    const { saveFileId, customVenuePresets } = get();
    if (!saveFileId) return;
    set((state) => ({ customVenuePresets: state.customVenuePresets.map((p) => (p.id === id ? { ...p, ...patch } : p)), updatedAt: new Date().toISOString() }));
    try { await api.updateCustomVenuePreset(saveFileId, id, { name: patch.name, data: patch.data }); }
    catch (err) { set(() => ({ customVenuePresets })); throw err; }
  },

  deleteCustomVenuePreset: async (id) => {
    const { saveFileId, customVenuePresets } = get();
    if (!saveFileId) return;
    set((state) => ({ customVenuePresets: state.customVenuePresets.filter((p) => p.id !== id), updatedAt: new Date().toISOString() }));
    try { await api.deleteCustomVenuePreset(saveFileId, id); }
    catch (err) { set(() => ({ customVenuePresets })); throw err; }
  },

  addMod: async (mod) => {
    const created = await api.createMod({
      name: mod.name,
      url: mod.url,
      type: mod.type,
      importance: mod.importance,
      notes: mod.notes,
    });
    set((state) => ({
      mods: { ...state.mods, [created.id]: { ...mod, id: created.id, excluded: false } },
      updatedAt: new Date().toISOString(),
    }));
    return created.id;
  },

  updateMod: async (id, patch) => {
    const { mods } = get();
    set((state) => ({
      mods: { ...state.mods, [id]: { ...state.mods[id], ...patch } },
      updatedAt: new Date().toISOString(),
    }));
    try {
      await api.updateMod(id, {
        name: patch.name,
        url: patch.url,
        type: patch.type,
        importance: patch.importance,
        notes: patch.notes,
      });
    } catch (err) {
      set((state) => ({ mods: { ...state.mods, [id]: mods[id] } }));
      throw err;
    }
  },

  deleteMod: async (id) => {
    set((state) => {
      const next = { ...state.mods };
      delete next[id];
      return { mods: next, updatedAt: new Date().toISOString() };
    });
    await api.deleteMod(id);
  },

  excludeMod: async (id) => {
    const { saveFileId, mods } = get();
    if (!saveFileId) return;
    set((state) => ({
      mods: { ...state.mods, [id]: { ...state.mods[id], excluded: true } },
    }));
    try {
      await api.excludeMod(id, saveFileId);
    } catch (err) {
      set((state) => ({ mods: { ...state.mods, [id]: mods[id] } }));
      throw err;
    }
  },

  unexcludeMod: async (id) => {
    const { saveFileId, mods } = get();
    if (!saveFileId) return;
    set((state) => ({
      mods: { ...state.mods, [id]: { ...state.mods[id], excluded: false } },
    }));
    try {
      await api.unexcludeMod(id, saveFileId);
    } catch (err) {
      set((state) => ({ mods: { ...state.mods, [id]: mods[id] } }));
      throw err;
    }
  },

  updateSeasonLength: async (seasonLength) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set({ seasonLength, updatedAt: new Date().toISOString() });
    await api.setSeasonLength(saveFileId, seasonLength);
  },

  resetSave: async () => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    await api.resetSaveFile(saveFileId);
    await get().loadSaveFile(saveFileId);
  },

  renameSave: async (name) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set({ name, updatedAt: new Date().toISOString() });
    await api.renameSaveFile(saveFileId, name);
    // The name is on screen elsewhere too (the showcase, other tabs).
    announceSaveRename(saveFileId, name);
  },

  toggleWorldDisabled: async (worldName) => {
    const { saveFileId, disabledWorlds } = get();
    if (!saveFileId) return;
    const next = disabledWorlds.includes(worldName)
      ? disabledWorlds.filter((w) => w !== worldName)
      : [...disabledWorlds, worldName];
    set({ disabledWorlds: next, updatedAt: new Date().toISOString() });
    await api.setDisabledWorlds(saveFileId, next);
  },

  setNeighborhoodCaption: async (worldName, location, caption) => {
    const { saveFileId, neighborhoodCaptions } = get();
    if (!saveFileId) return;
    const key = `${worldName}::${location}`;
    const updated = { ...neighborhoodCaptions, [key]: caption };
    set({ neighborhoodCaptions: updated });
    await api.setNeighborhoodCaptions(saveFileId, updated);
  },

  setWorldBlurb: async (worldName, blurb) => {
    const { saveFileId, worldBlurbs } = get();
    if (!saveFileId) return;
    const updated = { ...worldBlurbs, [worldName]: blurb };
    set({ worldBlurbs: updated });
    await api.setWorldBlurbs(saveFileId, updated);
  },

  setDescription: async (description: string) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    set({ description });
    await api.setSaveFileDescription(saveFileId, description);
  },

  touchSyncedAt: async () => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    const now = new Date().toISOString();
    set({ lastSyncedAt: now });
    await api.touchSaveFileSyncedAt(saveFileId);
  },

  setSaveFileUrl: async (url) => {
    const { saveFileId } = get();
    if (!saveFileId) return;
    const trimmed = url?.trim() || null;
    set({ saveFileUrl: trimmed });
    await api.setSaveFileUrl(saveFileId, trimmed);
  },
}));

// ── the loaded save's name follows a rename made anywhere ──────────────────
// The showcase can rename the save (its cover title IS the name), and so can
// another tab. Both reach the planner's copy of the name here, so the top
// bar, dashboard and Save settings never sit on a stale one.

onSaveRenamed(({ saveFileId, name }) => {
  if (useSaveFile.getState().saveFileId === saveFileId) useSaveFile.setState({ name });
});

// The catch-up path, for a rename this tab never heard about.
onTabVisible(() => {
  const { saveFileId, name } = useSaveFile.getState();
  if (!saveFileId) return;
  api.listSaveFiles()
    .then((list) => {
      const mine = list.find((s) => s.id === saveFileId);
      if (mine && mine.name !== name) useSaveFile.setState({ name: mine.name });
    })
    .catch(() => {});
});

// Selectors (unchanged)
export function getLotsByWorld(lots: Record<string, PlannedLot>, worldName: string): PlannedLot[] {
  return Object.values(lots).filter((l) => l.worldName === worldName && isLotVisible(l.defaultType));
}

export function getWorldStats(lots: Record<string, PlannedLot>, _households: Record<string, Household>, worldName: string) {
  const worldLots = getLotsByWorld(lots, worldName);
  return {
    total: worldLots.length,
    planned: worldLots.filter((l) => l.status === 'planned').length,
    built: worldLots.filter((l) => l.status === 'built').length,
    households: worldLots.reduce((sum, l) => sum + l.householdIds.length, 0),
  };
}

export function getGlobalStats(lots: Record<string, PlannedLot>, households: Record<string, Household>) {
  const allLots = Object.values(lots).filter((l) => isLotVisible(l.defaultType));
  const allHouseholds = Object.values(households);
  return {
    totalLots: allLots.length,
    plannedLots: allLots.filter((l) => l.status === 'planned').length,
    builtLots: allLots.filter((l) => l.status === 'built').length,
    totalHouseholds: allHouseholds.length,
    assignedHouseholds: allHouseholds.filter((h) => h.assignedLotKey !== null).length,
  };
}

export function getUnassignedHouseholds(households: Record<string, Household>): Household[] {
  return Object.values(households).filter((h) => h.assignedLotKey === null);
}
