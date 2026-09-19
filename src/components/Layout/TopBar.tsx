import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Tooltip } from '../common/Tooltip';
import { PlumbobLoader } from '../common/PlumbobLoader';
import { NewSaveChooser } from '../common/NewSaveChooser';
import { ProfileModal } from '../common/ProfileModal';
import {
  List,
  ArrowsClockwise,
  FloppyDisk,
  UserCircle,
  PencilSimple,
  PlusCircle,
} from '@phosphor-icons/react';
import { useSaveFile } from '../../store/useSaveFile';
import { useAuth } from '../../store/useAuth';
import { api } from '../../lib/api';
import { announceSaveRename } from '../../lib/saveNameSync';
import { GameImport } from '../GameImport';
import { GameReimport } from '../GameReimport';
import { formatRelativeTime } from '../../lib/relativeTime';

interface SaveMeta {
  id: string;
  name: string;
  duplicatedFrom?: string | null;
  updated_at: string;
}

interface TopBarProps {
  onOpenMenu?: () => void;
}

export function TopBar({ onOpenMenu }: TopBarProps = {}) {
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const saveName = useSaveFile((s) => s.name);
  const sourceSaveFilename = useSaveFile((s) => s.sourceSaveFilename);
  const sourceSaveName = useSaveFile((s) => s.sourceSaveName);
  const lastSyncedAt = useSaveFile((s) => s.lastSyncedAt);
  const loadSaveFile = useSaveFile((s) => s.loadSaveFile);
  const renameSave = useSaveFile((s) => s.renameSave);
  const logout = useAuth((s) => s.logout);

  // User menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Profile window — shared with the save-file picker, see ProfileModal.
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [userMenuOpen]);

  // Saves dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [loadingSaves, setLoadingSaves] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [showPathChoice, setShowPathChoice] = useState(false);
  const [showGameImport, setShowGameImport] = useState(false);
  const [showReimport, setShowReimport] = useState(false);

  // Cross-save sync: when navigating to a save via the dropdown's Sync button,
  // we land here with ?sync=1 and auto-open the reimport modal once. We strip
  // the param immediately so refresh/back doesn't re-fire it.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('sync') !== '1' || !saveFileId) return;
    setShowReimport(true);
    params.delete('sync');
    const qs = params.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ''}`, { replace: true });
  }, [location.search, location.pathname, saveFileId, navigate]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function openDropdown() {
    setDropdownOpen(true);
    setLoadingSaves(true);
    try {
      const list = await api.listSaveFiles();
      setSaves(list);
    } finally {
      setLoadingSaves(false);
    }
  }

  function startRename(sf: SaveMeta, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(sf.id);
    setRenameValue(sf.name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  async function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      if (renamingId === saveFileId) {
        await renameSave(trimmed);
      } else {
        await api.renameSaveFile(renamingId, trimmed);
        announceSaveRename(renamingId, trimmed);
      }
      setSaves((prev) => prev.map((s) => s.id === renamingId ? { ...s, name: trimmed } : s));
    }
    setRenamingId(null);
  }

  function handleRenameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') setRenamingId(null);
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setRenamingId(null);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [dropdownOpen]);

  return (
  <>
    <header className="topbar h-12 bg-c-base border-b border-c-border flex items-center px-3 sm:px-4 gap-2 sm:gap-3 sticky top-0 z-50">
      {/* Mobile hamburger — opens the sidebar drawer */}
      {onOpenMenu && (
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="md:hidden -ml-1 w-9 h-9 flex items-center justify-center rounded-md text-c-muted hover:text-c-accent hover:bg-c-panel border-none bg-transparent shrink-0"
        >
          <List size={20} weight="bold" />
        </button>
      )}

      {/* Save name — static display */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-bold text-c-text truncate max-w-xs block select-none tracking-headline">
          {saveName}
        </span>
        {import.meta.env.DEV && (
          <span className="shrink-0 text-2xs font-bold uppercase tracking-label bg-c-warn-bg text-c-gold border border-c-warn-border rounded-md px-1.5 py-0.5 select-none">
            DEV
          </span>
        )}
        {/* Sync / Link — entry point to GameReimport. Shows for every save:
            when sourceSaveFilename is set it surfaces last sync time; for
            from-scratch saves it offers an "Import save" first-link path. */}
        {saveFileId && (() => {
          const linked = !!sourceSaveFilename;
          const rel = linked ? formatRelativeTime(lastSyncedAt) : null;
          const tooltip = linked
            ? (rel
                ? `Last synced ${rel}. Click to pull in changes from your .save.`
                : `Originally imported from ${sourceSaveFilename}. Click to pull in changes.`)
            : 'Import a .save file to pull in your sims, households, and lots from your game.';
          return (
            <Tooltip text={tooltip}>
              <button
                onClick={() => setShowReimport(true)}
             
                aria-label={linked ? 'Sync from save' : 'Import a save file'}
                className="shrink-0 hidden sm:inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-c-green border border-c-accent-border hover:border-c-accent hover:bg-c-accent-soft bg-c-accent-soft rounded-md px-2.5 py-1 transition-colors cursor-pointer"
              >
                <ArrowsClockwise size={12} weight="bold" />
                <span className="normal-case tracking-normal font-semibold">{linked ? `Sync${rel ? ` · ${rel}` : ''}` : 'Import save'}</span>
              </button>
            </Tooltip>
          );
        })()}
      </div>

      {/* My Saves switcher */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={dropdownOpen ? () => setDropdownOpen(false) : openDropdown}
          className="flex items-center gap-1.5 text-xs font-medium text-c-muted hover:text-c-accent border border-c-border hover:border-c-accent rounded-lg px-3 py-1.5 transition-colors bg-c-card"
        >
          <FloppyDisk size={14} weight="duotone" />
          <span className="hidden sm:inline">My Saves</span>
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 w-[min(24rem,calc(100vw-1.5rem))] bg-c-card border border-c-border rounded-xl shadow-lg z-[200] overflow-hidden">
            {/* Prominent entry to full management (export, restore, duplicate,
                trash all live there — the picker stays a fast switcher). */}
            <button
              onClick={() => { setDropdownOpen(false); navigate('/saves'); }}
              className="w-full border-b border-c-border text-xs font-semibold text-c-text bg-c-panel hover:bg-c-border px-3 py-2.5 flex items-center justify-between gap-2 transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <FloppyDisk size={13} weight="duotone" className="text-c-muted" />
                Manage saves
              </span>
              <span aria-hidden className="text-c-muted">→</span>
            </button>

            <div className="p-1">
              {loadingSaves ? (
                <PlumbobLoader size="sm" />
              ) : saves.length === 0 ? (
                <p className="text-xs text-c-dim px-3 py-2">No saves found</p>
              ) : (
                (() => {
                  // Quick-switcher stays compact: most-recent saves only (plus
                  // the current one), with a link to the full page for the rest.
                  const recent = saves.slice(0, 6);
                  const shown = recent.some((s) => s.id === saveFileId)
                    ? recent
                    : [...saves.filter((s) => s.id === saveFileId), ...recent].slice(0, 6);
                  return shown.map((sf) => {
                  const isCurrent = sf.id === saveFileId;
                  const isRenaming = renamingId === sf.id;

                  return (
                    <div
                      key={sf.id}
                      className={`flex items-center gap-1 rounded-lg px-2 py-1.5 group cursor-pointer ${isCurrent ? 'bg-c-accent-soft' : 'hover:bg-c-panel'}`}
                      onClick={() => { if (!isRenaming) { navigate(`/saves/${sf.id}`); setDropdownOpen(false); } }}
                    >
                      {/* Name / rename input */}
                      <div className="flex-1 min-w-0">
                        {isRenaming ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={handleRenameKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-xs font-medium border border-c-accent rounded-md px-2 py-1 outline-none bg-c-card text-c-text"
                          />
                        ) : (
                          <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-c-green' : 'text-c-text'}`}>
                            {sf.name}
                          </p>
                        )}
                      </div>

                      {/* Action buttons — icon-only so they stay compact */}
                      <div className={`flex items-center gap-0.5 shrink-0 ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                        <IconBtn
                          onClick={(e) => {
                            e.stopPropagation();
                            setDropdownOpen(false);
                            if (isCurrent) {
                              setShowReimport(true);
                            } else {
                              navigate(`/saves/${sf.id}?sync=1`);
                            }
                          }}
                          title="Sync from .save file"
                          hover="accent"
                        >
                          <ArrowsClockwise size={12} weight="bold" />
                        </IconBtn>
                        {!isRenaming && (
                          <IconBtn onClick={(e) => startRename(sf, e)} title="Rename">
                            <PencilSimple size={12} weight="bold" />
                          </IconBtn>
                        )}
                      </div>

                      {isCurrent && !dropdownOpen && (
                        <span className="ml-1 text-2xs text-c-accent shrink-0">current</span>
                      )}
                    </div>
                  );
                  });
                })()
              )}
            </div>

            <div className="border-t border-c-border p-1">
              <button
                onClick={() => { setDropdownOpen(false); setShowPathChoice(true); }}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-c-accent hover:bg-c-accent-soft rounded-lg px-3 py-2 font-semibold transition-colors"
              >
                <PlusCircle size={14} weight="bold" /> New save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative" ref={userMenuRef}>
        <Tooltip text="Account">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
         
            className="flex items-center justify-center w-8 h-8 rounded-full bg-c-panel border border-c-border text-c-muted hover:text-c-accent hover:border-c-accent transition-colors" aria-label="Account">
            <UserCircle size={18} weight="duotone" />
          </button>
        </Tooltip>

        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-c-card border border-c-border rounded-xl shadow-lg z-[200] overflow-hidden p-1">
            <button
              onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
              className="w-full text-left text-xs text-c-text hover:bg-c-panel rounded-lg px-3 py-2 transition-colors"
            >
              Profile
            </button>
            {saveFileId && (
              <button
                onClick={() => { setUserMenuOpen(false); navigate(`/saves/${saveFileId}/settings`); }}
                className="w-full text-left text-xs text-c-text hover:bg-c-panel rounded-lg px-3 py-2 transition-colors"
              >
                Settings
              </button>
            )}
            <a
              href="/about"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-c-text hover:bg-c-panel rounded-lg px-3 py-2 transition-colors no-underline"
            >
              About
            </a>
            <a
              href="/help"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setUserMenuOpen(false)}
              className="block text-xs text-c-text hover:bg-c-panel rounded-lg px-3 py-2 transition-colors no-underline"
            >
              Help
            </a>
            <button
              onClick={handleLogout}
              className="w-full text-left text-xs text-c-muted hover:text-c-red hover:bg-c-red-bg rounded-lg px-3 py-2 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>

    {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}

    {showPathChoice && !showGameImport && (
      <NewSaveChooser
        onImport={() => setShowGameImport(true)}
        onBlank={async () => {
          setShowPathChoice(false);
          setCreatingNew(true);
          try {
            const sf = await api.createSaveFile('New Save');
            navigate(`/saves/${sf.id}`);
          } finally {
            setCreatingNew(false);
          }
        }}
        onClose={() => setShowPathChoice(false)}
        blankBusy={creatingNew}
      />
    )}

    {showGameImport && (
      <GameImport
        onCancel={() => { setShowGameImport(false); setShowPathChoice(false); }}
        onComplete={(id, _name) => {
          setShowGameImport(false);
          setShowPathChoice(false);
          navigate(`/saves/${id}`);
        }}
      />
    )}

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

function IconBtn({
  onClick,
  title,
  disabled,
  hover = 'default',
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  disabled?: boolean;
  hover?: 'default' | 'accent' | 'danger';
  children: React.ReactNode;
}) {
  const hoverClasses =
    hover === 'accent' ? 'hover:text-c-accent hover:bg-c-accent-soft'
    : hover === 'danger' ? 'hover:text-c-red hover:bg-c-red-bg'
    : 'hover:text-c-text hover:bg-c-panel';
  return (
    <Tooltip text={title}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
        className={`p-1.5 text-c-muted ${hoverClasses} rounded-md transition-colors border border-c-border cursor-pointer disabled:opacity-40`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
