import { describe, it, expect } from 'vitest';
import { sanitizeUserUrl } from './safeUrl';

describe('sanitizeUserUrl', () => {
  it('passes through http(s) URLs', () => {
    expect(sanitizeUserUrl('https://patreon.com/me')).toBe('https://patreon.com/me');
    expect(sanitizeUserUrl('http://example.com/x')).toBe('http://example.com/x');
  });

  it('prepends https to scheme-less input', () => {
    expect(sanitizeUserUrl('patreon.com/me')).toBe('https://patreon.com/me');
    expect(sanitizeUserUrl('  drive.google.com/abc ')).toBe('https://drive.google.com/abc');
  });

  it('rejects dangerous schemes', () => {
    expect(sanitizeUserUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUserUrl('JavaScript:alert(1)')).toBeNull();
    expect(sanitizeUserUrl('  data:text/html,<script>')).toBeNull();
    expect(sanitizeUserUrl('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeUserUrl('file:///etc/passwd')).toBeNull();
  });

  it('treats empty / nullish as null', () => {
    expect(sanitizeUserUrl('')).toBeNull();
    expect(sanitizeUserUrl('   ')).toBeNull();
    expect(sanitizeUserUrl(null)).toBeNull();
    expect(sanitizeUserUrl(undefined)).toBeNull();
  });
});
