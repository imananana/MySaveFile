import { ReactNode, useRef, useState, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover/focus tooltip rendered via React Portal so it escapes any ancestor
 * `overflow-hidden` (e.g. dropdown menus, modal bodies, scroll containers).
 *
 * Pure CSS hover-state would clip inside parents with overflow constraints, so
 * we track visibility in state, compute the position from the trigger's
 * bounding rect, and render the bubble into document.body.
 */
export function Tooltip({
  text,
  children,
  side = 'bottom',
  wrap = false,
  display = 'inline-flex',
}: {
  /**
   * Optional so a caller can say "explain this only sometimes" — the common
   * case being a disabled control that needs to give its reason ("Set an owner
   * first") and nothing at all once it's enabled. Empty or undefined renders
   * the children bare, with no wrapper and no hover behaviour.
   */
  text?: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  /** Allow multi-line wrapping for sentence-length text (default keeps one line). */
  wrap?: boolean;
  /**
   * Display mode for the wrapper span. `inline-flex` suits a button or chip and
   * is the default; pass `block` for anything that must keep its full width,
   * like a sidebar nav row — an inline-flex wrapper would shrink it to its text
   * and break the row's hit area.
   */
  display?: 'inline-flex' | 'block';
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const showTimer = useRef<number | null>(null);

  function clearShowTimer() {
    if (showTimer.current != null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }

  function onEnter() {
    clearShowTimer();
    showTimer.current = window.setTimeout(() => setVisible(true), 300);
  }
  function onLeave() {
    clearShowTimer();
    setVisible(false);
  }

  // Recompute position whenever the tooltip becomes visible. Uses fixed
  // coordinates so window scroll doesn't drift it off the trigger.
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const top = side === 'top' ? rect.top - 6 : rect.bottom + 6;
    const left = rect.left + rect.width / 2;
    setPos({ top, left });
  }, [visible, side]);

  // Tear down the show timer on unmount so it can't fire after the trigger
  // disappears (e.g. dropdown closes mid-hover).
  useEffect(() => () => clearShowTimer(), []);

  // Nothing to say → don't add a wrapper element at all. Hooks above have
  // already run, so this early return is safe.
  if (!text) return <>{children}</>;

  return (
    <>
      <span
        ref={triggerRef}
        className={`relative ${display}`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
      >
        {children}
      </span>
      {visible && pos && createPortal(
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: `translate(-50%, ${side === 'top' ? '-100%' : '0'})`,
            zIndex: 9999,
          }}
          className={`pointer-events-none rounded-md bg-c-card text-c-text border border-c-border shadow-md text-[11px] font-medium px-2 py-[3px] ${wrap ? 'whitespace-normal max-w-[240px] text-center leading-snug' : 'whitespace-nowrap'}`}
        >
          {text}
        </span>,
        document.body,
      )}
    </>
  );
}
