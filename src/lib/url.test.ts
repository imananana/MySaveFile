import { describe, it, expect } from 'vitest';
import { normalizeGalleryId, safeHref } from './url';

describe('normalizeGalleryId', () => {
  it('leaves a bare username alone', () => {
    expect(normalizeGalleryId('imanistan')).toBe('imanistan');
  });

  it('strips a leading @, which is how the field is labelled elsewhere', () => {
    expect(normalizeGalleryId('@imanistan')).toBe('imanistan');
  });

  it('heals the value a real profile ended up storing', () => {
    // The field asked for a username but rendered it as a link, so pasting a
    // URL was the only way to get a working one.
    expect(normalizeGalleryId('https://@imanistan')).toBe('imanistan');
  });

  it('pulls the username out of a pasted Gallery link', () => {
    expect(normalizeGalleryId(
      'https://www.ea.com/games/the-sims/the-sims-4/the-gallery/?profile_id=imanistan&foo=1',
    )).toBe('imanistan');
  });

  it('decodes an escaped username from a pasted link', () => {
    expect(normalizeGalleryId('https://www.ea.com/…/the-gallery/?profile_id=ima%20nistan')).toBe('ima nistan');
  });

  it('drops a scheme, www, and any trailing path', () => {
    expect(normalizeGalleryId('https://www.example.com/imanistan/')).toBe('example.com');
  });

  it('treats empty and whitespace as absent', () => {
    expect(normalizeGalleryId('')).toBe('');
    expect(normalizeGalleryId('   ')).toBe('');
    expect(normalizeGalleryId(null)).toBe('');
    expect(normalizeGalleryId(undefined)).toBe('');
  });
});


describe('safeHref', () => {
  it('refuses script-bearing schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,<script>')).toBeUndefined();
  });

  it('assumes https for a scheme-less link', () => {
    expect(safeHref('patreon.com/x')).toBe('https://patreon.com/x');
  });

  it('shows why a bare username must never be fed to it', () => {
    // Silently valid and points nowhere. A Gallery name has no web page at all,
    // so it is rendered as plain text now and never reaches this function.
    expect(safeHref('imanistan')).toBe('https://imanistan');
  });
});
