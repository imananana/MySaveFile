/**
 * Tests for computeHouseholdRelevance — the foreground/background split. Focus:
 * Yours = foreground, ONE-hop family promotion of connected households, no
 * promotion at two hops (the deceased-ancestor-web guard), exes excluded,
 * 'yours' beats 'kin'.
 */
import { describe, it, expect } from 'vitest';
import { computeHouseholdRelevance, isForegroundEffective } from './householdRelevance';
import type { Household, Sim, SimRelationship, SimRelType, HouseholdVisibility } from '../types';

const hh = (id: string, provenance: Household['provenance']): Household =>
  ({ id, provenance } as Household);
const sim = (id: string, householdId: string | null): Sim =>
  ({ id, householdId } as Sim);
const edge = (a: string, b: string, relType: SimRelType): SimRelationship =>
  ({ id: `${a}-${b}-${relType}`, simAId: a, simBId: b, relType, source: 'manual' });

const rec = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map((i) => [i.id, i]));

describe('computeHouseholdRelevance', () => {
  it('marks Yours households foreground (reason "yours")', () => {
    const households = rec([hh('h1', 'yours'), hh('h2', 'ea')]);
    const sims = rec([sim('s1', 'h1'), sim('s2', 'h2')]);
    const r = computeHouseholdRelevance(households, sims, []);
    expect(r.get('h1')).toBe('yours');
    expect(r.has('h2')).toBe(false); // unconnected EA → background
  });

  it('promotes an EA household married into a Yours household (reason "kin"), one hop', () => {
    // your sim s1 (Yours h1) marries Bella s2 (EA Goth h2)
    const households = rec([hh('h1', 'yours'), hh('h2', 'ea')]);
    const sims = rec([sim('s1', 'h1'), sim('s2', 'h2')]);
    const r = computeHouseholdRelevance(households, sims, [edge('s1', 's2', 'spouse')]);
    expect(r.get('h1')).toBe('yours');
    expect(r.get('h2')).toBe('kin');
  });

  it('does NOT promote at two hops (kin-of-kin stays background)', () => {
    // s1 (Yours h1) — spouse — s2 (EA h2) ; s2 — parent — s3 (EA h3)
    // h2 is one hop (promoted); h3 is two hops from Yours (must stay background).
    const households = rec([hh('h1', 'yours'), hh('h2', 'ea'), hh('h3', 'ea')]);
    const sims = rec([sim('s1', 'h1'), sim('s2', 'h2'), sim('s3', 'h3')]);
    const r = computeHouseholdRelevance(households, sims, [
      edge('s1', 's2', 'spouse'),
      edge('s2', 's3', 'parent'),
    ]);
    expect(r.get('h2')).toBe('kin');
    expect(r.has('h3')).toBe(false);
  });

  it('parent edges promote in both directions (child of a Yours member)', () => {
    // s1 (Yours) is the parent of s2 (EA h2) → h2 surfaces
    const households = rec([hh('h1', 'yours'), hh('h2', 'ea')]);
    const sims = rec([sim('s1', 'h1'), sim('s2', 'h2')]);
    const r = computeHouseholdRelevance(households, sims, [edge('s1', 's2', 'parent')]);
    expect(r.get('h2')).toBe('kin');
  });

  it('excludes ex relationships (a divorce does not promote a household)', () => {
    const households = rec([hh('h1', 'yours'), hh('h2', 'ea')]);
    const sims = rec([sim('s1', 'h1'), sim('s2', 'h2')]);
    const r = computeHouseholdRelevance(households, sims, [edge('s1', 's2', 'ex_spouse')]);
    expect(r.has('h2')).toBe(false);
  });

  it('"yours" wins over "kin" when a household qualifies for both', () => {
    const households = rec([hh('h1', 'yours'), hh('h2', 'yours')]);
    const sims = rec([sim('s1', 'h1'), sim('s2', 'h2')]);
    const r = computeHouseholdRelevance(households, sims, [edge('s1', 's2', 'sibling')]);
    expect(r.get('h2')).toBe('yours');
  });

  it('a first-degree tie to a tree-only (householdless) relative promotes nothing', () => {
    // s1 (Yours) — parent — sDead (a tree_only ancestor, householdId null)
    const households = rec([hh('h1', 'yours')]);
    const sims = rec([sim('s1', 'h1'), sim('sDead', null)]);
    const r = computeHouseholdRelevance(households, sims, [edge('sDead', 's1', 'parent')]);
    expect(r.size).toBe(1);
    expect(r.get('h1')).toBe('yours');
  });

  it('accepts the relationships map form as well as an array', () => {
    const households = rec([hh('h1', 'yours'), hh('h2', 'ea')]);
    const sims = rec([sim('s1', 'h1'), sim('s2', 'h2')]);
    const edges = rec([edge('s1', 's2', 'partner')]);
    const r = computeHouseholdRelevance(households, sims, edges);
    expect(r.get('h2')).toBe('kin');
  });
});

describe('isForegroundEffective (visibility override on top of relevance)', () => {
  const relevance = new Map<string, 'yours' | 'kin'>([['hYours', 'yours']]);
  const vis = (id: string, visibility: HouseholdVisibility) => ({ id, visibility });

  it('pinned forces foreground even when auto-relevance says background', () => {
    expect(isForegroundEffective(vis('hBg', 'pinned'), relevance)).toBe(true);
  });

  it('sent_to_town forces background even when auto-relevance says foreground', () => {
    expect(isForegroundEffective(vis('hYours', 'sent_to_town'), relevance)).toBe(false);
  });

  it('auto defers to computed relevance', () => {
    expect(isForegroundEffective(vis('hYours', 'auto'), relevance)).toBe(true);
    expect(isForegroundEffective(vis('hBg', 'auto'), relevance)).toBe(false);
  });
});
