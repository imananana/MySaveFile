/**
 * Tests for the family-import plan: reachability closure, tree-only vs stub vs
 * phantom classification, and edge generation. Modeled on the validated real
 * cases: Victor/Milton (hidden-household ancestors), the in-game "Unknown"
 * (dangling ref), and the phantom Goths (records nothing references).
 */
import { describe, it, expect } from 'vitest';
import { planFamilyImport } from './familyImport';
import type { ParsedFamilyFacts, ParsedSim } from '../parser/types';

const mkSim = (idHex: string, species: 'human' | 'pet' = 'human'): ParsedSim => ({
  id: BigInt(idHex),
  firstName: idHex,
  lastName: 'Test',
  gender: 'female',
  lifestage: 'adult',
  species,
  petSubtype: 'pet',
  petBreed: null,
  occult: 'none',
  isGhost: false,
  deathCause: null,
  householdId: null,
  traitIds: [],
  aspirationId: null,
  enrolledDegree: null,
  career: null,
  skills: [],
});

// World: imported Goth household {0x1 Mortimer, 0x2 Bella, 0x3 Cassandra}.
// 0x10 Victor (hidden household) is Mortimer's father; Victor's own father is
// 0xdead — a dangling ref (no record). 0x20 is Bella's divorced ex (record,
// unimported household). 0x99 is a phantom (record, referenced by nothing).
const sims: ParsedSim[] = [mkSim('0x1'), mkSim('0x2'), mkSim('0x3'), mkSim('0x10'), mkSim('0x20'), mkSim('0x99')];
const facts: ParsedFamilyFacts = {
  bySim: {
    '0x1': { parents: ['0x10'], spouse: '0x2', engaged: null, partner: null },
    '0x2': { parents: [], spouse: '0x1', engaged: null, partner: null },
    '0x3': { parents: ['0x1', '0x2'], spouse: null, engaged: null, partner: null },
    '0x10': { parents: ['0xdead'], spouse: null, engaged: null, partner: null },
    '0x20': { parents: [], spouse: null, engaged: null, partner: null },
    '0x99': { parents: [], spouse: null, engaged: null, partner: null },
  },
  pairEdges: [{ a: '0x2', b: '0x20', relType: 'ex_spouse' }],
};

describe('planFamilyImport', () => {
  const plan = planFamilyImport(facts, sims, ['0x1', '0x2', '0x3']);

  it('pulls reachable out-of-household records in as tree_only (Victor + the ex)', () => {
    expect(plan.treeOnly.sort()).toEqual(['0x10', '0x20']);
  });

  it('turns dangling ancestor refs into stubs', () => {
    expect(plan.stubs).toEqual(['0xdead']);
  });

  it('never imports phantoms (records nothing reaches)', () => {
    expect(plan.treeOnly).not.toContain('0x99');
    expect(plan.edges.every((e) => e.a !== '0x99' && e.b !== '0x99')).toBe(true);
  });

  it('emits the full deduped edge set, including stub-parent and ex edges', () => {
    const keys = plan.edges.map((e) => `${e.relType}:${e.a}>${e.b}`).sort();
    expect(keys).toEqual([
      'ex_spouse:0x2>0x20',
      'parent:0x10>0x1',     // Victor → Mortimer
      'parent:0x1>0x3',      // Mortimer → Cassandra
      'parent:0x2>0x3',      // Bella → Cassandra
      'parent:0xdead>0x10',  // Unknown stub → Victor
      'spouse:0x1>0x2',      // stored once despite being mirrored on both sims
    ].sort());
  });

  it('multi-generation closure: starting from the child alone still reaches the whole line', () => {
    const p = planFamilyImport(facts, sims, ['0x3']);
    expect(p.treeOnly.sort()).toEqual(['0x1', '0x10', '0x2', '0x20']);
    expect(p.stubs).toEqual(['0xdead']);
  });

  // The Tompkins case: a grandparent outlives a deleted middle generation. The
  // ahnentafel still records the grandparent (saveParser reconstructs the stub's
  // parent link), and import must bridge UP through the record-less middle so
  // the grandparent connects to the grandchild instead of floating.
  it('bridges a present grandparent down through a record-less middle to the grandchild', () => {
    // 0x300 Conor (grandparent) + 0x100 Vanessa (grandchild) imported together;
    // 0x200 is the deleted middle — no record, but the ahnentafel gives it a
    // pedigree parent (0x300).
    const bridgeSims = [mkSim('0x100'), mkSim('0x300')];
    const bridgeFacts: ParsedFamilyFacts = {
      bySim: {
        '0x100': { parents: ['0x200'], spouse: null, engaged: null, partner: null },
        '0x200': { parents: ['0x300'], spouse: null, engaged: null, partner: null }, // record-less middle
        '0x300': { parents: [], spouse: null, engaged: null, partner: null },
      },
      pairEdges: [],
    };
    const p = planFamilyImport(bridgeFacts, bridgeSims, ['0x100', '0x300']);
    expect(p.stubs).toEqual(['0x200']); // the deleted middle is an Unknown stub
    const keys = p.edges.map((e) => `${e.relType}:${e.a}>${e.b}`).sort();
    expect(keys).toEqual([
      'parent:0x200>0x100', // Unknown middle → Vanessa
      'parent:0x300>0x200', // Conor → Unknown middle  (the bridge — was dropped before)
    ]);
  });

  it('pets never enter the plan', () => {
    const withPet = [...sims, mkSim('0x50', 'pet')];
    const f2: ParsedFamilyFacts = { ...facts, bySim: { ...facts.bySim, '0x50': { parents: ['0x1'], spouse: null, engaged: null, partner: null } } };
    const p = planFamilyImport(f2, withPet, ['0x1', '0x2', '0x3']);
    expect(p.treeOnly).not.toContain('0x50');
    expect(p.stubs).not.toContain('0x50'); // a pet record is ignored, not a stub
  });
});
