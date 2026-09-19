// Coarse relative-time formatter used by the "Synced N ago" indicator.
// Returns null for null/invalid input so callers can omit the line entirely.
export function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const ms = Date.now() - t;
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  if (day < 30) {
    const w = Math.floor(day / 7);
    return `${w} week${w === 1 ? '' : 's'} ago`;
  }
  if (day < 365) {
    const mo = Math.floor(day / 30);
    return `${mo} month${mo === 1 ? '' : 's'} ago`;
  }
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

/**
 * How long to wait, for a throttled action — "a minute", "3 minutes". Rounds up,
 * so the wait it names is always long enough to actually work.
 */
export function waitFor(seconds: number | undefined): string {
  const min = Math.max(1, Math.ceil((seconds ?? 60) / 60));
  return min === 1 ? 'a minute' : `${min} minutes`;
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}
