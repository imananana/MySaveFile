/**
 * Formatters shared by the admin dashboard's zones. Internal tool, so the bar
 * is "unambiguous at a glance", not "pretty" — a number that could be read two
 * ways is worse here than a number that looks plain.
 */

/** 1.2 GB / 431 MB. Binary units, because that's what Railway's volume shows. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/** "Sep 8" — the Monday a trend bar covers. */
export function weekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "8 Sep 2026" — a signup or sync date, where the year matters. */
export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * How long ago, at the resolution the question needs. Minutes while someone
 * might still be on the page, days once they clearly aren't.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days}d ago`;
  return dateLabel(iso);
}

/** Whole-number percent of a total, guarding the empty-database case. */
export function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
