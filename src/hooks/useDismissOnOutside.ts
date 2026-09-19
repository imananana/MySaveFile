import { useEffect, type RefObject } from 'react';

/**
 * Close a pop-out when the click lands anywhere outside it.
 *
 * Replaces the "invisible full-screen div behind the menu" trick, which the tag
 * and file menus were using. That trick works only if the div actually sits on
 * top of everything it needs to catch — and these were at z-10, while the
 * sidebar is at z-100. So clicking the sidebar's Manage/Tools/Worlds headers
 * went to the sidebar and the menu stayed open behind you. Verified, not
 * assumed: the catcher survived the click.
 *
 * Raising the number wouldn't be a real fix. A z-index only competes inside its
 * own stacking context, so any ancestor with a transform or a z of its own puts
 * the whole thing back out of reach — the same trap that hides broken modal
 * backdrops. A document listener has no such problem: it fires wherever the
 * click happened.
 *
 * This is the pattern the shared Dropdown already uses.
 */
export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onDismiss();
    }
    // mousedown, not click: a click that starts inside the menu and ends
    // outside it (a drag off a row) shouldn't count as clicking away.
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [ref, onDismiss, active]);
}
