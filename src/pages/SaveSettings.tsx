import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowsClockwise, LinkSimple, DownloadSimple, ImageSquare, Package, CaretRight } from '@phosphor-icons/react';
import { useSaveFile } from '../store/useSaveFile';
import { useConfirm } from '../components/common/ConfirmDialog';
import { api } from '../lib/api';
import { GameReimport } from '../components/GameReimport';
import { formatRelativeTime } from '../lib/relativeTime';
import { btn } from '../components/common/btn';

/**
 * Save-level settings home. Consolidates everything that's currently
 * scattered across the TopBar dropdown, Showcase, Dashboard, and API-only
 * actions into one curated surface. Existing entry points stay — this is
 * additive, not a relocation.
 */
export function SaveSettings() {
  const navigate = useNavigate();
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const confirm = useConfirm();

  const name = useSaveFile((s) => s.name);
  const description = useSaveFile((s) => s.description);
  const sourceSaveFilename = useSaveFile((s) => s.sourceSaveFilename);
  const sourceSaveName = useSaveFile((s) => s.sourceSaveName);
  const lastSyncedAt = useSaveFile((s) => s.lastSyncedAt);
  const saveFileUrl = useSaveFile((s) => s.saveFileUrl);
  const renameSave = useSaveFile((s) => s.renameSave);
  const setDescription = useSaveFile((s) => s.setDescription);
  const setSaveFileUrl = useSaveFile((s) => s.setSaveFileUrl);
  const resetSave = useSaveFile((s) => s.resetSave);
  const loadSaveFile = useSaveFile((s) => s.loadSaveFile);

  const [editName, setEditName] = useState(name);
  const [editDescription, setEditDescription] = useState(description);
  const [editSaveFileUrl, setEditSaveFileUrl] = useState(saveFileUrl ?? '');
  const [showReimport, setShowReimport] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Keep local edit state in sync if the store updates externally (e.g.
  // first load races input mount).
  if (renameInputRef.current && renameInputRef.current !== document.activeElement && editName !== name && editName === '') {
    setEditName(name);
  }

  async function handleRenameBlur() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === name) { setEditName(name); return; }
    await renameSave(trimmed);
  }

  async function handleDescriptionBlur() {
    if (editDescription === description) return;
    await setDescription(editDescription);
  }

  async function handleSaveFileUrlBlur() {
    const trimmed = editSaveFileUrl.trim();
    if (trimmed === (saveFileUrl ?? '')) return;
    await setSaveFileUrl(trimmed || null);
  }

  async function handleDownload() {
    if (!saveFileId) return;
    await api.exportSaveFile(saveFileId, name);
  }

  async function handleReset() {
    if (!await confirm({
      message: 'Reset this save? Every lot goes back to stock and everything you\'ve planned is deleted. A full backup goes to Deleted & backups first.',
      confirmLabel: 'Reset',
      danger: true,
    })) return;
    await resetSave();
  }

  async function handleDelete() {
    if (!saveFileId) return;
    // Same words as the save list's own confirm — it is the same soft delete, and
    // this screen used to call it permanent while the list called it recoverable.
    if (!await confirm({
      message: `Delete "${name}"? You can restore it from Deleted & backups for 30 days.`,
      confirmLabel: 'Delete',
    })) return;
    await api.deleteSaveFile(saveFileId);
    navigate('/saves');
  }

  const syncedAgo = formatRelativeTime(lastSyncedAt);

  return (
    <>
      <div className="px-4 sm:px-7 py-4 sm:py-6 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-c-text leading-tight tracking-headline">Save settings</h1>
        </div>

        <div className="flex flex-col gap-5">
          {/* The linked save leads: it's the only thing on this page anyone
              comes here for. "Source" was jargon — nobody calls it that. */}
          <Section title={sourceSaveFilename ? 'Linked save file' : 'Link a .save file'}>
            {sourceSaveFilename ? (
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-c-text font-medium">{syncedAgo ? `Synced ${syncedAgo}` : 'Never synced'}</p>
                  <p className="text-xs text-c-faint font-mono mt-1">{sourceSaveFilename}</p>
                  {sourceSaveName && <p className="text-xs text-c-muted mt-0.5">"{sourceSaveName}"</p>}
                </div>
                <button
                  onClick={() => setShowReimport(true)}
                  className={btn('primary', { size: 'sm', elevated: true })}
                >
                  <ArrowsClockwise size={14} weight="bold" />
                  Sync
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 items-start">
                <p className="text-sm text-c-muted m-0">
                  Link a .save file to pull in your lots, households and sims.
                </p>
                <button
                  onClick={() => setShowReimport(true)}
                  className={btn('primary', { elevated: true })}
                >
                  <LinkSimple size={14} weight="bold" />
                  Link a .save file…
                </button>
              </div>
            )}
          </Section>

          <Section title="Name">
            <input
              ref={renameInputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-full bg-c-base border border-c-border rounded-lg px-3 py-2 text-c-text text-sm outline-none focus:border-c-accent transition-colors"
            />
          </Section>

          <Section title="Description">
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              rows={3}
              placeholder="What's this save about? Shown on your public showcase."
              className="w-full bg-c-base border border-c-border rounded-lg px-3 py-2 text-c-text text-sm outline-none focus:border-c-accent transition-colors resize-y placeholder:text-c-faint"
            />
          </Section>

          {/* Save file link — paste a public URL where the .save itself is
              hosted (Patreon, Sims FileShare, Google Drive, etc.). Shown
              prominently on the public showcase so visitors can grab it. */}
          {/* This subtitle survives the cull: it describes a consequence you
              can't see from the field — that a Download button appears on a
              different page entirely. */}
          <Section
            title="Save file link"
            subtitle="Paste a public link — Patreon, Sims FileShare, Google Drive — and a Download button appears on your showcase."
          >
            <Field label="Download URL">
              <input
                type="url"
                value={editSaveFileUrl}
                onChange={(e) => setEditSaveFileUrl(e.target.value)}
                onBlur={handleSaveFileUrlBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="https://patreon.com/posts/…"
                className="w-full bg-c-base border border-c-border rounded-lg px-3 py-2 text-c-text text-sm outline-none focus:border-c-accent transition-colors placeholder:text-c-faint"
              />
            </Field>
          </Section>

          {/* The showcase is the save's public page; going Live and copying
              the link happen THERE (the edit bar), not here. */}
          <Section title="Showcase">
            <button
              type="button"
              onClick={() => saveFileId && navigate(`/saves/${saveFileId}/showcase`)}
              className="flex items-center justify-between gap-3 w-full bg-c-base hover:bg-c-panel border border-c-border rounded-lg px-4 py-3 cursor-pointer transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <ImageSquare size={18} weight="duotone" className="text-c-accent shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-c-text">Open your showcase</div>
                  <div className="text-2xs text-c-dim">Your save's public page. Go Live and copy your link from there.</div>
                </div>
              </div>
              <CaretRight size={14} weight="bold" className="text-c-faint shrink-0" />
            </button>
          </Section>

          {/* Advanced — escape-hatch + low-frequency actions. Each row is a
              compact icon + label + chevron pattern so the section reads as
              "extras tucked away" rather than competing with the everyday
              tasks above. */}
          <Section
            title="Advanced"
            subtitle="Tucked away for the 1% of cases where the planner needs a manual nudge or a backup."
          >
            <button
              type="button"
              onClick={() => saveFileId && navigate(`/saves/${saveFileId}/settings/packs`)}
              className="flex items-center justify-between gap-3 w-full bg-c-base hover:bg-c-panel border border-c-border rounded-lg px-4 py-3 cursor-pointer transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Package size={18} weight="duotone" className="text-c-secondary shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-c-text">Pack ownership</div>
                  <div className="text-2xs text-c-dim">Override which Sims 4 packs the planner thinks you have.</div>
                </div>
              </div>
              <CaretRight size={14} weight="bold" className="text-c-faint shrink-0" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center justify-between gap-3 w-full bg-c-base hover:bg-c-panel border border-c-border rounded-lg px-4 py-3 cursor-pointer transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <DownloadSimple size={18} weight="duotone" className="text-c-accent shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-c-text">Download backup</div>
                  <div className="text-2xs text-c-dim">Your whole plan and every photo, in one .s4plan file. Restore it from Deleted &amp; backups.</div>
                </div>
              </div>
              <CaretRight size={14} weight="bold" className="text-c-faint shrink-0" />
            </button>
          </Section>

          {/* Danger zone. Every line here used to be untrue in the SAFE direction's
              opposite: it called a 30-day soft delete permanent, called a reset
              that backs itself up irreversible, and named entities the reset left
              standing. Overstating danger is its own kind of lying — it makes the
              one genuinely permanent action (Delete forever, in the trash) read
              like all the others. */}
          <Section
            title="Danger zone"
            subtitle="Both of these keep a copy in Deleted & backups first."
            danger
          >
            <div className="flex flex-col gap-2 items-start">
              <button
                onClick={handleReset}
                className="text-2xs font-semibold uppercase tracking-label text-c-red border border-c-red-border hover:border-c-red hover:bg-c-red-bg px-3.5 py-2 rounded-lg cursor-pointer bg-transparent transition-colors"
              >
                Reset planner data
              </button>
              <p className="text-2xs text-c-faint leading-snug">
                Every lot back to its stock name and type, and everything you've planned deleted — households, sims, clubs, businesses, holidays, dynasties, custom venues, the family tree. Your photos, this save's name, description and .save link stay.
              </p>
              <button
                onClick={handleDelete}
                className="mt-3 text-2xs font-semibold uppercase tracking-label text-c-red border border-c-red-border hover:border-c-red hover:bg-c-red-bg px-3.5 py-2 rounded-lg cursor-pointer bg-transparent transition-colors"
              >
                Delete this save
              </button>
              <p className="text-2xs text-c-faint leading-snug">
                Sits in Deleted &amp; backups for 30 days, then it's gone for good. Inspo photos belong to your account and stay.
              </p>
            </div>
          </Section>
        </div>
      </div>

      {showReimport && saveFileId && (
        <GameReimport
          saveFileId={saveFileId}
          currentSourceFilename={sourceSaveFilename}
          currentSourceSaveName={sourceSaveName}
          onCancel={() => setShowReimport(false)}
          onComplete={async (syncedId) => {
            setShowReimport(false);
            if (syncedId !== saveFileId) {
              // User opted to duplicate-and-sync — navigate to the clone.
              navigate(`/saves/${syncedId}`);
            } else if (saveFileId) {
              await loadSaveFile(saveFileId);
            }
          }}
        />
      )}
    </>
  );
}

function Section({ title, subtitle, danger, children }: { title: string; subtitle?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className={`bg-c-card border rounded-xl p-5 ${danger ? 'border-c-red-border' : 'border-c-border'}`}>
      <div className="mb-4">
        <h2 className={`text-base font-bold tracking-headline mb-1 ${danger ? 'text-c-red' : 'text-c-text'}`}>{title}</h2>
        {subtitle && <p className="text-xs text-c-muted leading-snug">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-2xs font-semibold text-c-dim uppercase tracking-label mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-2xs text-c-faint mt-1.5">{hint}</p>}
    </div>
  );
}
