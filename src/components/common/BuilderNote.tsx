import { useState } from 'react';
import { X } from '@phosphor-icons/react';

/**
 * A note from the builder — announces what's new and asks for feedback in the
 * same breath. One card, on /saves. (A slim in-planner banner variant existed
 * and was removed on purpose; the top-bar slot is reserved for a survey link.)
 *
 * This is the ONLY feedback channel we run (the privacy policy allows
 * feedback requests and nothing else). One campaign at a time: bump NOTE_ID
 * when there's something new to say and the note returns for everyone.
 */
const NOTE_ID = 'showcase-2026-09';
const STORAGE_KEY = 'msf-builder-note-dismissed';

/**
 * The note retires ITSELF on this date — after it, nothing renders, dismissed
 * or not, deployed or not. A campaign should not depend on someone remembering
 * to remove it. Set a fresh expiry with every NOTE_ID bump.
 */
const EXPIRES_AT = Date.parse('2026-09-18T00:00:00');

const FEEDBACK_EMAIL = 'iman@mysavefile.com';
const MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('MySaveFile feedback')}`;

function readDismissed(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function useNoteDismissal(): [boolean, () => void] {
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);
  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, NOTE_ID); } catch { /* private mode */ }
    setDismissed(NOTE_ID);
  };
  return [dismissed === NOTE_ID, dismiss];
}

export function BuilderNote() {
  const [dismissed, dismiss] = useNoteDismissal();
  if (dismissed || Date.now() > EXPIRES_AT) return null;
  return (
    <div className="relative bg-c-card border border-c-border rounded-xl p-4 mb-6 flex items-start gap-3.5">
      <img src="/3d-clay-plumbob.svg" alt="" className="w-8 h-8 shrink-0 mt-0.5" draggable={false} />
      <div className="min-w-0">
        {/* Her copy, VERBATIM — do not edit or "tighten" it. */}
        <p className="text-sm font-bold text-c-text m-0">New: Try out the Showcase!</p>
        <p className="text-sm text-c-muted mt-1 leading-relaxed m-0">
          Make your hard work visible to others. Edit and customize your showcase, then flip it
          on so you can send the link to others. This is an in-depth and easy way to share your
          save far and wide. If you have feedback, please reach out! I read everything.
        </p>
        <a
          href={MAILTO}
          className="inline-block mt-2.5 text-sm font-semibold text-c-green bg-c-accent-soft border border-c-accent-border rounded-lg px-3.5 py-1.5 no-underline hover:bg-c-accent-border transition-colors"
        >
          Email me
        </a>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-c-faint hover:text-c-text bg-transparent border-none cursor-pointer p-1"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
