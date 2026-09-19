/**
 * Pack ownership — which Sims 4 packs the user has access to. Drives content
 * filtering (worlds, traits, aspirations, venues, sidebar entries).
 *
 * Resolution model:
 *   - Default state when nothing has been imported and no overrides set:
 *     every pack reads as owned. New users have zero friction; the planner
 *     shows the full library.
 *   - Once any save is imported, `autoDetected` becomes the active inferred
 *     set (union across all imports). isOwned() then gates on membership.
 *   - Manual overrides (Force on / Force off) trump the auto-detected set.
 *     These are the user's escape hatch for advanced cases — a save creator
 *     who has blowtorched their save and wants to override the inference.
 *
 * Persistence is server-side: state is stored on the user row in JSONB and
 * survives across devices. App.tsx subscribes to auth and calls hydrate()
 * whenever the user changes. Mutations write through to the server with a
 * short debounce so a flurry of toggles batches into one round-trip.
 */
import { create } from 'zustand';
import { api } from '../lib/api';

export type OverrideState = 'on' | 'off';

interface PackOwnershipState {
  /** Per-pack manual overrides. Keys not present → "auto" (default behavior). */
  manualOverrides: Record<string, OverrideState>;
  /** Pack IDs inferred from save imports. Empty array = no imports happened yet. */
  autoDetected: string[];
  /** ISO timestamp of the last auto-detect run (drives the settings page badge). */
  lastDetectedAt: string | null;
  /** True while the initial hydrate is in flight. UI can show a skeleton if needed. */
  hydrating: boolean;
  /** Whose state is currently loaded. Lets hydrate() short-circuit if invoked twice for the same user. */
  loadedForUserId: string | null;

  /** Returns true if the pack should be treated as owned. */
  isOwned: (packId: string) => boolean;
  /** Fetch state for the given user (or reset to empty when null). Idempotent. */
  hydrate: (userId: string | null) => Promise<void>;
  /** Set, clear, or update a manual override. Passing null removes it (returns to auto). */
  setOverride: (packId: string, state: OverrideState | null) => void;
  /** Replace the entire auto-detected set (e.g. "Re-detect from all saves" button). */
  setAutoDetected: (packIds: string[]) => void;
  /** Add packs to the auto-detected set (e.g. single save import). Union is non-destructive. */
  unionAutoDetected: (packIds: string[]) => void;
  /** Drop the manual On/Off switches, keeping what imports detected. The
   *  everyday "undo my corrections" — every pack returns to Auto. */
  clearOverrides: () => void;
  /** Wipe all state — including overrides. Used by a settings "Reset to defaults" affordance. */
  reset: () => void;
}

// Debounced server write. Each mutation kicks the timer; multiple changes in
// rapid succession batch into one PUT. 400ms feels snappy yet still amortizes
// well across a flurry of Pack Settings toggles.
const SAVE_DEBOUNCE_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(getSnapshot: () => Pick<PackOwnershipState, 'manualOverrides' | 'autoDetected' | 'lastDetectedAt' | 'loadedForUserId'>) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const s = getSnapshot();
    // Never write back if we don't have a logged-in user — avoids storing
    // anonymous-session state under whoever logs in next.
    if (!s.loadedForUserId) return;
    api.setPackOwnership({
      manualOverrides: s.manualOverrides,
      autoDetected: s.autoDetected,
      lastDetectedAt: s.lastDetectedAt,
    }).catch((err) => {
      // Don't surface — the next mutation will retry. Logged for dev debugging.
      console.error('pack ownership save failed', err);
    });
  }, SAVE_DEBOUNCE_MS);
}

export const usePackOwnership = create<PackOwnershipState>()((set, get) => ({
  manualOverrides: {},
  autoDetected: [],
  lastDetectedAt: null,
  hydrating: false,
  loadedForUserId: null,

  isOwned: (packId) => {
    // Base game content is always available.
    if (packId === 'base') return true;
    const { manualOverrides, autoDetected } = get();
    const ov = manualOverrides[packId];
    if (ov === 'on') return true;
    if (ov === 'off') return false;
    // No override → fall back to auto-detect.
    // If nothing has been auto-detected yet (no save imports), default to all owned.
    if (autoDetected.length === 0) return true;
    return autoDetected.includes(packId);
  },

  hydrate: async (userId) => {
    if (get().loadedForUserId === userId) return;
    if (userId === null) {
      // Logged out — clear state. No server fetch.
      set({ manualOverrides: {}, autoDetected: [], lastDetectedAt: null, loadedForUserId: null });
      return;
    }
    set({ hydrating: true });
    try {
      const data = await api.getPackOwnership();
      set({
        manualOverrides: data.manualOverrides ?? {},
        autoDetected: Array.isArray(data.autoDetected) ? data.autoDetected : [],
        lastDetectedAt: data.lastDetectedAt ?? null,
        hydrating: false,
        loadedForUserId: userId,
      });
    } catch (err) {
      // On fetch failure leave state empty (default-all-owned). Logged for
      // diagnosis; user can still toggle things, and the next mutation will
      // attempt a write.
      console.error('pack ownership hydrate failed', err);
      set({ hydrating: false, loadedForUserId: userId });
    }
  },

  setOverride: (packId, state) => {
    set((s) => {
      const next = { ...s.manualOverrides };
      if (state === null) delete next[packId];
      else next[packId] = state;
      return { manualOverrides: next };
    });
    scheduleSave(get);
  },

  setAutoDetected: (packIds) => {
    set({
      autoDetected: [...new Set(packIds)].sort(),
      lastDetectedAt: new Date().toISOString(),
    });
    scheduleSave(get);
  },

  unionAutoDetected: (packIds) => {
    set((s) => ({
      autoDetected: [...new Set([...s.autoDetected, ...packIds])].sort(),
      lastDetectedAt: new Date().toISOString(),
    }));
    scheduleSave(get);
  },

  clearOverrides: () => {
    set({ manualOverrides: {} });
    scheduleSave(get);
  },

  reset: () => {
    set({ manualOverrides: {}, autoDetected: [], lastDetectedAt: null });
    scheduleSave(get);
  },
}));
