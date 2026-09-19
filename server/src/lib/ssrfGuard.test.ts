import { describe, it, expect } from 'vitest';
import { isBlockedIp, checkFetchUrl } from './ssrfGuard';

describe('isBlockedIp', () => {
  it('blocks private / loopback / metadata IPv4', () => {
    for (const ip of [
      '0.0.0.0', '10.0.0.5', '127.0.0.1', '169.254.169.254',
      '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '224.0.0.1',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '69.46.46.78']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it('blocks IPv6 loopback / ULA / link-local / mapped-v4', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows public IPv6', () => {
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('blocks non-IP garbage', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
  });
});

describe('checkFetchUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    expect((await checkFetchUrl('file:///etc/passwd')).ok).toBe(false);
    expect((await checkFetchUrl('ftp://example.com')).ok).toBe(false);
    expect((await checkFetchUrl('not a url')).ok).toBe(false);
  });

  it('rejects localhost and private/metadata IP literals (no DNS)', async () => {
    expect((await checkFetchUrl('http://localhost/x')).ok).toBe(false);
    expect((await checkFetchUrl('http://127.0.0.1/x')).ok).toBe(false);
    expect((await checkFetchUrl('http://169.254.169.254/latest/meta-data/')).ok).toBe(false);
    expect((await checkFetchUrl('http://10.0.0.1/')).ok).toBe(false);
    expect((await checkFetchUrl('http://[::1]/x')).ok).toBe(false);
  });

  it('allows a public IP literal', async () => {
    expect((await checkFetchUrl('https://8.8.8.8/')).ok).toBe(true);
  });
});
