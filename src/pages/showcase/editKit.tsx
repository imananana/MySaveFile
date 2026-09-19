// Small shared pieces of the showcase's editing grammar:
// dashed-purple editable text (commit on blur), drag-the-tile reordering,
// and the pop-out picker (scrim + panel, the app's pop-out family).

import { useCallback, useMemo, useRef, useState } from 'react';

// ── editable text ──────────────────────────────────────────────────────────
// contentEditable, committed on blur (auto-save model — no Save button).
// Enter commits single-line fields; Escape reverts. The element remounts on
// value change (key), so React never fights the browser over the text.

export function EditableText({ value, placeholder, onCommit, className, tag = 'div', style, elRef, onInput, spellCheck }: {
  value: string;
  placeholder: string;
  onCommit: (next: string) => void;
  className?: string;
  tag?: 'div' | 'h1' | 'p' | 'span';
  style?: React.CSSProperties;
  /** The rendered element, for callers that must measure or restyle it. */
  elRef?: React.RefObject<HTMLElement | null>;
  /** Live text on every keystroke — for display type that has to re-fit. */
  onInput?: (text: string, el: HTMLElement) => void;
  /** Off for display faces: red squiggles under a giant cover title look broken. */
  spellCheck?: boolean;
}) {
  const Tag = tag as 'div';
  const commit = useCallback((el: HTMLElement) => {
    // innerText is the text AS RENDERED, so a CSS text-transform would be
    // written back as data: typing "Willow Creek Legacy" into the postcard's
    // uppercase cover title stored "WILLOW CREEK LEGACY" — the save's real
    // name, its slug and every planner screen, permanently shouted. Read it
    // with the transform off so what's committed is what was typed. (innerText
    // still beats textContent here: it keeps the line breaks in a blurb.)
    const previous = el.style.textTransform;
    el.style.textTransform = 'none';
    const next = (el.innerText ?? '').replace(/\n+$/, '').trim();
    el.style.textTransform = previous;
    if (next !== value) onCommit(next);
  }, [value, onCommit]);
  return (
    <Tag
      key={value}
      ref={elRef as React.RefObject<HTMLDivElement> | undefined}
      className={`sc-editable ${className ?? ''}`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={spellCheck}
      // The placeholder is CSS (:empty::before), never text content — typing
      // must land in an EMPTY element, not inside the placeholder words.
      data-sc-placeholder={placeholder}
      onInput={onInput ? (e) => onInput(e.currentTarget.innerText ?? '', e.currentTarget) : undefined}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && tag !== 'p' && tag !== 'div') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
        if (e.key === 'Escape') { e.currentTarget.innerText = value; (e.currentTarget as HTMLElement).blur(); }
      }}
    >
      {value || null}
    </Tag>
  );
}

// ── straight-to-your-files upload ──────────────────────────────────────────
// A hidden file input + an open() you wire to any chip. No picker of
// pre-added photos anywhere — uploading here always means "from my files".

export function useFilePick(onFile: (file: File) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      style={{ display: 'none' }}
      onChange={(e) => {
        const f = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (f) onFile(f);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

// ── drag-the-tile reordering ───────────────────────────────────────────────
// Pointer-based sortable, not HTML5 drag — the tile follows the cursor and
// the other tiles slide apart to open the gap, so anywhere you let go lands
// in the slot the gap shows (HTML5 dnd only dropped when the cursor sat
// exactly on another tile's box, which read as broken).
//
// Two prop sets per index: spread `item(i)` on the CARD (the box that
// occupies the grid slot) and `handle(i)` on the grab surface inside it —
// the same element when the whole card drags. A real drag never fires the
// click underneath it; a sub-6px wobble stays a click.

export interface SortableProps {
  item: (i: number) => Record<string, unknown>;
  handle: (i: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
}

export function useSortable(onMove: (from: number, to: number) => void): SortableProps {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  return useMemo(() => ({
    item: (i: number) => ({ 'data-sc-item': i }),
    handle: () => ({
      style: { touchAction: 'none' } as React.CSSProperties,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const handleEl = e.currentTarget as HTMLElement;
        const itemEl = (handleEl.closest('[data-sc-item]') ?? handleEl) as HTMLElement;
        const container = itemEl.parentElement;
        if (!container) return;
        const startX = e.clientX, startY = e.clientY;
        const pid = e.pointerId;
        let started = false;
        let items: HTMLElement[] = [];
        let rects: DOMRect[] = [];
        let fromIdx = -1, toIdx = -1;

        const begin = () => {
          items = (Array.from(container.children) as HTMLElement[])
            .filter((el) => el.hasAttribute('data-sc-item'));
          rects = items.map((el) => el.getBoundingClientRect());
          fromIdx = items.indexOf(itemEl);
          toIdx = fromIdx;
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
          for (const el of items) el.style.transition = 'transform .18s ease';
          itemEl.style.transition = 'none';
          itemEl.style.position = 'relative'; // z-index needs a positioned box
          itemEl.style.zIndex = '60';
          itemEl.style.pointerEvents = 'none';
          started = true;
        };

        const move = (ev: PointerEvent) => {
          if (ev.pointerId !== pid) return;
          const dx = ev.clientX - startX, dy = ev.clientY - startY;
          if (!started) {
            if (Math.hypot(dx, dy) < 6) return;
            begin();
            if (fromIdx === -1) return;
          }
          ev.preventDefault();
          itemEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.02)`;
          // Target slot = whichever tile's centre the dragged tile's centre
          // is nearest — the whole grid is a valid drop, gaps included.
          const r = rects[fromIdx];
          const cx = r.left + r.width / 2 + dx, cy = r.top + r.height / 2 + dy;
          let best = fromIdx, bestD = Infinity;
          rects.forEach((rr, j) => {
            const d = Math.hypot(rr.left + rr.width / 2 - cx, rr.top + rr.height / 2 - cy);
            if (d < bestD) { bestD = d; best = j; }
          });
          if (best !== toIdx) {
            toIdx = best;
            items.forEach((el, j) => {
              if (el === itemEl) return;
              let slot = j;
              if (fromIdx < toIdx && j > fromIdx && j <= toIdx) slot = j - 1;
              else if (toIdx < fromIdx && j >= toIdx && j < fromIdx) slot = j + 1;
              el.style.transform = slot === j ? ''
                : `translate(${rects[slot].left - rects[j].left}px, ${rects[slot].top - rects[j].top}px)`;
            });
          }
        };

        const up = (ev: PointerEvent) => {
          if (ev.pointerId !== pid) return;
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          if (!started) return;
          // The click that follows a real drag must not open anything. The
          // suppressor lives for one task only, so it can never eat a later,
          // unrelated click if the browser skips the post-drag click.
          const swallow = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault(); };
          addEventListener('click', swallow, { capture: true });
          setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          for (const el of items) { el.style.transition = ''; el.style.transform = ''; }
          itemEl.style.position = ''; itemEl.style.zIndex = ''; itemEl.style.pointerEvents = '';
          // Cleared transforms + the reorder land in the same paint: the
          // preview slots ARE the final slots, so nothing visibly jumps.
          if (toIdx !== fromIdx && fromIdx !== -1) onMoveRef.current(fromIdx, toIdx);
        };

        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      },
    }),
  }), []);
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

// ── pop-out picker (scrim + panel) ─────────────────────────────────────────

export function PickerPopout({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="sc-pickPanel" onClick={(e) => e.stopPropagation()}>{children}</div>
    </>
  );
}

export function usePickerState() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) };
}
