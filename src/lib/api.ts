import type { Photo, Club, SmallBusiness, Holiday, Dynasty, DynastyMember, Mod, Sim, SimGender, SimLifestage, SimSpecies, SimPetSubtype, SimOccult, SimRecordStatus, SimEnrolledDegree, SimCareer, SimRelType, SimRelationship } from '../types';
import type { VenueCriterion, ParsedClubRule, SmallBusinessCustomerCriterion } from './parser/types';

const BASE = '/api';
const PHOTO_BASE = (import.meta.env.VITE_PHOTO_BASE_URL as string | undefined) ?? `${BASE}/photos/files`;

// Cloudflare resizes photos on the fly from `/cdn-cgi/image/...`, but only for
// a bucket served through our own zone (photos.mysavefile.com). In local dev
// PHOTO_BASE is the Express proxy, which has no such path, so a requested width
// is ignored there and the full file is served exactly as before.
const CAN_RESIZE = /^https:\/\/[a-z0-9.-]*\bmysavefile\.com(\/|$)/i.test(PHOTO_BASE);

/**
 * The only widths we ever ask the CDN for.
 *
 * The width is baked into the URL, so two surfaces that want the same picture
 * at slightly different sizes generate two URLs — two CDN transforms, two
 * browser cache entries, two downloads. The showcase asked for a household
 * portrait at 260 on the front page and 220 on the world page, so every
 * portrait re-downloaded on a page that had just finished showing it. That is
 * what made moving around the showcase feel slow.
 *
 * Snapping every request up to one of these steps collapses those clusters:
 * 220/260/320 all become 320, 600/700/800 become 800, 1100/1300 become 1440.
 * The second surface then pays nothing, which is worth more than the slack.
 *
 * The steps are spaced so nothing already in the app grows more than ~1.6x in
 * pixels — 480 exists purely so the 384/400 photo strips don't get dragged up
 * to 800 and undo the tile-size win they were tuned for. Adding a step is
 * cheap; just check first that it doesn't split a cluster that two surfaces
 * share, or that photo starts downloading twice again.
 *
 * Rounding is always UP, so an image is never served smaller than the box it
 * has to fill (which would look blurry). Past the top step we send no width at
 * all and the original file is served, exactly as before.
 *
 * ⚠ server/src/lib/photoWarm.ts pre-warms the CDN at the showcase's subset of
 * these steps. Change this ladder → change WARM_WIDTHS there with it, or the
 * warm-up starts making sizes nobody requests.
 */
const WIDTH_STEPS = [64, 96, 160, 320, 480, 800, 1440] as const;

export function photoWidthStep(width: number): number | null {
  return WIDTH_STEPS.find((step) => width <= step) ?? null;
}

// Global "session expired" handler. A 401 on an authed endpoint means the
// session cookie lapsed mid-use; the app registers a handler here (clear auth +
// route to login) so every feature degrades to a clean re-login prompt instead
// of leaking a raw "Unauthorized" into whatever the user was doing. Registered
// via setUnauthorizedHandler to avoid api.ts importing the auth store (circular).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void { onUnauthorized = fn; }

// Fire the session-expired handler on a 401. `/auth/*` endpoints legitimately
// return 401 (wrong password, the not-logged-in `me` probe) — those aren't an
// expired session, so they're excluded.
function notifyIfUnauthorized(status: number, path: string): void {
  if (status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
}

/**
 * A failed request, with the bits a screen needs to tell one failure from
 * another. Without `status`, a throttled request and a dead link arrive as the
 * same Error — which is how "too many attempts" came out as "link expired".
 */
export interface ApiError extends Error {
  status: number;
  /** Seconds to wait, on a 429. */
  retryAfter?: number;
}

/**
 * Exported so surfaces that ship their OWN client (the owner-only admin
 * dashboard, which is lazy-loaded and has no business adding its types to
 * everyone's bundle) get the same cookie handling and the same ApiError.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    notifyIfUnauthorized(res.status, path);
    const body = await res.json().catch(() => ({})) as { error?: string; retryAfter?: number };
    const err = new Error(body.error ?? `HTTP ${res.status}`) as ApiError;
    err.status = res.status;
    if (typeof body.retryAfter === 'number') err.retryAfter = body.retryAfter;
    throw err;
  }
  return res.json() as Promise<T>;
}

/** Local shorthand — every method below reads better without the prefix. */
const request = apiRequest;

export const api = {
  // Auth
  register: (email: string, password: string, displayName?: string) =>
    request<{ id: string; email: string; displayName: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),

  login: (email: string, password: string) =>
    request<{ id: string; email: string; displayName: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ id: string; email: string; displayName: string; emailVerified: boolean; creatorName: string | null; socialLinks: Record<string, string>; profilePhotoUrl: string | null; profilePhotoFilename: string | null }>('/auth/me'),

  verifyEmail: (token: string) =>
    request<{ ok: boolean }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),

  resendVerification: () =>
    request<{ ok: boolean }>('/auth/resend-verification', { method: 'POST' }),

  updateProfile: (data: { displayName?: string; creatorName?: string | null; socialLinks?: Record<string, string> }) =>
    request<{ ok: boolean }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),

  // Password recovery. /forgot always resolves ok (no account enumeration).
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),

  checkResetToken: (token: string) =>
    request<{ valid: boolean }>(`/auth/reset/${token}`),

  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),

  uploadProfilePhoto: (formData: FormData): Promise<{ profilePhotoUrl: string; profilePhotoFilename: string }> =>
    fetch(`${BASE}/auth/profile-photo`, { method: 'POST', credentials: 'include', body: formData }).then(async (res) => {
      if (!res.ok) { if (res.status === 401) onUnauthorized?.(); const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`); }
      return res.json() as Promise<{ profilePhotoUrl: string; profilePhotoFilename: string }>;
    }),

  // Pack ownership — global per-user. Shape matches usePackOwnership.ts's
  // partialize output, so the store can write the whole blob in one call.
  getPackOwnership: () =>
    request<{ manualOverrides: Record<string, 'on' | 'off'>; autoDetected: string[]; lastDetectedAt: string | null }>('/auth/pack-ownership'),
  setPackOwnership: (data: { manualOverrides: Record<string, 'on' | 'off'>; autoDetected: string[]; lastDetectedAt: string | null }) =>
    request<{ ok: boolean }>('/auth/pack-ownership', { method: 'PUT', body: JSON.stringify(data) }),

  // Save files
  listSaveFiles: () =>
    request<Array<{ id: string; name: string; duplicatedFrom: string | null; created_at: string; updated_at: string }>>('/save-files'),

  createSaveFile: (
    name?: string,
    opts?: { sourceSaveFilename?: string; sourceSaveName?: string },
  ) =>
    request<{ id: string; name: string; source_save_filename: string | null; source_save_name: string | null; created_at: string; updated_at: string }>(
      '/save-files',
      {
        method: 'POST',
        body: JSON.stringify({ name, ...(opts ?? {}) }),
      },
    ),

  getSaveFile: (id: string) =>
    request<{
      id: string;
      name: string;
      season_length: number;
      imported_season_length: number | null;
      lots: Array<Record<string, unknown>>;
      households: Array<Record<string, unknown>>;
      clubs: Array<Record<string, unknown>>;
      smallBusinesses: Array<Record<string, unknown>>;
      holidays: Array<Record<string, unknown>>;
    }>(`/save-files/${id}`),

  getImportSnapshots: (id: string) =>
    request<{
      lots:            Array<{ lot_key: string; source_id: string | null; last_imported_state: object | null }>;
      households:      Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
      sims:            Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
      clubs:           Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
      smallBusinesses: Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
      holidays:        Array<{ id: string; source_id: string | null; last_imported_state: object | null }>;
    }>(`/save-files/${id}/import-snapshots`),

  renameSaveFile: (id: string, name: string) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  setDisabledWorlds: (id: string, disabledWorlds: string[]) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ disabledWorlds }),
    }),

  // Sets the authored plan length. Pass importedSeasonLength too (re-sync) to
  // record the save's length as of this sync in the same PATCH.
  setSeasonLength: (id: string, seasonLength: number, importedSeasonLength?: number) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(importedSeasonLength === undefined ? { seasonLength } : { seasonLength, importedSeasonLength }),
    }),

  setNeighborhoodCaptions: (id: string, neighborhoodCaptions: Record<string, string>) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ neighborhoodCaptions }),
    }),

  setWorldBlurbs: (id: string, worldBlurbs: Record<string, string>) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ worldBlurbs }),
    }),

  setSaveFileDescription: (id: string, description: string) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ description }),
    }),

  touchSaveFileSyncedAt: (id: string) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ touchSyncedAt: true }),
    }),

  setSaveFileSource: (id: string, sourceSaveFilename: string, sourceSaveName: string) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ sourceSaveFilename, sourceSaveName }),
    }),

  setSaveFileUrl: (id: string, saveFileUrl: string | null) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ saveFileUrl: saveFileUrl ?? '' }),
    }),

  deleteSaveFile: (id: string) =>
    request<{ ok: boolean }>(`/save-files/${id}`, { method: 'DELETE' }),

  // Soft-delete trash: deleted saves are recoverable until purged.
  listTrash: () =>
    request<{ id: string; name: string; deleted_at: string; auto_backup: boolean; created_at: string; updated_at: string }[]>('/save-files/trash'),

  restoreSaveFile: (id: string) =>
    request<{ ok: boolean }>(`/save-files/${id}/restore`, { method: 'POST' }),

  purgeSaveFile: (id: string) =>
    request<{ ok: boolean }>(`/save-files/${id}/purge`, { method: 'DELETE' }),

  // Park a faithful copy of a save in the trash before a destructive op.
  snapshotSaveFile: (id: string) =>
    request<{ id: string }>(`/save-files/${id}/snapshot`, { method: 'POST' }),

  duplicateSaveFile: (id: string) =>
    request<{ id: string; name: string; created_at: string; updated_at: string }>(`/save-files/${id}/duplicate`, { method: 'POST' }),

  resetSaveFile: (id: string) =>
    request<{ ok: boolean }>(`/save-files/${id}/reset`, { method: 'POST' }),

  // ── Showcase (the /s/<slug> public page) ─────────────────────────────────
  // By slug: works logged-out; the cookie rides along so the owner gets
  // isOwner + edit mode. An old slug answers { redirectTo } instead.
  getShowcaseBySlug: (slug: string) =>
    request<Record<string, unknown> & { redirectTo?: string }>(`/public/s/${encodeURIComponent(slug)}`),

  // By save id (owner only) — how the showcase opens before it first goes
  // Live, when no slug exists yet. Same payload shape as the slug route.
  getShowcasePayloadForSave: (id: string) =>
    request<Record<string, unknown> & { redirectTo?: string }>(`/save-files/${id}/showcase-payload`),

  // Replace the showcase-authored settings blob (auto-save model — the page
  // PATCHes the whole blob on every in-place edit).
  setShowcaseSettings: (id: string, showcase: object) =>
    request<{ ok: boolean }>(`/save-files/${id}/showcase`, {
      method: 'PATCH',
      body: JSON.stringify({ showcase }),
    }),

  // The publish switch. First Live mints the vanity slug from the save name.
  setShowcaseLive: (id: string, live: boolean) =>
    request<{ live: boolean; slug: string | null }>(`/save-files/${id}/showcase-live`, {
      method: 'POST',
      body: JSON.stringify({ live }),
    }),

  // Per-save pack evidence, written by the import flow after detection.
  setDetectedPacks: (id: string, detectedPacks: string[]) =>
    request<{ ok: boolean }>(`/save-files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ detectedPacks }),
    }),

  // Curated showcases for the public landing page. Returns [] when nothing is
  // featured yet, so the landing can hide the section gracefully. Links go to
  // /s/<slug> — only Live showcases are ever featured.
  getFeaturedShowcases: (): Promise<Array<{
    name: string;
    description: string;
    slug: string;
    coverFilename: string | null;
    coverUrl: string | null;
    photoCount: number;
    creator: { name: string | null; profilePhotoFilename: string | null };
  }>> =>
    fetch(`${BASE}/public/featured`).then(async (res) => {
      if (!res.ok) { if (res.status === 401) onUnauthorized?.(); const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`); }
      const rows = await res.json() as Array<{
        name: string; description: string; slug: string;
        coverFilename: string | null; photoCount: number;
        creator: { name: string | null; profilePhotoFilename: string | null };
      }>;
      return rows.map((r) => ({ ...r, coverUrl: r.coverFilename ? `${PHOTO_BASE}/${r.coverFilename}` : null }));
    }),

  // Native browser download (same-origin /api + Lax cookie → auth just works).
  // Streams straight to disk with a progress bar — no buffering the whole backup
  // into memory, which for a big save (~200MB+) made the download appear to never
  // start. The server's Content-Disposition supplies the .s4plan filename.
  exportSaveFile: (id: string, name: string) => {
    const a = document.createElement('a');
    a.href = `${BASE}/save-files/${id}/export`;
    a.download = `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.s4plan`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  importSaveFile: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/save-files/import`, { method: 'POST', credentials: 'include', body: fd });
    if (!res.ok) { if (res.status === 401) onUnauthorized?.(); throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`); }
    return res.json() as Promise<{ id: string; name: string; created_at: string; updated_at: string }>;
  },

  // Lots
  updateLot: (
    saveFileId: string,
    lotKey: string,
    data: {
      status?: string;
      customName?: string;
      customType?: string;
      notes?: string;
      description?: string;
      hasSmallBusiness?: boolean;
      smallBusinessName?: string;
      smallBusinessNotes?: string;
      smallBusinessIcon?: string;
      sourceId?: string;
      lastImportedState?: object;
    },
  ) =>
    request<{ ok: boolean }>(
      `/save-files/${saveFileId}/lots/${encodeURIComponent(lotKey)}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),

  // Households
  createHousehold: (saveFileId: string, data: { name: string; composition?: object; notes?: string; description?: string; sourceId?: string | null; money?: number | null; plannedMoney?: number | null; provenance?: 'yours' | 'ea' | 'mod' | null; provenanceSub?: string | null; creatorName?: string | null; visibility?: 'pinned' | 'auto' | 'sent_to_town'; lastImportedState?: object }) =>
    request<{ id: string; name: string; composition: object; notes: string; description: string; assignedLotKey: null; sourceId: string | null; money: number | null; provenance: 'yours' | 'ea' | 'mod' | null; provenanceSub: string | null; creatorName: string | null; visibility: 'pinned' | 'auto' | 'sent_to_town'; thumbnailFilename: string | null }>(
      `/save-files/${saveFileId}/households`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  updateHousehold: (saveFileId: string, hId: string, data: { name?: string; composition?: object; notes?: string; description?: string; sourceId?: string | null; money?: number | null; plannedMoney?: number | null; provenance?: 'yours' | 'ea' | 'mod' | null; provenanceSub?: string | null; creatorName?: string | null; visibility?: 'pinned' | 'auto' | 'sent_to_town'; lastImportedState?: object }) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/households/${hId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteHousehold: (saveFileId: string, hId: string) =>
    request<{ ok: boolean; preservedSimIds: string[]; deletedSimIds: string[] }>(`/save-files/${saveFileId}/households/${hId}`, { method: 'DELETE' }),

  // `displace` asserts that reality outranks the plan — the re-sync passes it so
  // a full lot makes room by moving plan-only households out instead of
  // refusing. Every UI caller omits it and gets the refusal (409) instead, so no
  // screen can quietly put two households in a one-household house.
  assignHousehold: (saveFileId: string, hId: string, lotKey: string, opts?: { displace?: boolean }) =>
    request<{ ok: boolean }>(
      `/save-files/${saveFileId}/households/${hId}/assign/${encodeURIComponent(lotKey)}${opts?.displace ? '?displace=1' : ''}`,
      { method: 'POST' },
    ),

  unassignHousehold: (saveFileId: string, hId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/households/${hId}/assign`, { method: 'DELETE' }),

  uploadHouseholdThumbnail: async (saveFileId: string, hId: string, jpegBlob: Blob): Promise<{ thumbnailFilename: string }> => {
    const fd = new FormData();
    fd.append('thumbnail', jpegBlob, 'thumb.jpg');
    const res = await fetch(`${BASE}/save-files/${saveFileId}/households/${hId}/thumbnail`, {
      method: 'PUT', credentials: 'include', body: fd,
    });
    if (!res.ok) {
      if (res.status === 401) onUnauthorized?.();
      const b = await res.json().catch(() => ({}));
      throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json();
  },

  deleteHouseholdThumbnail: (saveFileId: string, hId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/households/${hId}/thumbnail`, { method: 'DELETE' }),

  // Sims
  listSims: (saveFileId: string) =>
    request<Sim[]>(`/save-files/${saveFileId}/sims`),

  createSim: (saveFileId: string, data: {
    householdId?: string | null;
    firstName?: string;
    lastName?: string;
    gender?: SimGender;
    lifestage?: SimLifestage;
    species?: SimSpecies;
    petSubtype?: SimPetSubtype;
    petBreed?: string | null;
    occult?: SimOccult;
    isGhost?: boolean;
    notes?: string;
    sourceId?: string | null;
    lastImportedState?: object;
    traitIds?: string[];
    aspirationId?: string | null;
    recordStatus?: SimRecordStatus;
    deathCause?: string | null;
    enrolledDegree?: SimEnrolledDegree | null;
    career?: SimCareer | null;
    plannedSkillIds?: string[];
    plannedCareerUid?: string | null;
    plannedMoveHouseholdId?: string | null;
    skills?: { skillId: string; level: number; points: number }[];
  }) => request<Sim>(`/save-files/${saveFileId}/sims`, { method: 'POST', body: JSON.stringify(data) }),

  updateSim: (saveFileId: string, simId: string, data: {
    householdId?: string | null;
    firstName?: string;
    lastName?: string;
    gender?: SimGender;
    lifestage?: SimLifestage;
    species?: SimSpecies;
    petSubtype?: SimPetSubtype;
    petBreed?: string | null;
    occult?: SimOccult;
    isGhost?: boolean;
    notes?: string;
    lastImportedState?: object;
    traitIds?: string[];
    aspirationId?: string | null;
    recordStatus?: SimRecordStatus;
    deathCause?: string | null;
    enrolledDegree?: SimEnrolledDegree | null;
    career?: SimCareer | null;
    plannedSkillIds?: string[];
    plannedCareerUid?: string | null;
    plannedMoveHouseholdId?: string | null;
    skills?: { skillId: string; level: number; points: number }[]; // observed truth; wholesale-replaces sim_skills
  }) => request<{ ok: boolean }>(`/save-files/${saveFileId}/sims/${simId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteSim: (saveFileId: string, simId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/sims/${simId}`, { method: 'DELETE' }),

  // Family relationships (edges). PUT replaces all import-sourced edges
  // (re-sync current state); POST/DELETE manage manual edges.
  listRelationships: (saveFileId: string) =>
    request<SimRelationship[]>(`/save-files/${saveFileId}/relationships`),

  putRelationships: (saveFileId: string, edges: Array<{ simAId: string; simBId: string; relType: SimRelType }>) =>
    request<{ ok: boolean; count: number }>(`/save-files/${saveFileId}/relationships`, { method: 'PUT', body: JSON.stringify({ edges }) }),

  createManualRelationship: (saveFileId: string, edge: { simAId: string; simBId: string; relType: SimRelType }) =>
    request<SimRelationship>(`/save-files/${saveFileId}/relationships`, { method: 'POST', body: JSON.stringify(edge) }),

  deleteManualRelationship: (saveFileId: string, edgeId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/relationships/${edgeId}`, { method: 'DELETE' }),

  // Photos
  uploadPhoto: (formData: FormData): Promise<Photo> =>
    fetch(`${BASE}/photos/upload`, { method: 'POST', credentials: 'include', body: formData }).then(async (res) => {
      if (!res.ok) { if (res.status === 401) onUnauthorized?.(); const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`); }
      return res.json() as Promise<Photo>;
    }),

  listInspoPhotos: (saveFileId?: string) => {
    const qs = saveFileId ? `?saveFileId=${saveFileId}` : '';
    return request<Photo[]>(`/photos/inspo${qs}`);
  },

  listBuiltPhotos: (saveFileId: string, targetType: string, targetKey?: string) =>
    request<Photo[]>(`/photos/built?saveFileId=${saveFileId}&targetType=${targetType}${targetKey ? `&targetKey=${encodeURIComponent(targetKey)}` : ''}`),

  listBuiltLotPhotos: (saveFileId: string) =>
    request<Photo[]>(`/photos/built-lots?saveFileId=${saveFileId}`),

  // Sim portraits (one photo per sim, overlaid via assignments)
  listSimPortraits: (saveFileId: string) =>
    request<Array<{ simId: string; photoId: string; filename: string }>>(`/photos/sim-portraits?saveFileId=${saveFileId}`),

  setSimPortrait: (saveFileId: string, simId: string, photoId: string | null) =>
    request<{ ok: boolean }>(`/photos/sim-portrait`, { method: 'PUT', body: JSON.stringify({ saveFileId, simId, photoId }) }),

  updatePhotoCaption: (id: string, caption: string) =>
    request<{ ok: boolean }>(`/photos/${id}`, { method: 'PATCH', body: JSON.stringify({ caption }) }),

  updatePhotoMeta: (id: string, fields: { caption?: string; categories?: string[]; tags?: string[]; galleryCreator?: string | null }) =>
    request<{ ok: boolean }>(`/photos/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),

  // The inspo tag vocabulary is a real per-user list, not something derived
  // from whatever photos happen to carry. Every one of these returns the full
  // vocabulary back so the caller never has to guess the new state.
  listInspoTags: () => request<string[]>('/photos/tags'),

  createInspoTag: (name: string) =>
    request<string[]>('/photos/tags', { method: 'POST', body: JSON.stringify({ name }) }),

  renameInspoTag: (from: string, to: string) =>
    request<string[]>(`/photos/tags/${encodeURIComponent(from)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: to }),
    }),

  /** Removes the tag from the vocabulary AND off every photo carrying it. */
  deleteInspoTag: (name: string) =>
    request<string[]>(`/photos/tags/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  deletePhoto: (id: string) =>
    request<{ ok: boolean }>(`/photos/${id}`, { method: 'DELETE' }),

  assignPhoto: (id: string, saveFileId: string, targetType: string, targetKey: string) =>
    request<{ ok: boolean }>(`/photos/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ saveFileId, targetType, targetKey }),
    }),

  unassignPhoto: (id: string, saveFileId: string) =>
    request<{ ok: boolean }>(`/photos/${id}/assign/${saveFileId}`, { method: 'DELETE' }),

  // self-heal: report a legacy photo's intrinsic size from the loaded <img>
  setPhotoDimensions: (id: string, width: number, height: number) =>
    request<{ ok: boolean }>(`/photos/${id}/dimensions`, { method: 'POST', body: JSON.stringify({ width, height }) }),

  /**
   * The URL for a stored photo.
   *
   * `width` is the widest the image will ever be drawn, in CSS pixels — pass it
   * everywhere except a full-screen view. Retina doubles it here, so a 300px
   * tile should ask for 300, not 600. Aspect ratio is always preserved and the
   * image is never enlarged past the original, so an oversized request is
   * harmless rather than blurry.
   *
   * `format=auto` also serves WebP or AVIF to browsers that take it, which is
   * a further saving on top of the resize.
   *
   * ⚠ A resized response reports the RESIZED size to `img.naturalWidth`. The
   * self-heal in Photos.tsx / WorldInspo.tsx writes that number to
   * `photos.width`, so a backfilled row records the scaled dimensions rather
   * than the original. That is fine today — the column only feeds the masonry
   * `aspect-ratio`, which is identical either way — but do not start treating
   * that column as the true size of the file.
   */
  photoUrl: (filename: string, width?: number) => {
    // Snapped to a step (see WIDTH_STEPS) so surfaces share one URL — and one
    // download — for the same picture. Retina still doubles the step.
    const step = width ? photoWidthStep(width) : null;
    return step && CAN_RESIZE
      ? `${PHOTO_BASE}/cdn-cgi/image/width=${step * 2},quality=80,format=auto/${filename}`
      : `${PHOTO_BASE}/${filename}`;
  },

  // Clubs. leaderSimId/criteria/rules/inviteOnly are read-only game-truth fields,
  // set on import + refreshed by the silent re-sync pass (not edited in the UI).
  createClub: (saveFileId: string, data: { name: string; icon?: string; notes?: string; description?: string; memberSimIds?: string[]; leaderSimId?: string | null; criteria?: VenueCriterion[]; rules?: ParsedClubRule[]; inviteOnly?: boolean; hangoutVenueTypeId?: string | null; sourceId?: string | null; lastImportedState?: object }) =>
    request<Club>(`/save-files/${saveFileId}/clubs`, { method: 'POST', body: JSON.stringify(data) }),

  updateClub: (saveFileId: string, clubId: string, data: { name?: string; icon?: string; notes?: string; description?: string; memberSimIds?: string[]; leaderSimId?: string | null; criteria?: VenueCriterion[]; rules?: ParsedClubRule[]; inviteOnly?: boolean; hangoutVenueTypeId?: string | null; lastImportedState?: object }) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/clubs/${clubId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteClub: (saveFileId: string, clubId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/clubs/${clubId}`, { method: 'DELETE' }),

  assignClub: (saveFileId: string, clubId: string, lotKey: string) =>
    request<{ ok: boolean }>(
      `/save-files/${saveFileId}/clubs/${clubId}/assign/${encodeURIComponent(lotKey)}`,
      { method: 'POST' },
    ),

  unassignClub: (saveFileId: string, clubId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/clubs/${clubId}/assign`, { method: 'DELETE' }),

  // Small Businesses. Rich fields (employees/criteria/activities/fee/price/renown/
  // alignment/perks) are accepted on create + patch (import + re-sync + authoring).
  createSmallBusiness: (saveFileId: string, data: { name: string; icon?: string; notes?: string; description?: string; employeeSimIds?: string[]; customerCriteria?: SmallBusinessCustomerCriterion[]; activities?: { id: string; name: string }[]; feeMode?: SmallBusiness['feeMode']; priceModifierPct?: number; renownRank?: number | null; alignment?: number | null; perkPoints?: number; sourceId?: string | null; lastImportedState?: object }) =>
    request<SmallBusiness>(`/save-files/${saveFileId}/small-businesses`, { method: 'POST', body: JSON.stringify(data) }),

  updateSmallBusiness: (saveFileId: string, sbId: string, data: { name?: string; icon?: string; notes?: string; description?: string; ownerSimId?: string | null; employeeSimIds?: string[]; customerCriteria?: SmallBusinessCustomerCriterion[]; activities?: { id: string; name: string }[]; feeMode?: SmallBusiness['feeMode']; priceModifierPct?: number; renownRank?: number | null; alignment?: number | null; perkPoints?: number; assignedLotKeys?: string[]; lastImportedState?: object }) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/small-businesses/${sbId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSmallBusiness: (saveFileId: string, sbId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/small-businesses/${sbId}`, { method: 'DELETE' }),

  assignSmallBusiness: (saveFileId: string, sbId: string, lotKey: string) =>
    request<{ ok: boolean }>(
      `/save-files/${saveFileId}/small-businesses/${sbId}/assign/${encodeURIComponent(lotKey)}`,
      { method: 'POST' },
    ),

  // Remove a single lot from a multi-lot business.
  unassignSmallBusinessLot: (saveFileId: string, sbId: string, lotKey: string) =>
    request<{ ok: boolean }>(
      `/save-files/${saveFileId}/small-businesses/${sbId}/assign/${encodeURIComponent(lotKey)}`,
      { method: 'DELETE' },
    ),

  // Clear all lots.
  unassignSmallBusiness: (saveFileId: string, sbId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/small-businesses/${sbId}/assign`, { method: 'DELETE' }),

  // Holidays
  createHoliday: (saveFileId: string, data: { name: string; icon?: string; season?: string; day?: number; notes?: string; traditions?: string[]; unassigned?: boolean; timeOff?: boolean; decorationPreset?: string | null; sourceId?: string | null; scaledDates?: Record<string, { day: number; season: string }> | null; lastImportedState?: object }) =>
    request<Holiday>(`/save-files/${saveFileId}/holidays`, { method: 'POST', body: JSON.stringify(data) }),

  updateHoliday: (saveFileId: string, hId: string, data: { name?: string; icon?: string; season?: string; day?: number; notes?: string; traditions?: string[]; unassigned?: boolean; timeOff?: boolean; decorationPreset?: string | null; scaledDates?: Record<string, { day: number; season: string }> | null; lastImportedState?: object }) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/holidays/${hId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteHoliday: (saveFileId: string, hId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/holidays/${hId}`, { method: 'DELETE' }),

  createDynasty: (saveFileId: string, data: {
    name: string; description?: string; notes?: string;
    headSimId?: string | null; members?: DynastyMember[]; valueIds?: string[];
    crestBgHash?: string | null; crestFgHash?: string | null;
    prestige?: number | null; unity?: number | null; perkIds?: number[];
    allianceSourceIds?: string[]; rivalrySourceIds?: string[];
    sourceId?: string | null; lastImportedState?: object;
  }) =>
    request<Dynasty>(`/save-files/${saveFileId}/dynasties`, { method: 'POST', body: JSON.stringify(data) }),

  updateDynasty: (saveFileId: string, dId: string, data: {
    name?: string; notes?: string; description?: string;
    headSimId?: string | null; members?: DynastyMember[]; valueIds?: string[];
    crestBgHash?: string | null; crestFgHash?: string | null;
    prestige?: number | null; unity?: number | null; perkIds?: number[];
    allianceSourceIds?: string[]; rivalrySourceIds?: string[];
    lastImportedState?: object;
  }) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/dynasties/${dId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteDynasty: (saveFileId: string, dId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/dynasties/${dId}`, { method: 'DELETE' }),

  // Custom Venues. roles/slots are the parser's ParsedVenueRole[]/ParsedVenueSlot[]
  // arrays (sent as plain JSON; typed loosely here to avoid coupling api.ts to the
  // parser byte-format types).
  createCustomVenue: (saveFileId: string, data: { lotKey?: string | null; name?: string; venueSchedule?: string; notes?: string; roles?: unknown[]; slots?: unknown[]; source?: 'import' | 'planner'; isGetaway?: boolean; hostHouseholdId?: string | null; sourcePresetId?: string | null; lastImportedState?: object }) =>
    request<{ id: string; lotKey: string | null; name: string; venueSchedule: string; notes: string; roles: unknown[]; slots: unknown[]; source: 'import' | 'planner'; isGetaway: boolean; hostHouseholdId: string | null; sourcePresetId: string | null }>(
      `/save-files/${saveFileId}/custom-venues`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  updateCustomVenue: (saveFileId: string, cvId: string, data: { name?: string; venueSchedule?: string; notes?: string; roles?: unknown[]; slots?: unknown[]; lotKey?: string | null; isGetaway?: boolean; hostHouseholdId?: string | null; sourcePresetId?: string | null; lastImportedState?: object }) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/custom-venues/${cvId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCustomVenue: (saveFileId: string, cvId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/custom-venues/${cvId}`, { method: 'DELETE' }),

  // Replace the save's import-sourced preset library (schedules + standalone roles).
  // Called on import/re-sync; presets are read-only reference data.
  replaceCustomVenuePresets: (saveFileId: string, data: { schedules: unknown[]; roles: unknown[] }) =>
    request<{ ok: boolean; count: number }>(`/save-files/${saveFileId}/custom-venue-presets`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Save one planner-authored preset ("Save as preset"). Survives re-sync.
  createCustomVenuePreset: (saveFileId: string, data: { kind: 'schedule' | 'role'; name: string; data: unknown }) =>
    request<{ id: string }>(`/save-files/${saveFileId}/custom-venue-presets`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCustomVenuePreset: (saveFileId: string, presetId: string, data: { name?: string; data?: unknown }) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/custom-venue-presets/${presetId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteCustomVenuePreset: (saveFileId: string, presetId: string) =>
    request<{ ok: boolean }>(`/save-files/${saveFileId}/custom-venue-presets/${presetId}`, { method: 'DELETE' }),

  // Mods
  listMods: (saveFileId?: string) => {
    const qs = saveFileId ? `?saveFileId=${saveFileId}` : '';
    return request<Mod[]>(`/mods${qs}`);
  },

  createMod: (data: { name: string; url?: string; type?: string; importance?: string; notes?: string }) =>
    request<Mod>('/mods', { method: 'POST', body: JSON.stringify(data) }),

  updateMod: (modId: string, data: { name?: string; url?: string; type?: string; importance?: string; notes?: string }) =>
    request<{ ok: boolean }>(`/mods/${modId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteMod: (modId: string) =>
    request<{ ok: boolean }>(`/mods/${modId}`, { method: 'DELETE' }),

  excludeMod: (modId: string, saveFileId: string) =>
    request<{ ok: boolean }>(`/mods/${modId}/exclude/${saveFileId}`, { method: 'POST' }),

  unexcludeMod: (modId: string, saveFileId: string) =>
    request<{ ok: boolean }>(`/mods/${modId}/exclude/${saveFileId}`, { method: 'DELETE' }),

  /**
   * Record how an import or re-sync attempt ended — successes and failures
   * alike. Parsing and applying happen in the browser, so this is the only
   * thing that knows.
   *
   * ★ Returns void and swallows everything, deliberately. It is called from
   * inside the import's own success and failure paths, and a logging failure
   * must never be able to fail an import or replace the error a player is
   * actually looking at. Nothing awaits it.
   */
  logImportEvent: (data: {
    saveFileId?: string | null;
    kind: 'import' | 'resync';
    ok: boolean;
    errorSummary?: string | null;
    simCount?: number | null;
    durationMs?: number | null;
  }): void => {
    void request<{ ok: boolean }>('/import-events', {
      method: 'POST',
      body: JSON.stringify(data),
    }).catch(() => {});
  },

  /**
   * "Someone used this button today." Only for the few actions the database
   * can't infer on its own — above all the randomizer, whose output is
   * byte-identical to a hand-built household.
   *
   * ★ Void and silent, like logImportEvent. Nothing awaits it and no failure
   * of it can reach a user; a tally is never worth interrupting the thing it
   * is counting. The feature name must be in TRACKED_FEATURES server-side.
   */
  logFeatureEvent: (
    feature:
      | 'randomizer_save' | 'portrait_sync' | 'lot_status' | 'inspo_upload' | 'tag_created'
      | 'first_stop_world' | 'first_stop_sims' | 'first_stop_households'
      | 'first_stop_family' | 'first_stop_photos' | 'first_stop_other',
  ): void => {
    void request<{ ok: boolean }>('/feature-events', {
      method: 'POST',
      body: JSON.stringify({ feature }),
    }).catch(() => {});
  },

  // Photo exclusions
  excludePhoto: (id: string, saveFileId: string) =>
    request<{ ok: boolean }>(`/photos/${id}/exclude/${saveFileId}`, { method: 'POST' }),

  unexcludePhoto: (id: string, saveFileId: string) =>
    request<{ ok: boolean }>(`/photos/${id}/exclude/${saveFileId}`, { method: 'DELETE' }),
};
