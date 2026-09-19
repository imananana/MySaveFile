import { describe, it, expect } from 'vitest';
import { clubRefresh, dynastyRefresh, smallBusinessRefresh, holidayRefreshPatch } from './silentRefresh';
import type { Club, Dynasty, Holiday, SmallBusiness } from '../../types';
import type { ParsedClub, ParsedDynasty, ParsedHoliday, ParsedSmallBusiness } from '../saveParser';

// Minimal stand-ins — each test only touches the fields the comparison reads.
const club = (over: Partial<Club> = {}) => ({
  id: 'c1', name: 'Partihaus', icon: '', assignedLotKey: null, notes: '', description: '',
  memberSimIds: [], leaderSimId: null, criteria: [], rules: [], inviteOnly: false,
  hangoutVenueTypeId: null, sourceId: 'abc', ...over,
}) as Club;

const parsedClub = (over: Partial<ParsedClub> = {}) => ({
  id: 0xabcn, name: 'Partihaus', description: '', iconInstance: null, clubSeed: null,
  leaderSimId: null, memberSimIds: [], inviteOnly: false, hangoutSetting: 'none',
  hangoutZoneId: null, hangoutVenueTypeId: null, criteria: [], rules: [], ...over,
}) as ParsedClub;

const RULE = { encouraged: true, activityId: '0x1de6f', activity: 'Dance', target: { kind: 'anyone' as const } };

describe('clubRefresh — the fields the diff never sees', () => {
  it('reports no change when rules, requirements, invite and leader all match', () => {
    expect(clubRefresh(club(), parsedClub(), new Map()).changed).toBe(false);
  });

  it('catches an activity added in game, and names the field', () => {
    const out = clubRefresh(club(), parsedClub({ rules: [RULE] }), new Map());
    expect(out).toMatchObject({ changed: true, fields: ['activities'] });
  });

  it('names every field that moved, for the apply-time log', () => {
    const out = clubRefresh(
      club(), parsedClub({ rules: [RULE], inviteOnly: true, hangoutVenueTypeId: '0x41e5' }), new Map(),
    );
    expect(out.fields).toEqual(['activities', 'inviteOnly', 'generalVenue']);
  });

  it('catches the club being switched to Invite Only', () => {
    expect(clubRefresh(club(), parsedClub({ inviteOnly: true }), new Map()).changed).toBe(true);
  });

  it('catches a new leader, and resolves them to a planner sim', () => {
    const out = clubRefresh(club(), parsedClub({ leaderSimId: 0x5n }), new Map([['5', 'sim-planner-id']]));
    expect(out).toEqual({ changed: true, fields: ['leader'], leaderSimId: 'sim-planner-id' });
  });

  it('reports no change when the leader is already that sim', () => {
    const out = clubRefresh(club({ leaderSimId: 'sim-planner-id' }), parsedClub({ leaderSimId: 0x5n }), new Map([['5', 'sim-planner-id']]));
    expect(out.changed).toBe(false);
  });

  it('catches a general-venue hangout being changed', () => {
    expect(clubRefresh(club(), parsedClub({ hangoutVenueTypeId: '0x21a74' }), new Map()).changed).toBe(true);
  });
});

describe('dynastyRefresh', () => {
  const dynasty = (over: Partial<Dynasty> = {}) => ({
    id: 'd1', name: 'Goth', description: '', notes: '', headSimId: null, members: [],
    valueIds: [], crestBgHash: null, crestFgHash: null, prestige: null, unity: null,
    perkIds: [], allianceSourceIds: [], rivalrySourceIds: [], sourceId: 'ff', ...over,
  }) as Dynasty;
  const parsed = (over: Partial<ParsedDynasty> = {}) => ({
    id: 0xffn, name: 'Goth', description: '', headSimId: null, members: [], valueIds: [],
    crestBgHash: null, crestFgHash: null, prestige: null, unity: null, perkIds: [],
    allianceDynastyIds: [], rivalryDynastyIds: [], ...over,
  }) as ParsedDynasty;

  it('adopts a rename the game made', () => {
    const r = dynastyRefresh(dynasty({ name: 'Goth' }), parsed({ name: 'Goth-Vatore' }));
    expect(r.name).toBe('Goth-Vatore');
    expect(r.fields).toContain('name');
    expect(r.changed).toBe(true);
  });

  it('heals a rename that was detected but never written', () => {
    // The old bug: the diff spotted the rename, the apply dropped it, and the
    // baseline adopted it anyway — so the diff went quiet while the row kept the
    // old name. This compares the ROW to the save, so the mismatch is still
    // visible on the next sync however stale the baseline is.
    const r = dynastyRefresh(dynasty({ name: 'Goth' }), parsed({ name: 'Goth-Vatore' }));
    expect(r.name).toBe('Goth-Vatore');
  });

  it('says nothing when the names already agree', () => {
    expect(dynastyRefresh(dynasty(), parsed()).name).toBeNull();
  });

  it('never erases a name the save could not supply', () => {
    const r = dynastyRefresh(dynasty({ name: 'Goth' }), parsed({ name: '' }));
    expect(r.name).toBeNull();
    expect(r.changed).toBe(false);
  });

  it('ignores a reordering of the same alliances', () => {
    const out = dynastyRefresh(dynasty({ allianceSourceIds: ['b', 'a'] }), parsed({ allianceDynastyIds: [0xan, 0xbn] }));
    expect(out.changed).toBe(false);
  });

  it('catches a new rivalry', () => {
    expect(dynastyRefresh(dynasty(), parsed({ rivalryDynastyIds: [0xan] })).changed).toBe(true);
  });
});

describe('smallBusinessRefresh', () => {
  const sb = (over: Partial<SmallBusiness> = {}) => ({
    id: 'b1', name: 'Koffieboon', icon: '', notes: '', description: '', assignedLotKeys: [],
    ownerSimId: null, employeeSimIds: [], customerCriteria: [], activities: [],
    feeMode: 'disabled', priceModifierPct: 0, renownRank: null, alignment: null,
    perkPoints: 0, sourceId: 'e1', ...over,
  }) as SmallBusiness;
  const parsed = (over: Partial<ParsedSmallBusiness> = {}) => ({
    id: 0xe1n, name: 'Koffieboon', description: '', iconInstance: null, ownerSimId: null,
    lotIds: [], employeeSimIds: [], customerCriteria: [], activities: [], feeMode: 'disabled',
    priceModifierPct: 0, renownRank: null, alignment: null, perkPoints: 0, ...over,
  }) as ParsedSmallBusiness;

  it('reports no change when details and lots both match', () => {
    const out = smallBusinessRefresh(sb(), parsed(), new Map(), new Map(), []);
    expect(out.changed).toBe(false);
  });

  it('catches a price change', () => {
    const out = smallBusinessRefresh(sb(), parsed({ priceModifierPct: 50 }), new Map(), new Map(), []);
    expect(out).toMatchObject({ changed: true, detailsChanged: true, lotsChanged: false, fields: ['priceModifier'] });
  });

  it('catches the game relocating the business, with no detail change at all', () => {
    // Was on lotA at the last sync; the save now reports lotB.
    const out = smallBusinessRefresh(
      sb({ assignedLotKeys: ['lotA'] }), parsed({ lotIds: [2n] }),
      new Map(), new Map([[2n, 'lotB']]), ['lotA'],
    );
    expect(out).toMatchObject({ changed: true, detailsChanged: false, lotsChanged: true, fields: ['lots'] });
    expect(out.lotsAdded).toEqual(['lotB']);
    expect(out.lotsRemoved).toEqual(['lotA']);
    // The set the apply WRITES, in the same request as the baseline. Sent as a
    // whole rather than as an add + a remove, so a half-landed sync can't leave
    // the business on lotA with a baseline that says the save already reported
    // lotB — nothing would ever look at it again.
    expect(out.lotsResult).toEqual(['lotB']);
  });

  it('the written lot set keeps a lot you planned alongside one the game added', () => {
    // Your lot was never game truth, so reconciliation keeps it; the game's new
    // lot joins it. Both must be in the set that gets written, or writing the
    // set wholesale would silently drop your assignment.
    const out = smallBusinessRefresh(
      sb({ assignedLotKeys: ['yourLot'] }), parsed({ lotIds: [2n] }),
      new Map(), new Map([[2n, 'lotB']]), [],
    );
    expect(out.lotsResult).toEqual(['yourLot', 'lotB']);
  });

  it('leaves a lot YOU planned alone — the game never had it', () => {
    const out = smallBusinessRefresh(
      sb({ assignedLotKeys: ['yourLot'] }), parsed(), new Map(), new Map(), [],
    );
    expect(out.changed).toBe(false);
  });
});

describe('holidayRefreshPatch', () => {
  const holiday = (over: Partial<Holiday> = {}) => ({
    id: 'h1', name: 'Harvestfest', icon: '', season: 'Fall' as const, day: 5, notes: '',
    traditions: [], unassigned: false, timeOff: false, decorationPreset: null,
    sourceId: 'aa', scaledDates: null, ...over,
  }) as Holiday;
  const parsed = (over: Partial<ParsedHoliday> = {}) => ({
    holidayType: 0xaan, name: null, iconInstance: null, season: 'Fall' as const, day: 5,
    traditions: [], timeOff: false, decorationPreset: null, scaledDates: null, ...over,
  }) as unknown as ParsedHoliday;

  it('is empty when nothing moved', () => {
    expect(holidayRefreshPatch(holiday(), parsed(), 4)).toEqual({});
  });

  it('picks up a new tradition', () => {
    expect(holidayRefreshPatch(holiday(), parsed({ traditions: [0x1n] }), 4)).toEqual({ traditions: ['1'] });
  });

  it('places the holiday at the day for the length the plan ends at', () => {
    const scaled = { '1': { day: 2, season: 'Fall' as const }, '4': { day: 9, season: 'Fall' as const } };
    const patch = holidayRefreshPatch(holiday({ scaledDates: scaled }), parsed({ scaledDates: scaled }), 4);
    expect(patch).toMatchObject({ day: 9 });
  });

  it('puts a holiday from the save back on the calendar', () => {
    // A holiday from your save has no day editor, so one left off the calendar
    // by an older version can only be rescued here.
    expect(holidayRefreshPatch(holiday({ unassigned: true }), parsed(), 4)).toEqual({ unassigned: false });
  });
});
