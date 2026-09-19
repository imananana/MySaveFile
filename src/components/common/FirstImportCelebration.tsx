import { useEffect, useState } from 'react';

const STORAGE_KEY = 'show_post_import_toast';
const AUTO_DISMISS_MS = 5000;

/**
 * Centered celebratory overlay shown the first time a planner save lands
 * fresh from a .save import. Reads the localStorage flag the import sets,
 * shows once, then clears the flag so refresh/back doesn't re-fire.
 *
 * Auto-dismisses after 5s; backdrop click and the CTA both dismiss early.
 *
 * ★ NO COUNTS. It used to repeat the households and sims that landed, at
 * headline size — but you read those on the review screen and then pressed
 * Import, so restating them makes a celebration into a receipt, and the
 * numbers ended up shouting over the two things that are actually the moment:
 * the bobbing plumbob and "your save is linked".
 *
 * What's left in their place is the only thing worth saying here that isn't a
 * repeat — that syncing exists. That's what "linked" is hinting at, and it's
 * the one fact a new user has no other way to learn at this point.
 *
 * The flag stays a plain boolean for the same reason: nothing on this screen
 * varies with what landed. Payloads written by older builds are ignored.
 */
export function FirstImportCelebration() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) return;
    localStorage.removeItem(STORAGE_KEY);

    setShow(true);
    const t = window.setTimeout(() => setShow(false), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div
      onClick={() => setShow(false)}
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
      style={{ animation: 'overlay-fade-in 300ms ease-out' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-c-card border border-c-border rounded-2xl shadow-xl p-8 max-w-sm w-full text-center"
        style={{ animation: 'overlay-scale-in 380ms cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        <div className="relative h-24 mb-5 flex items-center justify-center">
          <div
            className="absolute plumbob-glow"
            style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(22,163,74,0.5) 0%, transparent 65%)',
            }}
          />
          <img
            src="/3d-clay-plumbob.svg"
            alt=""
            className="plumbob-bob relative h-24 w-auto select-none"
            draggable={false}
          />
        </div>
        {/* A full stop, not an exclamation: "Let's go!" is six lines below,
            and two marks on one small card cancel each other out. The plumbob
            does the celebrating. It also answers first run's "Your save, ready
            to plan." in the same construction, thirty seconds later. */}
        <h2 className="text-xl font-bold text-c-text tracking-headline mb-2">
          Your save is linked.
        </h2>
        <p className="text-sm text-c-muted leading-snug mb-6">
          Sync any time to keep your plan up to date as you play.
        </p>
        <button
          onClick={() => setShow(false)}
          className="bg-c-accent hover:bg-c-accent-hover text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          Let's go!
        </button>
      </div>
    </div>
  );
}
