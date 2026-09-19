import type { ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { btn, iconBtn } from '../common/btn';

/**
 * The shell every step of the import flow sits in.
 *
 * Brought in line with the rest of the app's dialogs: a header band, a body on
 * the app's own ground, and an optional pinned footer. Previously it was a
 * single padded box — title, content and actions all on one white sheet — so
 * the import flow was the only place in the product that didn't look like the
 * product.
 *
 * The `footer` slot exists because the review step used to pin its actions with
 * `sticky bottom-0 -mx-6 -mb-6`, reaching out through this component's padding
 * to fake a footer. That worked but broke the moment the padding changed.
 */
export function ModalShell({
  children,
  onClose,
  title,
  wide,
  hideClose,
  footer,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
  hideClose?: boolean;
  /** Pinned action row. Stays put while the body scrolls. */
  footer?: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/75 z-[500] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget && !hideClose) onClose(); }}
    >
      <div className={`bg-c-card border border-c-border shadow-2xl rounded-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[85vh] flex flex-col overflow-hidden`}>
        <div className="px-5 py-4 border-b border-c-border flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-c-text tracking-headline m-0">{title}</h2>
          {!hideClose && (
            <button onClick={onClose} aria-label="Close" className={iconBtn(8)}>
              <X size={16} weight="bold" />
            </button>
          )}
        </div>

        <div className="p-5 overflow-y-auto flex-1 bg-c-base">{children}</div>

        {footer && (
          <div className="px-5 py-3 border-t border-c-border flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Cancel, exactly as every other dialog footer spells it. */
export function ModalCancel({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className={btn('ghost')}>Cancel</button>;
}
