/**
 * SSRF guard for server-side fetches of user-supplied URLs.
 *
 * The app currently makes NO outbound fetches of user URLs (download links and
 * social links are only stored + rendered client-side). This util exists so
 * that when such a fetch IS added — e.g. the deferred mod/CC preview-image
 * fetch (Microlink) — it is safe by default: use `safeFetch()` instead of
 * `fetch()` for anything user-controlled.
 *
 * It enforces http(s)-only and rejects URLs that resolve to private, loopback,
 * link-local, or cloud-metadata (169.254.169.254) addresses. It also refuses
 * to follow redirects (which could bounce to an internal host).
 *
 * NOTE: full DNS-rebinding protection requires pinning the socket to a checked
 * IP. This checks every A/AAAA record at call time, which covers the common
 * cases; harden further with a custom lookup/agent if a real fetch path needs it.
 */
import dns from 'dns/promises';
import net from 'net';

/** True if an IP literal sits in a range a guarded fetch must never reach. */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  if (net.isIPv6(ip)) return isBlockedIpv6(ip);
  return true; // not a parseable IP → block to be safe
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                          // 0.0.0.0/8 "this network"
  if (a === 10) return true;                         // 10/8 private
  if (a === 127) return true;                        // loopback
  if (a === 169 && b === 254) return true;           // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16/12 private
  if (a === 192 && b === 168) return true;           // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a >= 224) return true;                         // 224/4 multicast + 240/4 reserved
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;        // loopback / unspecified
  if (lower.startsWith('fe80')) return true;                // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
}

export interface UrlCheck { ok: boolean; reason?: string; }

/** Validate a URL is safe to fetch: http(s) only, every resolved IP public. */
export async function checkFetchUrl(rawUrl: string): Promise<UrlCheck> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return { ok: false, reason: 'invalid URL' }; }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: `blocked scheme ${u.protocol}` };
  }

  const host = u.hostname;
  if (net.isIP(host)) {
    return isBlockedIp(host) ? { ok: false, reason: 'blocked IP literal' } : { ok: true };
  }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost' };
  }

  let addresses: string[];
  try {
    addresses = (await dns.lookup(host, { all: true })).map((r) => r.address);
  } catch {
    return { ok: false, reason: 'DNS resolution failed' };
  }
  if (addresses.length === 0) return { ok: false, reason: 'no DNS records' };
  for (const addr of addresses) {
    if (isBlockedIp(addr)) return { ok: false, reason: `resolves to blocked IP ${addr}` };
  }
  return { ok: true };
}

/**
 * SSRF-protected fetch. Validates the URL targets a public host, then fetches
 * without following redirects. Throws if the URL is unsafe.
 */
export async function safeFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
  const check = await checkFetchUrl(rawUrl);
  if (!check.ok) throw new Error(`SSRF guard blocked fetch to ${rawUrl}: ${check.reason}`);
  return fetch(rawUrl, { ...init, redirect: 'error' });
}
