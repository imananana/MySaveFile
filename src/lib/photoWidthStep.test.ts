import { describe, it, expect } from 'vitest';
import { photoWidthStep } from './api';

// The point of the ladder is that surfaces SHARE a URL for the same picture.
// These are the widths the showcase actually asks for, grouped by the step
// they have to land on together — if a change splits one of these groups,
// that photo starts downloading twice as you move between pages.
describe('photoWidthStep', () => {
  it('never returns a step smaller than the request', () => {
    for (let w = 1; w <= 1440; w++) {
      const step = photoWidthStep(w);
      expect(step).not.toBeNull();
      expect(step!).toBeGreaterThanOrEqual(w);
    }
  });

  it('puts every avatar, bubble and picker thumb on one step', () => {
    // byline avatar 36 · resident bubble 40 · picker row 52
    expect([36, 40, 52].map(photoWidthStep)).toEqual([64, 64, 64]);
  });

  it('puts the front-page card and the world-page card on one step', () => {
    // world roster/featured portrait 220 · front band portrait 260 ·
    // world lot grid card 320 — the front-to-world move that felt slow
    expect([220, 260, 320].map(photoWidthStep)).toEqual([320, 320, 320]);
  });

  it('keeps the photo strips off the 800 step', () => {
    // built-photo strip 384 · household manager cover 400 — these were tuned
    // small on purpose, and 800 would have quadrupled them
    expect([384, 400].map(photoWidthStep)).toEqual([480, 480]);
  });

  it('puts both collages and the featured lot card on one step', () => {
    // chapter collage cell 600 · world featured lot 700 · og cover 800
    expect([600, 700, 800].map(photoWidthStep)).toEqual([800, 800, 800]);
  });

  it('puts the chapter lead and the world hero on one step', () => {
    // front chapter lead 1100 · world hero 1300 · overlay hero 1440
    expect([1100, 1300, 1440].map(photoWidthStep)).toEqual([1440, 1440, 1440]);
  });

  it('falls off the top of the ladder to the original file', () => {
    expect(photoWidthStep(1441)).toBeNull();
  });
});
