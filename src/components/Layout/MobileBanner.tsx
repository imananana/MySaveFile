import { useState, useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { iconBtn } from '../common/btn';

const DISMISS_KEY = 'mobile-banner-dismissed';

/**
 * Persistent banner shown only on narrow viewports inside the authenticated
 * planner. The planner UI is desktop-first (fixed 240px sidebar, side-by-side
 * detail panes), so on phones we tell the user up front and let them dismiss.
 * Dismissal persists in localStorage so we don't nag every visit.
 *
 * The two exceptions where we DO want mobile to work — Inspo upload (so users
 * can add photos from their phone gallery) and Public Showcase (the read-only
 * share link) — have their own responsive layouts and bypass this banner.
 */
export function MobileBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Real touch phones only (narrow + coarse pointer). A resized desktop browser
    // keeps a fine pointer, so it never shows the banner at any window width.
    const mq = window.matchMedia('(max-width: 639.98px) and (pointer: coarse)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (!isMobile || dismissed) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div className="bg-c-card border-b border-c-border px-4 py-2 flex items-start gap-2 text-[12px] text-c-muted">
      <svg className="w-4 h-4 mt-0.5 shrink-0 text-c-gold" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 1.5L1.5 14h13L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M8 6v4M8 12v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
      <span className="flex-1 leading-snug">
        MySaveFile is desktop-first. You can browse and add inspo photos from your phone, but the editing tools open best on a computer.
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss banner"
        className={iconBtn(7)}
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
