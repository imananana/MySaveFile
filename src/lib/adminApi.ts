import { apiRequest } from './api';

/**
 * Client for the owner-only dashboard at /admin.
 *
 * Kept out of api.ts on purpose: the admin page is lazy-loaded and nothing
 * else in the app calls these, so its types and methods have no reason to ride
 * in the bundle every visitor downloads. It reuses api.ts's request helper, so
 * cookies and ApiError behave identically.
 *
 * Every one of these 404s for anyone who isn't in ADMIN_EMAILS — the same 404
 * the route would give if it didn't exist. The page treats that as "there is
 * no such page", not as "access denied".
 */

export interface AdminPing {
  ok: boolean;
  email: string;
}

export interface OnlineUser {
  id: string;
  name: string;
  lastSeen: string;
}

export interface AdminOnline {
  count: number;
  users: OnlineUser[];
}

export interface FunnelStage {
  key: string;
  label: string;
  note?: string;
  count: number;
}

export interface TrendWeek {
  weekStart: string;
  signups: number;
  active: number;
  imports: number;
  resyncs: number;
}

export interface ImportFailure {
  id: string;
  kind: string;
  reason: string;
  at: string;
  user: string;
  saveName: string | null;
}

export interface AdminOverview {
  tiles: {
    totalAccounts: number;
    newThisWeek: number;
    newLastWeek: number;
    activeThisWeek: number;
    activeLastWeek: number;
    liveShowcases: number;
    dbSizeBytes: number;
    /** null until anything has ever been logged — the tile hides rather than show a zero it can't stand behind. */
    imports: { ok: number; failed: number } | null;
  };
  online: AdminOnline;
  funnel: {
    allTime: FunnelStage[];
    recent: FunnelStage[];
    recentDays: number;
  };
  trends: TrendWeek[];
  hasImportEvents: boolean;
  recentFailures: ImportFailure[];
}

export interface AdminUserSave {
  id: string;
  name: string;
  createdAt: string;
  lastSyncedAt: string | null;
  lastOpenedAt: string | null;
  imported: boolean;
  showcaseLive: boolean;
  showcaseSlug: string | null;
  trash: { deletedAt: string; autoBackup: boolean } | null;
  simCount: number;
  householdCount: number;
  lotCount: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  emailVerified: boolean;
  /**
   * One of ours — the owner, or any address at the project's own domain. The
   * users table is the ONLY place these appear; every statistic on the page
   * already excludes them.
   */
  internal: boolean;
  lastSeen: string | null;
  lastSynced: string | null;
  saveCount: number;
  importedCount: number;
  simCount: number;
  /** photos.type = 'inspo' — the per-user inspo pool. */
  inspoCount: number;
  /** photos.type = 'built', excluding the rows the portrait sync writes. */
  builtCount: number;
  /** households.thumbnail_filename — portraits synced from localthumbcache. */
  portraitCount: number;
  showcaseSlug: string | null;
  saves: AdminUserSave[];
}

export interface PackTally {
  id: string;
  count: number;
}

export interface ShowcaseViews {
  slug: string;
  saveName: string;
  creator: string;
  total: number;
  last7: number;
  last30: number;
}

export interface AdminStats {
  /** What the imported SAVES contained — evidence about the parser. */
  adoption: {
    importedSaves: number;
    features: Array<{ key: string; label: string; count: number }>;
  };
  /**
   * What PEOPLE did — counted per person over everyone who has a save.
   *
   * One list. Derived counts cover all of history; `thisWeek` (from the
   * feature log) rides on the rows it can enrich rather than duplicating them
   * in a second card. `loggedOnly` rows have no derived number at all — the
   * randomizer, which no query can recover.
   */
  usage: {
    usersWithSaves: number;
    /** Day the feature log started; null until anything has been logged. */
    loggedSince: string | null;
    features: Array<{
      key: string;
      label: string;
      note?: string;
      loggedOnly: boolean;
      count: number;
      /** People who did it in the last 7 days, or null where nothing logs it. */
      thisWeek: number | null;
    }>;
  };
  /**
   * Where people go first after a .save import, or null until the first
   * event lands. `imported` is the denominator (people whose import happened
   * while this was being logged); `imported − moved` = landed on the overview
   * and never left, which is the number the card exists to show.
   */
  firstStop: {
    since: string;
    imported: number;
    moved: number;
    stops: Array<{ key: string; people: number }>;
  } | null;
  packs: {
    users: number;
    saves: number;
    ownedBy: PackTally[];
    detectedIn: PackTally[];
  };
  photos: { inspo: number; built: number; portraits: number; uploaders: number; largestLibrary: number };
  trash: { deleted: number; autoBackups: number };
  showcaseViews: ShowcaseViews[];
}

export const adminApi = {
  ping: () => apiRequest<AdminPing>('/admin/ping'),
  overview: () => apiRequest<AdminOverview>('/admin/overview'),
  online: () => apiRequest<AdminOnline>('/admin/online'),
  users: () => apiRequest<AdminUser[]>('/admin/users'),
  stats: () => apiRequest<AdminStats>('/admin/stats'),
};
