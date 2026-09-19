import { describe, expect, it } from 'vitest';
import { stripNullBytes } from './stripNullBytes';

const NUL = '\u0000';

describe('stripNullBytes', () => {
  it('strips NUL from strings, wherever it sits', () => {
    expect(stripNullBytes(`Кат${NUL}я`)).toBe('Катя');
    expect(stripNullBytes(`${NUL}в начале`)).toBe('в начале');
    expect(stripNullBytes(`в конце${NUL}`)).toBe('в конце');
    expect(stripNullBytes(`${NUL}${NUL}${NUL}`)).toBe('');
  });

  it('leaves clean strings identical (same reference)', () => {
    const s = 'Автосохранение 00000004';
    expect(stripNullBytes(s)).toBe(s);
  });

  it('recurses through objects and arrays', () => {
    expect(stripNullBytes({
      firstName: `И${NUL}ван`,
      traits: [`a${NUL}b`, 'ok'],
      nested: { notes: `${NUL}x` },
    })).toEqual({
      firstName: 'Иван',
      traits: ['ab', 'ok'],
      nested: { notes: 'x' },
    });
  });

  it('passes non-strings through untouched', () => {
    expect(stripNullBytes(42)).toBe(42);
    expect(stripNullBytes(true)).toBe(true);
    expect(stripNullBytes(null)).toBe(null);
    expect(stripNullBytes(undefined)).toBe(undefined);
    expect(stripNullBytes({ n: 7, b: false, empty: null })).toEqual({ n: 7, b: false, empty: null });
  });
});
