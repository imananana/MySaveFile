import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WarningCircle, Info, X } from '@phosphor-icons/react';
import { useToast, type Toast } from '../../store/useToast';
import { iconBtn } from './btn';

const DISMISS_AFTER = 6000;

/**
 * The app's only "that didn't work" surface. Mounted once, in App.
 *
 * Bottom-right: the top-right already holds My Saves and the account menu, and
 * the bottom-LEFT is the sidebar's own column — a toast there would sit on the
 * world list rather than on empty space.
 *
 * Portaled to body and pitched above every overlay — uploads happen from inside
 * modals (set a sim's photo, household built photos), so a toast that lost to a
 * modal's scrim would be invisible exactly when it's needed.
 */
function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useToast((s) => s.dismiss);

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), DISMISS_AFTER);
    return () => clearTimeout(t);
  }, [toast.id, dismiss]);

  const isError = toast.tone === 'error';
  const Icon = isError ? WarningCircle : Info;

  return (
    <div
      /* A white card with a coloured rail, not a coloured fill: the grammar
         reserves fills for state you chose, and nobody chose this. */
      className={`toast-enter flex items-start gap-2.5 w-[min(22rem,calc(100vw-2rem))] bg-c-card border rounded-xl shadow-2xl px-3.5 py-3 border-l-4 ${
        isError ? 'border-c-red-border border-l-c-red' : 'border-c-border border-l-c-secondary'
      }`}
      role="status"
      aria-live="polite"
    >
      <Icon size={17} weight="bold" className={`shrink-0 mt-px ${isError ? 'text-c-red' : 'text-c-secondary'}`} />
      <p className="text-[13px] text-c-text leading-snug m-0 flex-1 min-w-0">{toast.message}</p>
      <button onClick={() => dismiss(toast.id)} aria-label="Dismiss" className={iconBtn(6)}>
        <X size={13} weight="bold" />
      </button>
    </div>
  );
}

export function ToastHost() {
  const toasts = useToast((s) => s.toasts);
  if (!toasts.length) return null;
  return createPortal(
    // pointer-events-none on the stack, auto on each row: an empty column of
    // toasts must never eat clicks meant for the page underneath it.
    <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastRow toast={t} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
