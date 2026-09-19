import { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen } from '@phosphor-icons/react';
import { FileName } from '../common/FileName';
import { parseLocalThumbCache, cleanThumbnail } from '../../lib/thumbCache';
import { useSaveFile } from '../../store/useSaveFile';
import { api } from '../../lib/api';
import { useEscapeToClose } from '../common/useEscapeToClose';
import { btn, iconBtn } from '../common/btn';

type Step = 'instructions' | 'review' | 'uploading' | 'done';

export function ImportPortraitsModal({ onClose, onComplete }: { onClose: () => void; onComplete?: () => void }) {
  const households = useSaveFile((s) => s.households);
  const setHouseholdThumbnail = useSaveFile((s) => s.setHouseholdThumbnail);

  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('instructions');

  const [cacheMap, setCacheMap] = useState<Map<bigint, Uint8Array>>(new Map());
  // A title someone can act on, plus the detail — not a parser exception.
  const [error, setError] = useState<{ title: string; detail: React.ReactNode } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  // Same guard as the backdrop and the X: the upload keeps writing after
  // this unmounts, so there's no safe way out of it mid-run.
  useEscapeToClose(onClose, step !== 'uploading');

  // Build sourceId → planner-household lookup once.
  const householdsBySource = useMemo(() => {
    const m = new Map<string, typeof households[string]>();
    for (const h of Object.values(households)) {
      if (h.sourceId) m.set(h.sourceId.toLowerCase(), h);
    }
    return m;
  }, [households]);

  // After parsing, compute which cache portraits match a planner household.
  // (The old "wandering NPC" bulk-delete that lived here is gone — Rest of Town
  // + provenance now own NPC noise, and save-backed households are never
  // hard-deleted under the full-ingest model.)
  const matched = useMemo(() => {
    const out: { household: typeof households[string]; jpeg: Uint8Array }[] = [];
    for (const [bigId, jpeg] of cacheMap) {
      const hex = bigId.toString(16);
      const h = householdsBySource.get(hex);
      if (h) out.push({ household: h, jpeg });
    }
    return out;
  }, [cacheMap, householdsBySource]);

  /**
   * The wrong file used to fail SILENTLY, which is the worst way to fail.
   *
   * `.save` and `.package` are both DBPF containers, so picking a save file
   * parsed "successfully", found zero household photos, and landed on a review
   * screen reading "0 portraits match" over a line about the remainder
   * belonging to other saves — which is nonsense at zero and reads as the
   * feature being broken rather than as the wrong file. Three outcomes now,
   * each named plainly, and none of them shows a parser message to a player.
   */
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear first: after the "scroll Manage Households" advice, the next thing
    // someone does is pick the SAME file again — which fires no change event
    // at all unless the input has been reset.
    e.target.value = '';
    if (!file) return;
    setError(null);

    // Not-a-Sims-4-file and a-Sims-4-file-that-isn't-this-one are the same
    // message, because they call for the same move. The only case that earns
    // different words is the right file with nothing in it yet.
    const wrongType = {
      title: 'Wrong file type',
      detail: <>The file you're looking for is <FileName>localthumbcache.package</FileName>.</>,
    };

    let parsed;
    try {
      parsed = parseLocalThumbCache(await file.arrayBuffer());
    } catch (err) {
      console.error('[portrait sync] parse failed:', err);
      setError(wrongType);
      return;
    }

    if (parsed.size === 0) {
      setError(/localthumbcache\.package$/i.test(file.name)
        ? {
            title: 'No photos in it yet',
            detail: <>Open the game, go to Manage Households and scroll the whole list. Then quit and pick it again.</>,
          }
        : wrongType);
      return;
    }

    const idJpegMap = new Map<bigint, Uint8Array>();
    for (const [id, t] of parsed) idJpegMap.set(id, t.jpegBytes);
    setCacheMap(idJpegMap);
    setStep('review');
  }

  async function handleUpload() {
    setStep('uploading');
    const total = matched.length;
    setProgress({ done: 0, total, current: '' });
    // The wall-clock cost is R2 upload latency, not CPU — run a small worker
    // pool instead of a strictly sequential loop. 5 keeps us well under any
    // connection limits while cutting total time roughly 5x.
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < matched.length) {
        const { household, jpeg } = matched[next++];
        try {
          // Composite the EA-embedded alpha PNG with the RGB JPEG (and trim the
          // transparent margins) so the upload is a clean, tightly-framed PNG.
          // Falls back to the raw JPEG if the ALFA segment is missing/malformed.
          const blob = await cleanThumbnail(jpeg);
          await setHouseholdThumbnail(household.id, blob);
        } catch (err) {
          console.error(`Failed to upload thumbnail for ${household.name}:`, err);
        }
        done++;
        setProgress({ done, total, current: household.name });
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, matched.length) }, worker));
    // Once per RUN, not once per portrait — the question is whether people
    // find and use this, not how many households they happen to have.
    api.logFeatureEvent('portrait_sync');
    onComplete?.();
    setStep('done');
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  // Portaled to body so the scrim covers the whole viewport — the workspace
  // aside has a transform that would otherwise scope this fixed overlay to it.
  return createPortal(
    <div
      /* Not dismissable mid-upload. The worker pool below keeps writing
         thumbnails after this component unmounts, so closing during 'uploading'
         left the run going invisibly with no progress and no way back to it.
         CreateHouseholdModal next door already guards its backdrop this way. */
      className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && step !== 'uploading') onClose(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-c-card border border-c-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-c-border flex justify-between items-center">
          <h2 className="text-base font-bold text-c-text tracking-headline m-0">Sync household portraits</h2>
          {step !== 'uploading' && (
            <button onClick={onClose} aria-label="Close" className={iconBtn(7)}><X size={18} weight="bold" /></button>
          )}
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-c-base">
          {step === 'instructions' && (
            <>
              <p className="text-sm text-c-muted leading-relaxed mb-4 m-0">
                Your game keeps every household photo in one file. Point us at it and we'll
                match them to your planner.
              </p>
              <div className="bg-c-card border border-c-border rounded-lg p-4 mb-4">
                <p className="text-2xs font-bold text-c-dim uppercase tracking-label mb-1.5">The file</p>
                <p className="text-sm m-0"><FileName>localthumbcache.package</FileName></p>
                <p className="text-xs text-c-muted mt-1.5 m-0">In your Sims 4 folder, next to your saves.</p>
              </div>
              {/* The standing hint steps aside for an error — every error below
                  carries its own instruction, and two sets of directions at
                  once is how someone follows neither. */}
              {!error && (
                <p className="text-[13px] text-c-dim leading-snug mb-4 m-0">
                  Missing a few? Open the game, visit Manage Households and scroll the whole list so
                  every photo loads, then quit and pick the file again.
                </p>
              )}
              {error && (
                <div className="bg-c-card border border-c-red-border rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-c-red m-0">{error.title}</p>
                  <p className="text-[13px] text-c-muted leading-relaxed mt-1.5 m-0">{error.detail}</p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".package"
                className="hidden"
                onChange={handleFile}
              />
              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className={btn('ghost')}>Cancel</button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className={btn('primary')}
                >
                  <FolderOpen size={15} weight="bold" /> Choose the file
                </button>
              </div>
            </>
          )}

          {step === 'review' && (
            <>
              {/* Zero is not "a smaller number of matches" — it's a different
                  situation, and the old copy explained the leftovers instead of
                  the outcome. Photos are matched to the households in THIS
                  save, so a full cache from other saves still lands here. */}
              {matched.length === 0 ? (
                <div className="bg-c-card border border-c-border rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-c-text m-0">
                    None of these photos belong to this save.
                  </p>
                  <p className="text-[13px] text-c-muted leading-relaxed mt-1.5 m-0">
                    The file holds {cacheMap.size} household photo{cacheMap.size !== 1 ? 's' : ''}, but they all belong to
                    households in your other saves. Photos only match the households in the save you have open.
                  </p>
                </div>
              ) : (
                <div className="bg-c-card border border-c-border rounded-lg p-4 mb-4">
                  <p className="text-sm text-c-text m-0">
                    <span className="font-semibold">{matched.length}</span> of {cacheMap.size} photo{cacheMap.size !== 1 ? 's' : ''} match a household in this save.
                  </p>
                  {cacheMap.size > matched.length && (
                    <p className="text-xs text-c-dim mt-1.5 m-0">
                      The rest belong to households in your other saves.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={onClose} className={btn('ghost')}>Cancel</button>
                {/* A dead "Import 0 portraits" button is a dead end. At zero the
                    only useful move is trying another file. */}
                {matched.length === 0 ? (
                  <button onClick={() => setStep('instructions')} className={btn('primary')}>
                    <FolderOpen size={15} weight="bold" /> Pick a different file
                  </button>
                ) : (
                  <button onClick={handleUpload} className={btn('primary')}>
                    Import {matched.length} portrait{matched.length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'uploading' && (
            <>
              <p className="text-sm text-c-muted mb-3">
                Uploading portrait {progress.done + 1} of {progress.total}…
              </p>
              <p className="text-[13px] text-c-faint mb-4">{progress.current}</p>
              <div className="w-full bg-c-base rounded h-2 overflow-hidden">
                <div
                  className="bg-c-accent h-full transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <p className="text-sm text-c-muted leading-relaxed mb-5">
                Imported {matched.length} portrait{matched.length !== 1 ? 's' : ''}.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={onClose}
                  className={btn('primary')}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
