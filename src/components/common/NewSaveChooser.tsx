import { X, DownloadSimple } from '@phosphor-icons/react';
import { btn, iconBtn } from './btn';
import { useEscapeToClose } from './useEscapeToClose';

/**
 * "How do you want to start this save?" — import, or begin empty.
 *
 * There were two hand-built copies of this: one on the saves page and one in
 * the top bar. They had different copy, different buttons, one had a close and
 * a subtitle and the other didn't, and only one of them gave importing any
 * visual weight. Same question, two answers, depending on which door you came
 * through.
 *
 * The two call sites still differ in what "blank" DOES — the saves page opens a
 * name form, the top bar creates one immediately — so that stays a callback.
 * Everything a user can see is here.
 *
 * ★ Importing leads on purpose. It's the whole point of the product and it
 * saves someone hours of typing, so it gets the green ground and the icon while
 * Start blank stays quiet. Two identical cards made the choice read as a
 * coin-flip between equal options, which it isn't.
 */
export function NewSaveChooser({
  onImport,
  onBlank,
  onClose,
  blankBusy = false,
}: {
  onImport: () => void;
  onBlank: () => void;
  onClose: () => void;
  /** Top bar creates the save inline, so it needs a pending state. */
  blankBusy?: boolean;
}) {
  useEscapeToClose(onClose);
  return (
    <div
      className="fixed inset-0 bg-black/75 z-[500] flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[440px] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex items-center justify-between">
          <h2 className="text-base font-bold text-c-text tracking-headline m-0">New save file</h2>
          <button onClick={onClose} aria-label="Close" className={iconBtn(8)}><X size={16} weight="bold" /></button>
        </div>

        <div className="p-5 flex flex-col gap-3 bg-c-base">
          <button
            onClick={onImport}
            className="text-left p-4 rounded-xl border border-c-accent-border bg-c-accent-soft hover:border-c-accent transition-colors flex items-start gap-3 cursor-pointer"
          >
            <DownloadSimple size={20} weight="bold" className="text-c-green shrink-0 mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-c-green">Import from Sims 4 save</span>
              <span className="block text-xs text-c-muted mt-0.5">Pulls in your lots, households and sims automatically</span>
            </span>
          </button>

          <button
            onClick={onBlank}
            disabled={blankBusy}
            className="text-left p-4 rounded-xl border border-c-border bg-c-card hover:border-c-accent transition-colors disabled:opacity-50 cursor-pointer"
          >
            <span className="block text-sm font-semibold text-c-text">{blankBusy ? 'Creating…' : 'Start blank'}</span>
            <span className="block text-xs text-c-muted mt-0.5">Plan by hand now, link a save file any time later</span>
          </button>
        </div>

        <div className="px-5 py-3 border-t border-c-border flex justify-end">
          <button onClick={onClose} className={btn('ghost')}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
