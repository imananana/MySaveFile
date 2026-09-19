// A save's name is on screen in several places at once — the planner's top
// bar, the dashboard, Save settings, and the showcase (cover art, page title,
// the slug) — and it can be renamed from any of them, in any tab. Renaming
// used to update only the surface it was typed on, so the rest of the app
// kept showing the old name until a reload.
//
// Every rename now announces itself here. Listeners in the same tab are
// updated directly by whoever made the change (no round trip); this channel
// carries it to the OTHER tabs. Tabs that were asleep — or a browser without
// BroadcastChannel — catch up on their next visibility check instead.

const CHANNEL_NAME = 'msf-save-rename';

export interface SaveRenamed {
  saveFileId: string;
  name: string;
}

// One channel object per tab. A BroadcastChannel never delivers to the object
// that posted, which is exactly right: the posting tab has already updated
// itself in place.
const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);

export function announceSaveRename(saveFileId: string, name: string): void {
  channel?.postMessage({ saveFileId, name } as SaveRenamed);
}

/** Subscribe to renames made in other tabs. Returns an unsubscribe. */
export function onSaveRenamed(handler: (msg: SaveRenamed) => void): () => void {
  if (!channel) return () => {};
  const listener = (e: MessageEvent<SaveRenamed>) => {
    if (e.data && e.data.saveFileId && typeof e.data.name === 'string') handler(e.data);
  };
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

/**
 * Run `check` when this tab comes back to the foreground — the catch-up path
 * for a rename this tab's channel never heard (asleep, another device, or no
 * BroadcastChannel). Coalesced, because focus and visibilitychange both fire
 * on a tab switch.
 */
export function onTabVisible(check: () => void, minGapMs = 1500): () => void {
  let last = 0;
  const run = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - last < minGapMs) return;
    last = now;
    check();
  };
  document.addEventListener('visibilitychange', run);
  window.addEventListener('focus', run);
  return () => {
    document.removeEventListener('visibilitychange', run);
    window.removeEventListener('focus', run);
  };
}
