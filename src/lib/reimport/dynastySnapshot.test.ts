/**
 * Guards the dynasty snapshot canonicalization that keeps re-sync honest: the
 * game reshuffles a dynasty's member / ideal / skill / perk order between saves,
 * so the snapshot must sort those lists. Otherwise a pure reorder would read as a
 * phantom change (or worse, a phantom conflict) on re-sync.
 */
import { describe, it, expect } from 'vitest';
import { parsedDynastyToSnapshot, dynastyToCurrentSnapshot } from './snapshotBuilders';
import { diffEntities } from './diff';
import type { ParsedDynasty } from '../parser/types';
import type { Dynasty } from '../../types';
import type { DynastySnapshot } from '../parser/snapshot';

const parsed = (over: Partial<ParsedDynasty> = {}): ParsedDynasty => ({
  id: 0x1234n,
  name: 'Tester Dynasty',
  description: 'desc',
  headSimId: 0xaa11n,
  members: [
    { simId: 0xaa11n, order: 1, role: 'Head' },
    { simId: 0xbb22n, order: 2, role: 'Heir' },
    { simId: 0xcc33n, order: 3, role: 'Member' },
  ],
  valueIds: ['0x72883', '0x723c7', '0x72418'],
  crestBgHash: '8153a23cf96dc4ca',
  crestFgHash: 'c3e2a61f6a869e6d',
  prestige: 31166,
  unity: 65,
  perkIds: [40961, 12289, 64],
  allianceDynastyIds: [],
  rivalryDynastyIds: [],
  ...over,
});

describe('dynasty snapshot canonicalization', () => {
  it('sorts members, valueIds and perkIds deterministically', () => {
    const s = parsedDynastyToSnapshot(parsed());
    expect(s.valueIds).toEqual([...s.valueIds].sort());
    expect(s.perkIds).toEqual([...s.perkIds].sort((a, b) => a - b));
    expect(s.members.map((m) => m.sourceId)).toEqual([...s.members.map((m) => m.sourceId)].sort());
  });

  it('produces an identical snapshot regardless of source list order', () => {
    const a = parsedDynastyToSnapshot(parsed());
    const b = parsedDynastyToSnapshot(parsed({
      members: [
        { simId: 0xcc33n, order: 3, role: 'Member' },
        { simId: 0xaa11n, order: 1, role: 'Head' },
        { simId: 0xbb22n, order: 2, role: 'Heir' },
      ],
      valueIds: ['0x72418', '0x72883', '0x723c7'],
      perkIds: [64, 12289, 40961],
    }));
    expect(b).toEqual(a);
  });

  it('a pure reorder yields no diff (no phantom update)', () => {
    // last/current = original order; next (new save) = reordered same data.
    const dyn: Dynasty = {
      id: 'planner1', name: 'Tester Dynasty', description: 'desc', notes: 'my notes',
      headSimId: 'p-head', members: [{ simId: 'p-head', order: 1, role: 'Head' }, { simId: 'p-b', order: 2, role: 'Heir' }],
      valueIds: ['0x72883', '0x723c7'], crestBgHash: '8153a23cf96dc4ca', crestFgHash: 'c3e2a61f6a869e6d',
      prestige: 31166, unity: 65, perkIds: [40961, 12289], allianceSourceIds: [], rivalrySourceIds: [], sourceId: '1234',
    };
    const current = dynastyToCurrentSnapshot(dyn, 'aa11', [{ sourceId: 'aa11', order: 1, role: 'Head' }, { sourceId: 'bb22', order: 2, role: 'Heir' }]);
    const last: DynastySnapshot = current;
    // New save: same data, lists in a different order.
    const next = parsedDynastyToSnapshot(parsed({
      members: [{ simId: 0xbb22n, order: 2, role: 'Heir' }, { simId: 0xaa11n, order: 1, role: 'Head' }],
      valueIds: ['0x723c7', '0x72883'],
      perkIds: [12289, 40961],
      headSimId: 0xaa11n,
    }));

    const diff = diffEntities<DynastySnapshot>(
      new Map([['1234', next]]),
      new Map([['1234', { plannerId: 'planner1', current, last }]]),
    );
    expect(diff.updates).toHaveLength(0);
    expect(diff.adds).toHaveLength(0);
    expect(diff.removes).toHaveLength(0);
  });
});
