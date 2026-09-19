import { describe, it, expect } from 'vitest';
import { buildKinIndex, groupKin } from './kin';
import type { SimRelationship } from '../types';

const e = (simAId: string, simBId: string, relType: SimRelationship['relType']): SimRelationship =>
  ({ id: `${simAId}-${simBId}-${relType}`, simAId, simBId, relType, source: 'import' });

describe('buildKinIndex', () => {
  it('reads a partner bond in either direction', () => {
    const k = buildKinIndex([e('a', 'b', 'spouse')]);
    expect(k.between('a', 'b')).toBe('partner');
    expect(k.between('b', 'a')).toBe('partner');
  });

  it('separates an ex from a current partner', () => {
    const k = buildKinIndex([e('a', 'b', 'ex_spouse')]);
    expect(k.between('a', 'b')).toBe('ex-partner');
  });

  it('finds siblings through a parent who lives elsewhere', () => {
    // The Caliente case: two sisters in one house, their mother in another. A
    // test for edges BETWEEN housemates reports them as strangers.
    const k = buildKinIndex([e('mum', 'dina', 'parent'), e('mum', 'nina', 'parent')]);
    expect(k.between('dina', 'nina')).toBe('sibling');
  });

  it('reads a parent edge as parent, not sibling', () => {
    const k = buildKinIndex([e('p', 'c', 'parent')]);
    expect(k.between('p', 'c')).toBe('parent');
  });

  it('reaches a grandparent and a cousin, and stops there', () => {
    const k = buildKinIndex([
      e('gran', 'mum', 'parent'), e('gran', 'uncle', 'parent'),
      e('mum', 'me', 'parent'), e('uncle', 'cousin', 'parent'),
    ]);
    expect(k.between('gran', 'me')).toBe('related');
    expect(k.between('me', 'cousin')).toBe('related');
    expect(k.between('me', 'uncle')).toBe('related');
  });

  it('does not connect two strangers', () => {
    const k = buildKinIndex([e('a', 'b', 'spouse'), e('c', 'd', 'spouse')]);
    expect(k.between('a', 'c')).toBeNull();
  });

  it('knows the difference between unrelated and unheard-of', () => {
    const k = buildKinIndex([e('a', 'b', 'spouse')]);
    expect(k.knows('a')).toBe(true);
    expect(k.knows('stranger')).toBe(false);
  });
});

describe('groupKin', () => {
  it('returns the strongest link in the group', () => {
    const k = buildKinIndex([e('gran', 'a', 'parent'), e('gran', 'b', 'parent'), e('b', 'c', 'spouse')]);
    expect(groupKin(['a', 'b', 'c'], k).link).toBe('partner');
  });

  it('reports no link but known when the graph has heard of them', () => {
    const k = buildKinIndex([e('a', 'x', 'spouse'), e('b', 'y', 'spouse')]);
    expect(groupKin(['a', 'b'], k)).toEqual({ link: null, known: true });
  });

  it('reports unknown when the graph has never heard of them', () => {
    // A household built in the planner: nothing authors edges, so its silence
    // is not evidence of anything.
    const k = buildKinIndex([e('x', 'y', 'spouse')]);
    expect(groupKin(['p1', 'p2'], k)).toEqual({ link: null, known: false });
  });
});
