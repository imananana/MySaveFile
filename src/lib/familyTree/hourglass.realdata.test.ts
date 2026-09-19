/**
 * Regression test against the real Goth component (dumped from a save). The
 * hourglass must never overlap cards, from any focus in a genuinely tangled
 * intermarried tree (Goth / Bachelor / Crumplebottom / Caliente, multiple
 * marriages, missing ancestors). This is the ground-truth guard that catches
 * what synthetic seeds miss.
 */
import { describe, it, expect } from 'vitest';
import { buildHourglassLayout } from './hourglass';
import { CARD_W, CARD_H } from './layout';
import type { SimRelationship, SimRelType } from '../../types';

let id = 0;
const E = (a: string, b: string, t: SimRelType): SimRelationship => ({ id: `e${id++}`, simAId: a, simBId: b, relType: t, source: 'import' });

const REL: SimRelationship[] = [
  E('SimisBachelor','JocastaBachelor','spouse'),
  E('EnriquetaBachelor','SimisBachelor','parent'), E('MiltonBachelor','SimisBachelor','parent'),
  E('GretleGoth','FridaGoth','parent'), E('VictorGoth','FridaGoth','parent'),
  E('Unknown','SamuelGoth','parent'), E('SamuelGoth','OliviaGoth','spouse'),
  E('PrudenceCrumplebottom','CorneliaGoth','parent'), E('SimonCrumplebottom','CorneliaGoth','parent'),
  E('CorneliaGoth','GuntherGoth','spouse'), E('GretleGoth','GuntherGoth','parent'), E('VictorGoth','GuntherGoth','parent'),
  E('PrudenceCrumplebottom','AgnesCrumplebottom','parent'), E('SimonCrumplebottom','AgnesCrumplebottom','parent'),
  E('JocastaBachelor','MichaelBachelor','parent'), E('SimisBachelor','MichaelBachelor','parent'),
  E('KarimaCaliente','DinaCaliente','parent'), E('FlamencoCaliente','DinaCaliente','parent'),
  E('BereziraAlMahmoud','KarimaCaliente','parent'), E('TariqAlMahmoud','KarimaCaliente','parent'),
  E('KarimaCaliente','NinaCaliente','parent'), E('FlamencoCaliente','NinaCaliente','parent'),
  E('JocastaBachelor','BellaGoth','parent'), E('SimisBachelor','BellaGoth','parent'),
  E('BellaGoth','MortimerGoth','spouse'), E('CorneliaGoth','MortimerGoth','parent'), E('GuntherGoth','MortimerGoth','parent'),
  E('BellaGoth','CassandraGoth','parent'), E('MortimerGoth','CassandraGoth','parent'),
  E('BellaGoth','AlexanderGoth','parent'), E('MortimerGoth','AlexanderGoth','parent'),
  E('NestorCaliente','FlamencoCaliente','parent'),
  E('DulcineaCaliente','TangoCaliente','parent'), E('NestorCaliente','TangoCaliente','parent'),
  E('DinaCaliente','MichaelBachelor','partner'),
];

const FOCI = ['MortimerGoth', 'CassandraGoth', 'BellaGoth', 'GuntherGoth', 'DinaCaliente', 'MichaelBachelor', 'FlamencoCaliente', 'SimisBachelor'];

describe('hourglass — real Goth data, no overlaps from any focus', () => {
  for (const focus of FOCI) {
    it(`focus ${focus}`, () => {
      const L = buildHourglassLayout(focus, REL, { ancestorDepth: 3 });
      for (let i = 0; i < L.cards.length; i++) {
        for (let j = i + 1; j < L.cards.length; j++) {
          const p = L.cards[i], q = L.cards[j];
          const overlap = Math.abs(p.x - q.x) < CARD_W && Math.abs(p.y - q.y) < CARD_H;
          expect(overlap, `${p.simId} overlaps ${q.simId}`).toBe(false);
        }
      }
    });
  }
});
