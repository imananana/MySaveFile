import { useState, useMemo } from 'react';
import { X, Plus, ArrowSquareOut, Trash, PuzzlePiece, CaretDown, EyeSlash, Eye, Link, MagnifyingGlass, List, Wrench, Package, Warning } from '@phosphor-icons/react';
import { Notes } from '../common/EntityText';
import { OverviewLanding, StatTile } from '../common/OverviewTiles';
import { useConfirm } from '../common/ConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { useSaveFile } from '../../store/useSaveFile';
import { safeHref } from '../../lib/url';
import type { Mod } from '../../types';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';

function ModCard({ mod, selected, onClick }: { mod: Mod; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-listnav-id={mod.id}
      className={`flex flex-col gap-1.5 px-3.5 py-2.5 border-b border-c-panel border-l-[3px] cursor-pointer text-left w-full transition-colors ${
        mod.excluded ? 'opacity-40' : ''
      } ${
        selected
          ? 'bg-c-accent-soft border-l-c-accent'
          : 'bg-transparent border-l-transparent hover:bg-c-panel'
      }`}
    >
      <span className="text-sm font-semibold text-c-text tracking-headline truncate">{mod.name || 'Unnamed'}</span>
      <div className="flex items-center gap-1.5">
        <span
          className={`text-2xs uppercase tracking-label font-bold rounded-full px-2 py-px border w-fit ${
            mod.importance === 'required'
              ? 'text-c-red bg-c-red-bg border-c-red-border'
              : 'text-c-dim bg-c-panel border-c-border'
          }`}
        >
          {mod.importance === 'required' ? 'Required' : 'Recommended'}
        </span>
        {mod.url && (
          <Link size={11} weight="bold" className="text-c-faint" />
        )}
      </div>
    </button>
  );
}

function ModColumn({
  title,
  tone,
  items,
  selectedId,
  onSelect,
  onCreate,
}: {
  title: string;
  tone: 'accent' | 'plum';
  items: Mod[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const headerClasses = tone === 'accent'
    ? { title: 'text-c-green', bar: 'border-t-2 border-t-c-accent-border' }
    : { title: 'text-c-secondary', bar: 'border-t-2 border-t-c-secondary-border' };
  const ctaClasses = tone === 'accent'
    ? 'bg-c-accent hover:bg-c-accent-hover text-white'
    : 'bg-c-secondary hover:bg-c-secondary-hover text-white';
  const linksClasses = tone === 'accent'
    ? 'border-c-accent-border text-c-green hover:bg-c-accent-soft'
    : 'border-c-secondary-border text-c-secondary hover:bg-c-secondary-soft';
  const [search, setSearch] = useState('');
  const [showLinks, setShowLinks] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const visible = useMemo(() => items.filter((m) => !m.excluded), [items]);
  const hidden = useMemo(() => items.filter((m) => m.excluded), [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return visible.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [visible, search]);

  const filteredHidden = useMemo(() => {
    const q = search.toLowerCase();
    return hidden.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [hidden, search]);

  const withLinks = visible.filter((m) => m.url);

  return (
    <div className={`w-full lg:w-64 lg:shrink-0 flex-1 min-h-0 lg:flex-none border-b lg:border-b-0 lg:border-r border-c-border flex flex-col bg-c-card relative ${headerClasses.bar}`}>
      <div className="px-4 py-4 border-b border-c-border flex flex-col gap-3">
        {/* Tier-2 rail title like every other manager. Mods keeps its colour:
            it's the one two-rail manager, and green-vs-plum is what tells the
            Mods rail from the CC rail. */}
        <h2 className={`text-xl font-bold m-0 tracking-headline ${headerClasses.title}`}>{title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onCreate}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 border-none rounded-lg py-2 cursor-pointer transition-colors shadow-sm ${ctaClasses}`}
          >
            <Plus size={14} weight="bold" />
            <span className="text-2xs font-semibold uppercase tracking-label">New</span>
          </button>
          <button
            onClick={() => setShowLinks((v) => !v)}
            className={`inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-label border rounded-lg px-2.5 py-2 cursor-pointer bg-transparent transition-colors ${linksClasses}`}
          >
            <Link size={12} weight="bold" />
            Links
          </button>
        </div>
        <div className="relative">
          <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
          <input
            placeholder={`Search ${title.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-c-base border border-c-border rounded-md pl-9 pr-9 py-[6px] text-c-text text-xs w-full outline-none focus:border-c-accent"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-c-faint hover:text-c-text p-1"
              aria-label="Clear search"
            >
              <X size={11} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {showLinks && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-c-card border border-c-border shadow-xl rounded-b-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-c-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-c-text tracking-headline m-0">Links</h3>
            <button onClick={() => setShowLinks(false)} aria-label="Close" className="text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg bg-transparent border-none cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {withLinks.length === 0 ? (
              <div className="px-4 py-4 text-xs text-c-faint italic">No links added yet.</div>
            ) : (
              withLinks.map((m) => (
                <a
                  key={m.id}
                  href={safeHref(m.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-4 py-2.5 border-b border-c-panel no-underline hover:bg-c-accent-soft transition-colors"
                >
                  <span className="text-sm font-medium text-c-text truncate">{m.name || 'Unnamed'}</span>
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-label text-c-green ml-2 shrink-0">
                    Open <ArrowSquareOut size={11} weight="bold" />
                  </span>
                </a>
              ))
            )}
          </div>
        </div>
      )}

      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 && filteredHidden.length === 0 && (
          search ? (
            <div className="px-3 py-10 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-c-secondary-soft text-c-secondary mb-2">
                <MagnifyingGlass size={18} weight="duotone" />
              </div>
              <p className="text-xs font-semibold text-c-text mb-0.5">No matches</p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-2xs font-semibold uppercase tracking-label text-c-accent hover:underline bg-transparent border-none cursor-pointer mt-1"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="px-3 py-8 text-center text-xs text-c-faint">
              No {title.toLowerCase()} yet.
            </div>
          )
        )}
        {filtered.map((m) => (
          <ModCard
            key={m.id}
            mod={m}
            selected={m.id === selectedId}
            onClick={() => onSelect(m.id)}
          />
        ))}

        {filteredHidden.length > 0 && (
          <div className="border-t border-c-border mt-1">
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="w-full flex items-center justify-between px-[14px] py-2 bg-transparent border-none cursor-pointer text-2xs font-semibold text-c-faint uppercase tracking-label hover:text-c-text transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <EyeSlash size={11} weight="bold" />
                Hidden ({filteredHidden.length})
              </span>
              <CaretDown
                size={11}
                weight="bold"
                className={`transition-transform duration-200 ${showHidden ? 'rotate-180' : ''}`}
              />
            </button>
            {showHidden && filteredHidden.map((m) => (
              <ModCard
                key={m.id}
                mod={m}
                selected={m.id === selectedId}
                onClick={() => onSelect(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModManager() {
  const mods = useSaveFile((s) => s.mods);
  const addMod = useSaveFile((s) => s.addMod);
  const updateMod = useSaveFile((s) => s.updateMod);
  const deleteMod = useSaveFile((s) => s.deleteMod);
  const excludeMod = useSaveFile((s) => s.excludeMod);
  const unexcludeMod = useSaveFile((s) => s.unexcludeMod);
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false); // narrow-screen list drawer
  const [editingName, setEditingName] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [isNameDirty, setIsNameDirty] = useState(false);
  const [isUrlDirty, setIsUrlDirty] = useState(false);
  const [isNotesDirty, setIsNotesDirty] = useState(false);

  const modsList = useMemo(
    () => Object.values(mods).filter((m) => m.type === 'Mod').sort((a, b) => a.name.localeCompare(b.name)),
    [mods],
  );
  const ccList = useMemo(
    () => Object.values(mods).filter((m) => m.type === 'CC').sort((a, b) => a.name.localeCompare(b.name)),
    [mods],
  );

  const selected = selectedId ? mods[selectedId] : null;

  const stats = useMemo(() => {
    const all = Object.values(mods);
    return {
      total: all.length,
      modCount: modsList.length,
      ccCount: ccList.length,
      requiredCount: all.filter((m) => m.importance === 'required').length,
    };
  }, [mods, modsList.length, ccList.length]);

  function selectMod(id: string) {
    const m = mods[id];
    setSelectedId(id);
    setEditingName(m.name);
    setEditingUrl(m.url);
    setEditingNotes(m.notes);
    setIsNameDirty(false);
    setIsUrlDirty(false);
    setIsNotesDirty(false);
  }

  // Both columns share one selection, so nav walks Mods then CC as one list.
  useListKeyboardNav({ items: [...modsList, ...ccList], selectedId, onSelect: selectMod });

  async function handleCreate(type: 'Mod' | 'CC') {
    const id = await addMod({ name: '', url: '', type, importance: 'recommended', notes: '' });
    setSelectedId(id);
    setEditingName('');
    setEditingUrl('');
    setEditingNotes('');
    setIsNameDirty(false);
    setIsUrlDirty(false);
    setIsNotesDirty(false);
  }

  function handleNameBlur() {
    if (!selected || !isNameDirty) return;
    updateMod(selected.id, { name: editingName });
    setIsNameDirty(false);
  }

  function handleUrlBlur() {
    if (!selected || !isUrlDirty) return;
    updateMod(selected.id, { url: editingUrl });
    setIsUrlDirty(false);
  }

  function handleNotesBlur() {
    if (!selected || !isNotesDirty) return;
    updateMod(selected.id, { notes: editingNotes });
    setIsNotesDirty(false);
  }

  async function handleDelete() {
    if (!selected) return;
    const label = selected.name || 'this mod';
    // The button beside this one is per-save, so "delete" has to say that it
    // isn't — the list belongs to the account, not to the save you're in.
    if (!await confirm({
      message: `Delete "${label}"? It goes from every save, not just this one.`,
      confirmLabel: 'Delete',
      danger: true,
    })) return;
    setSelectedId(null);
    await deleteMod(selected.id);
  }

  async function handleToggleExclude() {
    if (!selected) return;
    if (selected.excluded) {
      await unexcludeMod(selected.id);
    } else {
      await excludeMod(selected.id);
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] relative max-w-[1600px] w-full">
      {/* Backdrop for the list drawer (below lg only). */}
      {railOpen && (
        <button type="button" aria-label="Close list" onClick={() => setRailOpen(false)} className="lg:hidden absolute inset-0 z-30 bg-black/40 border-none cursor-pointer" />
      )}

      {/* Mods + CC list columns. Inline (side by side) at lg+, collapsed into a
          single stacked drawer below lg so the detail pane keeps full width. */}
      <aside
        className={`w-[300px] lg:w-auto shrink-0 flex flex-col lg:flex-row bg-c-card
          absolute inset-y-0 left-0 z-40 shadow-2xl transition-transform ${railOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:z-auto lg:shadow-none lg:translate-x-0 lg:transition-none`}
      >
        <button type="button" onClick={() => setRailOpen(false)} aria-label="Close list" className="lg:hidden absolute top-2 right-2 z-10 w-7 h-7 rounded-md flex items-center justify-center text-c-dim hover:text-c-text hover:bg-c-panel bg-transparent border-none cursor-pointer">
          <X size={15} weight="bold" />
        </button>
        {/* Mods column */}
        <ModColumn
          title="Mods"
          tone="accent"
          items={modsList}
          selectedId={selectedId}
          onSelect={selectMod}
          onCreate={() => handleCreate('Mod')}
        />

        {/* CC column */}
        <ModColumn
          title="Custom Content"
          tone="plum"
          items={ccList}
          selectedId={selectedId}
          onSelect={selectMod}
          onCreate={() => handleCreate('CC')}
        />
      </aside>

      {/* Detail panel */}
      <div className="flex-1 min-w-0 flex flex-col">
      <div className="lg:hidden shrink-0 px-2 pt-2 bg-c-base">
        <button type="button" onClick={() => setRailOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-c-border bg-c-card px-2.5 py-1.5 text-xs font-semibold text-c-dim hover:text-c-text cursor-pointer transition-colors">
          <List size={14} weight="bold" /> Mods &amp; CC
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-8 bg-c-base">
        {!selected && stats.total === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="bg-c-card border border-c-border rounded-xl w-full max-w-md">
              <EmptyState
                icon={<PuzzlePiece size={28} weight="duotone" />}
                title="No mods or CC tracked yet"
                description="Keep a list of the mods and custom content this save relies on. Mark required vs. recommended, link to the source, and exclude per-save when needed."
                cta={{ label: '+ Mod', onClick: () => handleCreate('Mod') }}
                secondary={{ label: '+ CC', onClick: () => handleCreate('CC') }}
              />
            </div>
          </div>
        ) : !selected ? (
          <OverviewLanding
            title="Mods at a glance"
            columns={3}
          >
            <StatTile
              tone="green"
              label="Mods"
              value={stats.modCount}
              sub="gameplay mods"
              icon={<Wrench size={20} weight="duotone" />}
            />
            <StatTile
              tone="plum"
              label="CC"
              value={stats.ccCount}
              sub="custom content"
              icon={<Package size={20} weight="duotone" />}
            />
            {/* The number someone installing this save actually needs. Neutral,
                not red: it's a fact about the list, not an alarm. */}
            <StatTile
              tone="neutral"
              label="Required"
              value={stats.requiredCount}
              sub="the save needs these"
              icon={<Warning size={20} weight="duotone" />}
            />
          </OverviewLanding>
        ) : (
          <div className="flex flex-col gap-8 max-w-3xl">
            <input
              value={editingName}
              onChange={(e) => { setEditingName(e.target.value); setIsNameDirty(true); }}
              onBlur={handleNameBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="Mod name"
              className="text-3xl font-extrabold bg-transparent border-none border-b border-transparent hover:border-c-border focus:border-c-accent text-c-text w-full py-1 outline-none transition-colors tracking-headline placeholder:text-c-faint"
            />

            <div className="grid grid-cols-2 gap-x-10 gap-y-8">
              {/* Left column */}
              <div className="flex flex-col gap-6">
                <div>
                  <label className="flex items-center gap-1.5 text-2xs font-semibold text-c-dim uppercase tracking-label block mb-2">
                    <Link size={12} weight="fill" />
                    Link / URL
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      value={editingUrl}
                      onChange={(e) => { setEditingUrl(e.target.value); setIsUrlDirty(true); }}
                      onBlur={handleUrlBlur}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="https://..."
                      className="flex-1 bg-c-card border border-c-border rounded-md px-3 py-2 text-c-text text-sm outline-none focus:border-c-accent placeholder:text-c-faint"
                    />
                    {selected.url && (
                      <a
                        href={safeHref(selected.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-c-green text-2xs font-semibold uppercase tracking-label border border-c-accent-border rounded-md px-2.5 py-2 no-underline bg-c-accent-soft hover:bg-c-accent-soft shrink-0 transition-colors"
                      >
                        Open
                        <ArrowSquareOut size={12} weight="bold" />
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-2xs font-semibold text-c-dim uppercase tracking-label block mb-2">
                    Type
                  </label>
                  <div className="flex gap-1.5">
                    {(['Mod', 'CC'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => updateMod(selected.id, { type: t })}
                        className={`text-2xs font-semibold uppercase tracking-label px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                          selected.type === t
                            ? t === 'CC'
                              ? 'text-c-secondary bg-c-secondary-soft border-c-secondary-border'
                              : 'text-c-green bg-c-accent-soft border-c-accent-border'
                            : 'text-c-dim bg-transparent border-c-border hover:bg-c-panel'
                        }`}
                      >
                        {t === 'CC' ? 'Custom Content' : 'Mod'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-6">
                <div>
                  <label className="text-2xs font-semibold text-c-dim uppercase tracking-label block mb-2">
                    Importance
                  </label>
                  <div className="flex gap-1.5">
                    {(['required', 'recommended'] as const).map((imp) => (
                      <button
                        key={imp}
                        onClick={() => updateMod(selected.id, { importance: imp })}
                        className={`text-2xs font-semibold uppercase tracking-label px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                          selected.importance === imp
                            ? imp === 'required'
                              ? 'text-c-red bg-c-red-bg border-c-red-border'
                              : 'text-c-dim bg-c-panel border-c-border-mid'
                            : 'text-c-dim bg-transparent border-c-border hover:bg-c-panel'
                        }`}
                      >
                        {imp.charAt(0).toUpperCase() + imp.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <Notes
                  value={editingNotes}
                  onChange={(v) => { setEditingNotes(v); setIsNotesDirty(true); }}
                  onBlur={handleNotesBlur}
                  rows={6}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-c-border flex items-center gap-2">
              <button
                onClick={handleToggleExclude}
                className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-c-dim hover:text-c-text border border-c-border hover:border-c-border-mid rounded-lg px-3 py-2 bg-transparent cursor-pointer transition-colors"
              >
                {selected.excluded ? <Eye size={12} weight="bold" /> : <EyeSlash size={12} weight="bold" />}
                {selected.excluded ? 'Show in this save' : 'Hide from this save'}
              </button>
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 bg-transparent border border-c-red-bg hover:border-c-red-border hover:bg-c-red-bg rounded-lg px-3 py-2 text-c-red-muted hover:text-c-red cursor-pointer text-2xs font-semibold uppercase tracking-label transition-colors"
              >
                <Trash size={12} weight="bold" />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
