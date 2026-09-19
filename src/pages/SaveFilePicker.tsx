import { useState, useEffect, useRef, useCallback } from 'react';
import { Trash, CaretDown, UploadSimple, DotsThree, DownloadSimple, ShieldCheck, EnvelopeSimple } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/useAuth';
import { api } from '../lib/api';
import { openSaveFilePicker } from '../lib/pickSaveFile';
import { announceSaveRename } from '../lib/saveNameSync';
import { useConfirm } from '../components/common/ConfirmDialog';
import { NewSaveChooser } from '../components/common/NewSaveChooser';
import { ProfileModal } from '../components/common/ProfileModal';
import { GameImport } from '../components/GameImport';
import { PlumbobLoader } from '../components/common/PlumbobLoader';
import { BuilderNote } from '../components/common/BuilderNote';
import { Tooltip } from '../components/common/Tooltip';
import { btn, iconBtn } from '../components/common/btn';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';

interface SaveFileMeta {
  id: string;
  name: string;
  duplicatedFrom?: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at?: string | null;
}

interface TrashMeta extends SaveFileMeta {
  deleted_at: string;
  auto_backup: boolean;
}

/**
 * The row subtitle. `updated_at` is bumped by every editor route AND by the
 * sync itself, so it is always equal to or later than the sync and can only
 * ever mean "I've planned since" — nothing worth a line. `last_synced_at`
 * answers the question you actually have here (is this current with my game?),
 * and its absence is real information rather than a missing value.
 */
function syncLabel(sf: SaveFileMeta): string {
  if (!sf.last_synced_at) return 'Not linked to a save file';
  return `Synced ${timeAgo(sf.last_synced_at)}`;
}

/**
 * Relative while it's the answer to "is this stale?", absolute once it stops
 * being — "8 months ago" tells you less than the date does.
 */
function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/**
 * The row's overflow menu. Words, not glyphs — and Delete sits alone under a
 * rule so it can't be mistaken for its neighbours.
 */
function SaveRowMenu({
  open, onToggle, onClose, duplicating,
  onSync, onRename, onDuplicate, onDownload, onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  duplicating: boolean;
  onSync: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(ref, onClose, open);

  const run = (fn: () => void) => () => { onClose(); fn(); };
  const item = 'w-full text-left px-3 py-2 text-sm text-c-text hover:bg-c-panel transition-colors bg-transparent border-none cursor-pointer';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onToggle}
        aria-label="More actions"
        aria-expanded={open}
        className={iconBtn(8)}
      >
        <DotsThree size={18} weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-c-card border border-c-border rounded-lg shadow-lg py-1 overflow-hidden">
          <button onClick={run(onSync)} className={item}>Sync from save</button>
          <button onClick={run(onRename)} className={item}>Rename</button>
          <button onClick={run(onDuplicate)} disabled={duplicating} className={`${item} disabled:opacity-40`}>
            {duplicating ? 'Duplicating…' : 'Duplicate'}
          </button>
          <button onClick={run(onDownload)} className={item}>Download backup</button>
          <div className="border-t border-c-border my-1" />
          <button onClick={run(onDelete)} className={`${item} text-c-red hover:bg-c-red-bg`}>Delete</button>
        </div>
      )}
    </div>
  );
}

function trashExpiryLabel(t: TrashMeta): string {
  const ttlDays = t.auto_backup ? 7 : 30;
  const expiresMs = new Date(t.deleted_at).getTime() + ttlDays * 86400000;
  const daysLeft = Math.max(0, Math.ceil((expiresMs - Date.now()) / 86400000));
  // Two different things share this list: backups the app took before a
  // destructive op (7 days) and saves the user deleted (30 days). Say which.
  const kind = t.auto_backup ? 'Backed up before a sync' : 'You deleted this';
  return `${kind} · gone in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
}

export default function SaveFilePicker() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const confirm = useConfirm();

  const [saves, setSaves] = useState<SaveFileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [showPathChoice, setShowPathChoice] = useState(false);
  const [showGameImport, setShowGameImport] = useState(false);
  // The file chosen on the first-run hero, handed straight to GameImport so it
  // skips its own pick step.
  const [pickedSave, setPickedSave] = useState<File | null>(null);

  const takeSaveFile = useCallback((file: File) => {
    setPickedSave(file);
    setShowGameImport(true);
  }, []);

  // Aimed at the saves folder where the browser can do it, the plain input
  // everywhere else. See lib/pickSaveFile.ts — it aims the dialog and
  // deliberately does not remember the file, because Save As is normal.
  const chooseSaveFile = useCallback(() => {
    void openSaveFilePicker(takeSaveFile, saveFileInputRef.current);
  }, [takeSaveFile]);
  const saveFileInputRef = useRef<HTMLInputElement>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [trash, setTrash] = useState<TrashMeta[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [showAllSaves, setShowAllSaves] = useState(false);
  const [resent, setResent] = useState(false);
  // The account window. It used to hang off the top bar only, which lives inside
  // a save — so a brand-new account had nowhere to change its password.
  const [profileOpen, setProfileOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listSaveFiles().then(setSaves).catch(() => setError('Failed to load save files')).finally(() => setLoading(false));
    api.listTrash().then(setTrash).catch(() => {});
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const sf = await api.createSaveFile(newName.trim());
      navigate(`/saves/${sf.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!await confirm({ message: `Delete "${name}"? You can restore it from Deleted & backups for 30 days.`, confirmLabel: 'Delete' })) return;
    await api.deleteSaveFile(id);
    setSaves((prev) => prev.filter((s) => s.id !== id));
    api.listTrash().then(setTrash).catch(() => {});
  }

  async function handleRestore(id: string) {
    await api.restoreSaveFile(id);
    const [s, t] = await Promise.all([api.listSaveFiles(), api.listTrash()]);
    setSaves(s);
    setTrash(t);
  }

  async function handlePurge(id: string, name: string) {
    if (!await confirm({ message: `Permanently delete "${name}"? This cannot be undone.`, confirmLabel: 'Delete forever', danger: true })) return;
    await api.purgeSaveFile(id);
    setTrash((prev) => prev.filter((t) => t.id !== id));
  }

  function handleExport(id: string, name: string) {
    api.exportSaveFile(id, name); // native browser download (streams to disk)
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setError('');
    try {
      const sf = await api.importSaveFile(file);
      navigate(`/saves/${sf.id}`);
    } catch {
      setError('Import failed — make sure the file is a .s4plan backup.');
      setImporting(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function handleResend() {
    try { await api.resendVerification(); } finally { setResent(true); }
  }

  function startRename(sf: SaveFileMeta) {
    setRenamingId(sf.id);
    setRenameValue(sf.name);
  }

  async function commitRename() {
    if (!renamingId) { return; }
    const trimmed = renameValue.trim();
    if (trimmed) {
      await api.renameSaveFile(renamingId, trimmed);
      announceSaveRename(renamingId, trimmed);
      setSaves((prev) => prev.map((s) => (s.id === renamingId ? { ...s, name: trimmed } : s)));
    }
    setRenamingId(null);
  }

  async function handleDuplicate(id: string) {
    setDuplicating(id);
    try {
      const dup = await api.duplicateSaveFile(id);
      setSaves((prev) => [dup, ...prev]);
    } catch {
      setError('Duplicate failed');
    } finally {
      setDuplicating(null);
    }
  }


  // An account with nothing in it gets a different page, not the same page with
  // an empty list in the middle of it.
  const firstRun = !loading && saves.length === 0;

  // Not a WarnCallout: verifying your email is an account chore, not a
  // hazard, and the amber triangle dressed it as one. This is a sibling of
  // the builder-note card below it — same card, same button family.
  const verifyBanner = user && !user.emailVerified ? (
    <div className={`bg-c-card border border-c-border rounded-xl px-4 py-3 flex items-center gap-3.5 ${firstRun ? 'mt-6' : 'mb-6'}`}>
      <span className="w-9 h-9 rounded-full bg-c-panel grid place-items-center shrink-0">
        <EnvelopeSimple size={18} weight="duotone" className="text-c-muted" />
      </span>
      <p className="flex-1 min-w-0 m-0 text-sm leading-snug">
        <span className="font-bold text-c-text">Verify your email</span>{' '}
        <span className="text-c-dim">
          {user.email ? <>— confirm <span className="font-medium text-c-muted">{user.email}</span> to secure your account.</> : '— confirm your address to secure your account.'}
        </span>
      </p>
      <button
        onClick={handleResend}
        disabled={resent}
        className="shrink-0 text-xs font-semibold text-c-green bg-c-accent-soft border border-c-accent-border rounded-lg px-3.5 py-2 cursor-pointer hover:bg-c-accent-border transition-colors disabled:text-c-dim disabled:bg-transparent disabled:border-c-border disabled:cursor-default"
      >
        {resent ? 'Sent — check your inbox' : 'Resend email'}
      </button>
    </div>
  ) : null;

  return (
    <div className={`min-h-screen relative ${firstRun ? '' : 'bg-c-base'}`}>
      {/* First run is the only screen in the app with nothing of yours on it
          yet, so the atmosphere has to come from the game. Willow Creek,
          desaturated and pushed back under a cream wash — its empty white lot
          outlines are literally an unplanned save, which is the one thing this
          page is asking you to fix. Blurring it would throw away the only
          detail that earns it. */}
      {firstRun && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 bg-c-base bg-cover"
            style={{
              backgroundImage: 'url(/maps/willow-creek.webp)',
              backgroundPosition: '50% 44%',
              filter: 'saturate(0.78) brightness(1.06) contrast(0.92)',
            }}
          />
          <div
            aria-hidden
            className="fixed inset-0"
            style={{
              background:
                // EVEN, not radial. A radial wash is brightest at its centre —
                // which is exactly where the card sits, so the map vanished
                // behind it and a white card landed on near-white ground with
                // nothing to separate the two. A flat scrim keeps some world
                // visible everywhere, including behind the card, which is what
                // gives its edges something to read against.
                'linear-gradient(180deg, rgba(250,248,244,.74) 0%, rgba(250,248,244,.52) 26%, rgba(250,248,244,.52) 72%, rgba(250,248,244,.80) 100%)',
            }}
          />
        </>
      )}
      <header className="relative z-10 bg-c-card border-b border-c-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/3d-clay-plumbob.svg"
            alt=""
            className="h-11 w-auto shrink-0 select-none"
            draggable={false}
          />
          <div className="leading-tight">
            <h1 className="text-sm font-bold text-c-text tracking-headline">MySaveFile</h1>
            <p className="text-xs text-c-dim">{user?.displayName ?? user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setProfileOpen(true)}
            className="text-sm text-c-dim hover:text-c-text transition-colors bg-transparent border-none cursor-pointer"
          >
            Profile
          </button>
          <button onClick={handleLogout} className="text-sm text-c-dim hover:text-c-text transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className={`relative z-10 max-w-2xl mx-auto px-4 ${firstRun ? 'pb-10' : 'py-10'}`}>
        {/* An unverified email is worth saying, but on a brand-new account it was
            the FIRST thing on screen at the one moment that should be about the
            save you're making. On a first run it moves below the two doors; once
            you have saves it leads, where it can't upstage anything.

            ★ Nothing but the loader until the list arrives. `firstRun` is false
            WHILE loading too, so every block gated on `!firstRun` alone used to
            flash the full manager chrome — this banner, the builder note, "Your
            save files", + New save — at a brand-new user for the beat before
            the fetch came back, then rip it all out for the first-run card. */}
        {!loading && !firstRun && verifyBanner}
        {/* The "restore a downloaded save" action is demoted into the
            Deleted & backups section below — this hidden input backs it. */}
        <input
          ref={importInputRef}
          type="file"
          accept=".s4plan,.json"
          className="hidden"
          onChange={handleImportFile}
        />

        {/* On a first run the header goes with everything else: a page title and
            a New save button above an empty list are two more ways of offering
            the same choice the two doors below offer once, properly. */}
        {/* What's-new + feedback ask, existing users only — a first run has
            nothing "new" yet and that moment belongs to the two doors. */}
        {!loading && !firstRun && <BuilderNote />}
        {!loading && !firstRun && (
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-c-text">Your save files</h2>
            <button
              onClick={() => setShowPathChoice(true)}
              className={btn('primary')}
            >
              + New save
            </button>
          </div>
        )}

        {error && <p className="text-c-red text-sm mb-4">{error}</p>}

        {showNewForm && (
          <div className="bg-c-card border border-c-border rounded-xl p-5 mb-4 flex gap-3">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Save file name…"
              className="flex-1 border border-c-border rounded-lg px-3 py-2 text-c-text text-sm focus:outline-none focus:ring-2 focus:ring-c-accent"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className={btn('primary')}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => { setShowNewForm(false); setNewName(''); }}
              className="text-c-dim hover:text-c-text text-sm px-3"
            >
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <PlumbobLoader size="md" />
        ) : saves.length === 0 ? (
          /* First run. This is the most exciting moment in the product and it
             used to be four blocks of chrome around an empty list: a verify-email
             warning, a page header, a generic 1-2-3 card, and a second call to
             action repeating the header's choice. One direction to pick, said
             once — the same two doors as the New save chooser, weighted the same
             way, so the screen and the modal finally agree. The 1-2-3 card is
             gone rather than moved: explaining the loop to someone who hasn't
             imported anything yet is teaching before there's anything to teach.

             While the name field for a blank save is open it stands in for the
             doors — leaving them under it offers the choice you just made. */
          showNewForm ? null : (
          /* Centred in what's left of the viewport under the header, not
             floated at the top of a padded column — this is the whole screen,
             so it should sit where the eye already is. */
          <div className="flex items-center justify-center min-h-[calc(100vh-77px)] py-8">
            <div className="w-full max-w-md bg-c-card rounded-2xl shadow-2xl px-8 pt-9 pb-7 flex flex-col items-center text-center gap-4">
              <img
                src="/3d-clay-plumbob.svg"
                alt=""
                className="h-16 w-auto select-none"
                draggable={false}
              />
              {/* A label, not a claim. Earlier drafts were the card explaining
                  itself — a tagline on a screen you reach by logging in. This
                  states the state you'll be in and stops.

                  Deliberately NOT "linked": nothing is linked yet, and that's
                  the word the celebration uses when it's finally true. Spending
                  it here would make the celebration a repeat. */}
              <h2 className="text-2xl font-bold text-c-text tracking-headline m-0">
                Your save, ready to plan.
              </h2>
              {/* One breadcrumb, true on both platforms. The Windows prefix
                  (C:\Users\[you]\Documents\) was the ugliest thing on the old
                  modal AND the part nobody needs, since every file dialog opens
                  in Documents already. */}
              <p className="text-sm text-c-dim m-0">
                Your saves live in{' '}
                <b className="font-semibold text-c-text whitespace-nowrap">
                  Documents › Electronic Arts › The Sims 4 › saves
                </b>
              </p>
              <input
                ref={saveFileInputRef}
                type="file"
                accept=".save"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) takeSaveFile(file);
                }}
              />
              <button
                onClick={chooseSaveFile}
                className={btn('primary', { size: 'hero', elevated: true, className: 'mt-1' })}
              >
                <DownloadSimple size={18} weight="bold" />
                Choose your save file
              </button>
              {/* Grey, not green. Green means "putting content in" here, and a
                  sentence isn't a button — three green things under one green
                  button was what made the earlier draft shout. */}
              <p className="flex items-center gap-1.5 text-xs text-c-faint m-0">
                <ShieldCheck size={14} weight="duotone" />
                Read in your browser, never uploaded.
              </p>
              {/* The loop, said once at the door. The old 1-2-3 card was cut as
                  "teaching before there's anything to teach" — then production
                  showed a third of signups skipping the import for the blank
                  path and abandoning an empty planner. The lesson wasn't "don't
                  teach", it was "don't teach in a card that competes with the
                  button": three quiet lines under it, not a screen before it.
                  The copy is the builder's, verbatim; the numbers alternate
                  the app's two colours as soft tints. */}
              <div className="w-full mt-2 pt-4 border-t border-c-border flex flex-col gap-2.5 text-left">
                {([
                  ['bg-c-accent-soft text-c-green', 'Find your save', ' in your Documents folder.'],
                  ['bg-c-secondary-soft text-c-secondary', 'MySaveFile will update', ' with your save data.'],
                  ['bg-c-accent-soft text-c-green', 'Check out your sims, households, and lots', ' in the planner!'],
                ] as const).map(([tone, lead, rest], i) => (
                  <div key={lead} className="flex items-center gap-2.5">
                    <span className={`w-5 h-5 rounded-full ${tone} grid place-items-center text-2xs font-bold shrink-0`}>
                      {i + 1}
                    </span>
                    <p className="text-xs text-c-dim m-0">
                      <b className="font-semibold text-c-text">{lead}</b>
                      {rest}
                    </p>
                  </div>
                ))}
              </div>
              {/* Not a second door. Import is what nearly everyone is here for,
                  and this answers "can I use this without a save?" rather than
                  naming a mode. */}
              <button
                onClick={() => { setShowPathChoice(false); setShowNewForm(true); }}
                className="text-xs text-c-faint hover:text-c-muted bg-transparent border-none cursor-pointer p-1"
              >
                or plan without a save file
              </button>
            </div>
          </div>
          )
        ) : (
          <div className="space-y-3">
            {(showAllSaves ? saves : saves.slice(0, 5)).map((sf) => (
              <div
                key={sf.id}
                className="bg-c-card border border-c-border rounded-xl p-5 flex items-center justify-between hover:border-c-accent transition-colors group"
              >
                {renamingId === sf.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                    className="flex-1 border border-c-accent rounded-lg px-3 py-2 text-c-text text-sm focus:outline-none"
                  />
                ) : (
                  <button
                    onClick={() => navigate(`/saves/${sf.id}`)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="font-semibold text-c-text group-hover:text-c-accent transition-colors truncate">{sf.name}</p>
                    <p className="text-xs text-c-dim mt-0.5">{syncLabel(sf)}</p>
                  </button>
                )}
                {/* One obvious action, everything else behind ⋯. Five grey
                    glyphs of equal weight — one of which deleted the save —
                    gave no clue which was which until you hovered. */}
                <div className="ml-4 flex items-center gap-2 shrink-0">
                  <button onClick={() => navigate(`/saves/${sf.id}`)} className={btn('secondary')}>
                    Open
                  </button>
                  <SaveRowMenu
                    open={menuFor === sf.id}
                    onToggle={() => setMenuFor((cur) => (cur === sf.id ? null : sf.id))}
                    onClose={() => setMenuFor(null)}
                    duplicating={duplicating === sf.id}
                    onSync={() => navigate(`/saves/${sf.id}?sync=1`)}
                    onRename={() => startRename(sf)}
                    onDuplicate={() => handleDuplicate(sf.id)}
                    onDownload={() => handleExport(sf.id, sf.name)}
                    onDelete={() => handleDelete(sf.id, sf.name)}
                  />
                </div>
              </div>
            ))}
            {saves.length > 5 && (
              <button
                onClick={() => setShowAllSaves((v) => !v)}
                className="w-full text-center text-sm font-medium text-c-muted hover:text-c-accent py-2 flex items-center justify-center gap-1.5 transition-colors"
              >
                {showAllSaves ? 'Show fewer' : `Show all ${saves.length} saves`}
                <CaretDown size={13} weight="bold" className={`transition-transform ${showAllSaves ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}

        {/* Not on a first run at all. It's an account chore, and it was the
            loudest thing on the one screen that should be about the save
            you're about to make. It leads on /saves the moment you have one. */}

        {/* Deleted saves, auto-backups, and the rare "restore a downloaded
            save" action all live here — demoted, since they're seldom used.
            Hidden entirely on a first run with an empty trash: offering to
            restore things to an account that has never had any is chrome. It
            comes back the moment there IS something in it, because a user who
            deleted their only save needs the way back. */}
        <div className={`mt-10 ${loading || (firstRun && trash.length === 0) ? 'hidden' : ''}`}>
          <button
            onClick={() => setShowTrash((v) => !v)}
            className="text-sm text-c-dim hover:text-c-text transition-colors inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer"
          >
            <Trash size={14} weight="bold" />
            Deleted &amp; backups{trash.length > 0 ? ` (${trash.length})` : ''}
            <CaretDown size={12} weight="bold" className={`transition-transform ${showTrash ? 'rotate-180' : ''}`} />
          </button>
          {showTrash && (
            <div className="space-y-2 mt-3">
              {trash.length > 0 ? (
                <>
                  {/* The rows now say which kind each one is and how long it
                      has left, so a paragraph explaining both retentions is
                      just the same fact twice. */}
                  {trash.map((t) => (
                    <div key={t.id} className="bg-c-panel border border-c-border rounded-xl px-5 py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-c-muted truncate">{t.name}</p>
                        <p className="text-xs text-c-faint mt-0.5">{trashExpiryLabel(t)}</p>
                      </div>
                      <div className="ml-4 flex items-center gap-3 shrink-0">
                        <button onClick={() => handleRestore(t.id)} className="text-c-dim hover:text-c-accent transition-colors text-sm">Restore</button>
                        <button onClick={() => handlePurge(t.id, t.name)} className="text-c-faint hover:text-c-red transition-colors text-sm">Delete forever</button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-xs text-c-faint mb-1">Nothing here yet — deleted saves and pre-sync auto-backups show up here.</p>
              )}
              <div className="pt-1.5">
                <Tooltip text="Restores a save from a .json file you downloaded via a save's Settings → Download backup." side="top" wrap>
                  <button
                    onClick={() => importInputRef.current?.click()}
                    disabled={importing}
                    className="text-sm text-c-dim hover:text-c-accent transition-colors inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer disabled:opacity-50"
                  >
                    <UploadSimple size={14} weight="bold" />
                    {importing ? 'Restoring…' : 'Restore a downloaded save'}
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
      </main>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}

      {showPathChoice && !showGameImport && !showNewForm && (
        <NewSaveChooser
          onImport={() => { setShowPathChoice(false); setShowGameImport(true); }}
          onBlank={() => { setShowPathChoice(false); setShowNewForm(true); }}
          onClose={() => setShowPathChoice(false)}
        />
      )}

      {/* Game import flow */}
      {showGameImport && (
        <GameImport
          {...(pickedSave ? { initialFile: pickedSave } : {})}
          onCancel={() => { setShowGameImport(false); setPickedSave(null); }}
          onComplete={(id, name) => {
            setSaves((prev) => [...prev, { id, name, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
            setShowGameImport(false);
            setPickedSave(null);
            navigate(`/saves/${id}`);
          }}
        />
      )}
    </div>
  );
}
