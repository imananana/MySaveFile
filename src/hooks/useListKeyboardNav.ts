import { useEffect, useRef } from 'react';

/**
 * Arrow-key navigation for a manager's left-panel list. ↑/↓ move the selection
 * through `items` (clamped — no wrap), and the currently-selected row is scrolled
 * into view. Selecting in these managers already opens the detail pane, so there's
 * no separate "open" step; pass `onEnter` if a screen wants Enter to do something
 * extra (e.g. focus the editor).
 *
 * Keystrokes are ignored while the user is typing in a field (input/textarea/
 * select/contenteditable) so the search box and editor inputs keep their own
 * arrow/Enter behavior. Pass `enabled: false` to suspend nav (e.g. while a modal
 * is open).
 */
export function useListKeyboardNav<T>(opts: {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  getId?: (item: T) => string;
  enabled?: boolean;
  onEnter?: (id: string) => void;
}): void {
  const { items, selectedId, onSelect, getId = (it: T) => (it as { id: string }).id, enabled = true, onEnter } = opts;

  // Keep the latest values in a ref so the listener (registered once) always
  // sees fresh state without re-binding on every render.
  const ref = useRef({ items, selectedId, onSelect, getId, onEnter });
  ref.current = { items, selectedId, onSelect, getId, onEnter };

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Don't hijack typing or any other shortcut target.
      const el = document.activeElement as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return;
      }

      const { items, selectedId, onSelect, getId, onEnter } = ref.current;
      if (items.length === 0) return;

      const ids = items.map(getId);
      const idx = selectedId ? ids.indexOf(selectedId) : -1;

      if (e.key === 'Enter') {
        if (onEnter && selectedId) {
          e.preventDefault();
          onEnter(selectedId);
        }
        return;
      }

      let next: number;
      if (e.key === 'ArrowDown') {
        next = idx < 0 ? 0 : Math.min(idx + 1, ids.length - 1);
      } else {
        next = idx < 0 ? ids.length - 1 : Math.max(idx - 1, 0);
      }
      if (next === idx) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      onSelect(ids[next]);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  // Scroll the selected row into view as it changes (covers both arrow-key and
  // click selection). Rows opt in with `data-listnav-id={id}`.
  useEffect(() => {
    if (!selectedId) return;
    const row = document.querySelector(`[data-listnav-id="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);
}
