import { useEffect, useRef } from 'react';

/**
 * Escape closes the topmost open overlay.
 *
 * Two things make this worth a shared hook rather than a `useEffect` per modal:
 *
 * **Nesting.** A picker opened from inside another modal sits at the SAME
 * z-index as its parent (both z-300, both portaled — order is DOM append
 * order). If every modal bound its own document listener, one Escape would
 * close the picker AND the form behind it. So registrations go on a stack and
 * only the top entry responds.
 *
 * **Commit-on-blur.** Several editors have no Save button — the lot editor,
 * the photo caption modals — and save a text field when it loses focus. The
 * footer literally says "Changes are saved automatically". Clicking the
 * backdrop blurs the field first, so the save fires; Escape doesn't, so
 * without the blur below, Escape would quietly drop whatever you'd typed.
 *
 * Pass `enabled: false` for states that must not be dismissable at all —
 * mid-upload, mid-import — the same way those modals already guard their
 * backdrop and X.
 */

type Entry = { close: () => void };

const stack: Entry[] = [];
let bound = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  const top = stack[stack.length - 1];
  if (!top) return;

  // A pop-out menu inside a modal owns Escape first and stops it there, so by
  // the time we see it there's nothing open but the overlay itself.
  e.stopPropagation();

  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
    el.blur();          // fire any commit-on-blur handler before we unmount it
  }
  top.close();
}

export function useEscapeToClose(close: () => void, enabled = true) {
  // Held in a ref so the effect doesn't re-run — and therefore doesn't
  // re-order the stack — every time the parent re-renders with a fresh
  // closure. Only `enabled` flipping should ever re-register.
  const latest = useRef(close);
  latest.current = close;

  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = { close: () => latest.current() };
    stack.push(entry);
    if (!bound) {
      document.addEventListener('keydown', onKeyDown);
      bound = true;
    }
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [enabled]);
}
