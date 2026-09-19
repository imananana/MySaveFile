import { useState } from 'react';
import { Desktop, Link as LinkIcon, EnvelopeSimple, Check } from '@phosphor-icons/react';
import { ModalShell } from '../gameImport/ModalShell';
import { btn } from '../common/btn';

/**
 * Shown in place of the import/re-sync flow on mobile. Importing reads a local
 * .save file off the computer where The Sims 4 is installed, so it can't work
 * from a phone — instead we keep the entry point visible (so the feature is
 * discoverable) and explain how to pick it back up on a desktop, with a one-tap
 * way to carry the current link over (copy or email it to yourself).
 */
export function ImportDesktopSheet({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the email fallback still works */ }
  }

  const mailto = `mailto:?subject=${encodeURIComponent('Open my save in MySaveFile')}&body=${encodeURIComponent(
    `Open this on the computer where The Sims 4 is installed to import or sync your save:\n\n${url}`,
  )}`;

  return (
    <ModalShell title="Import on desktop" onClose={onClose}>
      <div className="flex flex-col items-center text-center gap-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-c-accent-soft text-c-secondary">
          <Desktop size={28} weight="duotone" />
        </div>
        <p className="text-sm text-c-dim leading-relaxed">
          Importing and syncing read the <span className="font-semibold text-c-text">.save</span> file from the computer
          where The Sims 4 is installed, so this step needs a desktop. Carry this link over to pick up where you left off:
        </p>

        <div className="w-full flex flex-col gap-2 pt-1">
          <button
            onClick={copyLink}
            className={btn('primary', { size: 'lg', block: true })}
          >
            {copied ? <><Check size={16} weight="bold" /> Copied!</> : <><LinkIcon size={16} weight="bold" /> Copy link</>}
          </button>
          <a
            href={mailto}
            className={btn('secondary', { size: 'lg', block: true })}
          >
            <EnvelopeSimple size={16} weight="bold" /> Email me this link
          </a>
        </div>
      </div>
    </ModalShell>
  );
}
