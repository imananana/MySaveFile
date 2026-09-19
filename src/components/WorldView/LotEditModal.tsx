import { useState, useMemo, useEffect, type CSSProperties } from 'react';
import type { PlannedLot, LotStatus } from '../../types';
import { useSaveFile } from '../../store/useSaveFile';
import { getAllLotTypes, getLotCategory, HIDDEN_LOT_TYPES, isClubHangoutEligible, isSmallBusinessEligible } from '../../data/worlds';
import { isLotTypeOwned } from '../../data/lotTypePacks';
import { usePackOwnership } from '../../store/usePackOwnership';
import { getLotIconSrc } from '../../data/lotIcons';
import { VENUE_KIND_ICON } from '../../data/venueIcons';
import { api } from '../../lib/api';
import { Dropdown } from '../common/Dropdown';
import { CreateHouseholdModal } from '../HouseholdManager/CreateHouseholdModal';
import { BuiltPhotoStrip } from './lotEdit/BuiltPhotoStrip';
import { InspoPhotoSection } from './lotEdit/InspoPhotoSection';
import { Notes, AuthoredDescription } from '../common/EntityText';
import {
  X, CaretDown, PencilSimple, ArrowCounterClockwise, Trash, Plus, User, UserPlus,
  ArrowRight, Storefront, UsersThree,
} from '@phosphor-icons/react';
import { useEscapeToClose } from '../common/useEscapeToClose';
import { iconBtn } from '../common/btn';
import { useConfirm } from '../common/ConfirmDialog';
import { Tooltip } from '../common/Tooltip';

const ALL_TYPES = getAllLotTypes();
const STATUS_OPTIONS: LotStatus[] = ['unplanned', 'planned', 'built'];

// Status colors match the lot-tile / map grammar (built green, planned plum,
// unplanned neutral). Dots always show their true colour; the active segment
// gets the soft tint + border.
const STATUS_UI: Record<LotStatus, { label: string; dot: string; bg: string; border: string; text: string }> = {
  unplanned: { label: 'Unplanned', dot: '#a89e8f', bg: '#f3efe7', border: '#e8e1d4', text: '#7a7268' },
  planned:   { label: 'Planned',   dot: '#7c5cbf', bg: '#f3eefb', border: '#d6c5f0', text: '#6b46c1' },
  built:     { label: 'Built',     dot: '#16a34a', bg: '#ecfdf3', border: '#c9e4d0', text: '#15803d' },
};

// Auto-size the name input to its content so the pencil/revert sit flush next to
// the text (not stranded at the end of a full-width field). `field-sizing` isn't
// in the CSS types yet, hence the cast.
const FIELD_SIZING: CSSProperties = { fieldSizing: 'content' } as CSSProperties;

function maxHouseholdsForType(customType: string): number {
  if (customType === 'Residential Rental') return 6;
  const cat = getLotCategory(customType);
  if (cat === 'home') return 1;
  return 0;
}

interface LotEditModalProps {
  lot: PlannedLot;
  onClose: () => void;
  onPhotoChange?: () => void;
}

// Small uppercase section label, shared across the editor.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-2xs font-bold uppercase tracking-label text-c-secondary">{children}</span>;
}

export function LotEditModal({ lot, onClose, onPhotoChange }: LotEditModalProps) {
  useEscapeToClose(onClose);
  const saveFileId = useSaveFile((s) => s.saveFileId)!;
  const updateLot = useSaveFile((s) => s.updateLot);
  const assignHousehold = useSaveFile((s) => s.assignHousehold);
  const unassignHousehold = useSaveFile((s) => s.unassignHousehold);
  const households = useSaveFile((s) => s.households);
  const clubs = useSaveFile((s) => s.clubs);
  const smallBusinesses = useSaveFile((s) => s.smallBusinesses);
  const customVenues = useSaveFile((s) => s.customVenues);

  const isTypeLocked = lot.defaultType === 'Apartment' || HIDDEN_LOT_TYPES.has(lot.defaultType);
  const confirm = useConfirm();
  const [customName, setCustomName] = useState(lot.customName ?? lot.name);
  const [selectedOption, setSelectedOption] = useState(
    ALL_TYPES.includes(lot.customType) ? lot.customType : ALL_TYPES[0]
  );
  const [status, setStatus] = useState<LotStatus>(lot.status ?? 'unplanned');
  const [notes, setNotes] = useState(lot.notes);
  const [description, setDescription] = useState(lot.description ?? '');
  const [inspoOpen, setInspoOpen] = useState(false);
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [showHouseholdControls, setShowHouseholdControls] = useState(false);
  const [householdSearch, setHouseholdSearch] = useState('');
  const [householdSearchFocused, setHouseholdSearchFocused] = useState(false);
  const [showCasCreate, setShowCasCreate] = useState(false);

  useEffect(() => {
    api.listBuiltPhotos(saveFileId, 'lot', lot.lotKey).then((data) => {
      if (data.length > 0) setShowcaseOpen(true);
    });
    api.listInspoPhotos(saveFileId).then((data) => {
      const hasAssigned = data.some(
        (p) => p.assignment?.target_type === 'lot' && p.assignment?.target_key === lot.lotKey
      );
      if (hasAssigned) setInspoOpen(true);
    });
  }, [saveFileId, lot.lotKey]);

  const effectiveType = isTypeLocked ? lot.defaultType : selectedOption;
  const maxHouseholds = maxHouseholdsForType(effectiveType);

  // Lot type picker limited to owned packs; the lot's current type always stays
  // in the list so it can't vanish when its pack is off.
  const isOwned = usePackOwnership((s) => s.isOwned);
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  const typeOptions = useMemo(
    () => ALL_TYPES
      .filter((t) => t === selectedOption || isLotTypeOwned(t, isOwned))
      .map((t) => ({ value: t, label: t })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedOption, isOwned, manualOverrides, autoDetected],
  );

  const liveLot = useSaveFile((s) => s.lots[lot.lotKey]);
  const currentHouseholdIds = liveLot?.householdIds ?? lot.householdIds ?? [];
  const currentHouseholds = currentHouseholdIds.map((id) => households[id]).filter(Boolean);
  const canAddMore = maxHouseholds > 0 && currentHouseholdIds.length < maxHouseholds;

  const filteredHouseholds = useMemo(() => {
    const q = householdSearch.toLowerCase();
    return Object.values(households).filter((h) => {
      if (!h.name.toLowerCase().includes(q)) return false;
      if (currentHouseholdIds.includes(h.id)) return false;
      if (maxHouseholds === 1 && h.assignedLotKey) return false;
      return true;
    });
  }, [households, householdSearch, currentHouseholdIds, maxHouseholds]);

  const isSBEligible = isSmallBusinessEligible(effectiveType);
  const isClubEligible = isClubHangoutEligible(effectiveType);
  const assignedSB = useMemo(
    () => Object.values(smallBusinesses).find((sb) => sb.assignedLotKeys.includes(lot.lotKey)) ?? null,
    [smallBusinesses, lot.lotKey],
  );
  const currentClubIds = liveLot?.clubIds ?? lot.clubIds ?? [];
  const currentClubs = currentClubIds.map((id) => clubs[id]).filter(Boolean);
  // Businesses are Businesses & Hobbies, club hangouts are Get Together. Without
  // the pack there is no such thing to put here, so the slot doesn't appear —
  // the same rule the lot-type list follows. Anything actually ON the lot still
  // shows either way: ownership gates what you can add, never what you have.
  const showBusiness = (isSBEligible && isOwned('EP18')) || !!assignedSB;
  const showClub = (isClubEligible && isOwned('EP02')) || currentClubs.length > 0;
  // A venue lot IS the game's "Custom Venue" type — unlike a business, which is
  // merely located somewhere — so the type is the whole gate: pick Custom Venue
  // from the list and the slot appears immediately, ready to jump to the editor;
  // pick anything else and it's gone, because the lot can't run a schedule.
  const assignedVenue = useMemo(
    () => Object.values(customVenues).find((cv) => cv.lotKey === lot.lotKey) ?? null,
    [customVenues, lot.lotKey],
  );
  const showVenue = effectiveType === 'Custom Venue';

  // What YOUR SAVE last reported for this lot — the same baseline the re-sync
  // merges against (`lastSaved ?? seed default`, see diffLots). The revert must
  // aim here, not at the seed: reverting a game-renamed lot to the app's own
  // built-in name writes a value that diverges from the save, which the next
  // sync then reads as a deliberate edit and never restores. The seed name is
  // still shown beside the size — it's what people search the gallery by.
  const savedName = lot.lastSaved?.customName ?? lot.name;
  const savedType = lot.lastSaved?.customType ?? lot.defaultType;

  const nameEdited = customName !== savedName;
  const typeEdited = !isTypeLocked && effectiveType !== savedType;
  const renamedFromDefault = lot.customName !== lot.name;

  // ── Auto-save wiring (no Save button; text commits on blur) ─────────────────
  // Once you've done anything to a lot it counts as planned; a showcase photo
  // means it's built. We only ever bump the status *up* — never downgrade — so
  // an explicit status the user sets still sticks against lesser actions.
  function bumpToPlanned() {
    if (status === 'unplanned') pickStatus('planned');
  }
  function bumpToBuilt() {
    if (status !== 'built') pickStatus('built');
  }

  function commitName() {
    const next = customName.trim() || savedName;
    if (next !== customName) setCustomName(next);
    updateLot(lot.lotKey, { customName: next });
    if (next !== savedName) bumpToPlanned();
  }
  function revertName() {
    setCustomName(savedName);
    updateLot(lot.lotKey, { customName: savedName });
  }
  function pickType(value: string) {
    setSelectedOption(value);
    updateLot(lot.lotKey, { customType: value });
    if (value !== savedType) bumpToPlanned();
  }
  function revertType() {
    setSelectedOption(savedType);
    updateLot(lot.lotKey, { customType: savedType });
  }
  function pickStatus(s: LotStatus) {
    setStatus(s);
    updateLot(lot.lotKey, { status: s });
  }
  function commitNotes() {
    updateLot(lot.lotKey, { notes });
    if (notes.trim()) bumpToPlanned();
  }
  function commitDescription() {
    updateLot(lot.lotKey, { description });
    if (description.trim()) bumpToPlanned();
  }

  function handleAssign(householdId: string) {
    // The controls above only offer this while there's room, so a refusal here
    // means the lot filled up elsewhere — the store toasts and rolls back.
    assignHousehold(lot.lotKey, householdId).catch(() => {});
    setHouseholdSearch('');
    bumpToPlanned();
  }
  function handleUnassign(householdId: string) {
    unassignHousehold(lot.lotKey, householdId).catch(() => {});
  }

  // Showcase strip reports its new photo count: any showcase shot means built.
  function handleShowcaseChange(count: number) {
    if (count > 0) bumpToBuilt();
    onPhotoChange?.();
  }

  // Reset the lot to empty: clears authored fields back to the game's own
  // defaults and moves out every household. Businesses/clubs live in their own
  // editors, and photos are attached to the lot, so none of those are touched.
  //
  // A FACTORY reset, not a revert \u2014 deliberately (2026-08-12). It only ever
  // REMOVES, so unlike a revert it can't set off a chain: putting a household
  // back would pull them off whatever lot they're on now, which would then
  // diverge from the save in turn. That also makes it partial on occupancy \u2014 it
  // empties the lot rather than restoring the household your save has there \u2014
  // and the confirm has to say so, because "reset" invites the other reading.
  async function resetLot() {
    // Biggest consequence first, and the occupancy line only when there IS
    // anyone — on an empty lot it's noise.
    const lines = [
      `Reset ${lot.customName || lot.name}?`,
      '',
      ...(currentHouseholdIds.length > 0
        ? ['Everyone here moves out and is left without a lot.']
        : []),
      "Name and type go back to the game's originals, not to your save.",
      'Status, notes and description are gone for good.',
      '',
      'Photos, businesses and clubs are untouched.',
    ];
    if (!await confirm({
      message: lines.join('\n'),
      confirmLabel: 'Reset lot',
      danger: true,
    })) return;

    setCustomName(lot.name);
    setSelectedOption(ALL_TYPES.includes(lot.defaultType) ? lot.defaultType : ALL_TYPES[0]);
    setStatus('unplanned');
    setNotes('');
    setDescription('');
    updateLot(lot.lotKey, {
      customName: lot.name,
      customType: lot.defaultType,
      status: 'unplanned',
      notes: '',
      description: '',
    });
    // Sequential + awaited: these were fired off unhandled, so a failure partway
    // through left some households moved out and others not, silently. The store
    // rolls back and toasts per household now; carry on so one failure doesn't
    // strand the rest.
    for (const id of currentHouseholdIds) {
      await unassignHousehold(lot.lotKey, id).catch(() => {});
    }
  }

  const iconSrc = getLotIconSrc(effectiveType);

  return (
    <div
      className="fixed inset-0 bg-black/75 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-c-card border border-c-border shadow-2xl rounded-t-2xl sm:rounded-2xl w-full max-w-[660px] max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* ── Frozen title row (icon · name/size · close) — stays pinned on scroll ── */}
        <div className="shrink-0 px-5 sm:px-7 pt-8 pb-4 border-b border-c-border">
          <div className="flex items-center gap-3.5">
            {iconSrc && <img src={iconSrc} alt="" className="w-[46px] h-[46px] object-contain shrink-0" />}
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <div className="group/name inline-flex items-center gap-2 min-w-0 self-start border-b border-dashed border-c-border focus-within:border-solid focus-within:border-c-accent transition-colors">
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={FIELD_SIZING}
                  aria-label="Lot name"
                  className="min-w-0 max-w-full bg-transparent border-none text-2xl sm:text-[25px] font-extrabold text-c-text tracking-headline leading-tight outline-none p-0"
                />
                <PencilSimple size={16} weight="bold" className="shrink-0 text-c-faint group-focus-within/name:text-c-accent transition-colors" />
                {nameEdited && (
                  <Tooltip text={`Revert to “${savedName}”`}>
                    <button
                      onClick={revertName}
                   
                      aria-label="Revert lot name"
                      className="shrink-0 w-[22px] h-[22px] flex items-center justify-center rounded-md text-c-secondary hover:bg-c-secondary-soft bg-transparent border-none cursor-pointer transition-colors"
                    >
                      <ArrowCounterClockwise size={16} weight="bold" />
                    </button>
                  </Tooltip>
                )}
              </div>
              {/* Size, and — once the lot no longer goes by its built-in name —
                  that original name. It's what the lot is called in the gallery,
                  so it has to stay reachable somewhere once you rename a lot (or
                  the game does). Detail-line grammar: one muted `A · B` run. */}
              <span className="text-[13px] font-semibold text-c-dim flex items-center gap-1.5 flex-wrap">
                <span className="tabular-nums">{lot.size}</span>
                {renamedFromDefault && (
                  <>
                    <span className="text-c-faint" aria-hidden>·</span>
                    <span className="font-medium">Originally {lot.name}</span>
                  </>
                )}
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 self-start w-9 h-9 -mr-1 -mt-1 flex items-center justify-center rounded-lg text-c-dim hover:text-c-text hover:bg-c-panel bg-transparent border-none cursor-pointer transition-colors"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 min-h-0 px-5 sm:px-7 pt-4 pb-0 flex flex-col gap-[22px]">

          {/* ── Status ── */}
          <div>
            <div className="mb-2"><SectionLabel>Status</SectionLabel></div>
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map((s) => {
                const ui = STATUS_UI[s];
                const active = status === s;
                return (
                  <button
                    key={s}
                    // Logged here rather than inside pickStatus: renaming or
                    // annotating a lot calls that too (bumpToPlanned), and a
                    // side effect isn't someone using the control.
                    onClick={() => { pickStatus(s); api.logFeatureEvent('lot_status'); }}
                    style={active ? { background: ui.bg, borderColor: ui.border, color: ui.text } : undefined}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-2xs font-bold uppercase tracking-label transition-all cursor-pointer ${
                      active ? '' : 'border-c-border bg-c-base text-c-faint hover:text-c-dim'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ui.dot }} />
                    {ui.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Lot type ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <SectionLabel>Lot type</SectionLabel>
              {typeEdited && (
                <Tooltip text={`Revert to “${savedType}”`}>
                  <button
                    onClick={revertType}
                 
                    aria-label="Revert lot type"
                    className="w-[22px] h-[22px] flex items-center justify-center rounded-md text-c-secondary hover:bg-c-secondary-soft bg-transparent border-none cursor-pointer transition-colors"
                  >
                    <ArrowCounterClockwise size={16} weight="bold" />
                  </button>
                </Tooltip>
              )}
            </div>
            {isTypeLocked ? (
              <div className="text-sm text-c-muted font-medium px-3 py-2.5 bg-c-base border border-c-border rounded-lg">
                {lot.defaultType}
                <span className="ml-2 text-2xs text-c-faint">
                  {lot.defaultType === 'Apartment' ? '· type can’t change' : '· fixed type'}
                </span>
              </div>
            ) : (
              <Dropdown value={selectedOption} options={typeOptions} onChange={pickType} ariaLabel="Lot type" />
            )}
          </div>

          {/* ── Occupancy ── */}
          {maxHouseholds > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <SectionLabel>Occupancy</SectionLabel>
                {maxHouseholds > 1 && (
                  <span className="ml-auto text-2xs text-c-faint tabular-nums">
                    {currentHouseholdIds.length} / {maxHouseholds} units
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {currentHouseholds.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 bg-c-base border border-c-border rounded-lg px-3 py-2.5">
                    <span className="w-7 h-7 rounded-full bg-c-panel text-c-dim flex items-center justify-center shrink-0">
                      <User size={16} weight="bold" />
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm font-semibold text-c-text">{h.name}</span>
                    <button
                      onClick={() => handleUnassign(h.id)}
                      className="shrink-0 text-2xs font-bold uppercase tracking-label text-c-dim hover:text-c-red bg-transparent border-none cursor-pointer transition-colors"
                    >
                      Move out
                    </button>
                  </div>
                ))}

                {canAddMore && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowHouseholdControls((v) => !v)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-c-base border border-c-border hover:border-c-accent-border hover:bg-c-accent-soft text-c-muted text-xs font-bold cursor-pointer transition-colors"
                    >
                      <UserPlus size={16} weight="bold" className="text-c-accent" /> Move in household
                    </button>
                    <button
                      onClick={() => setShowCasCreate(true)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-c-base border border-c-border hover:border-c-accent-border hover:bg-c-accent-soft text-c-muted text-xs font-bold cursor-pointer transition-colors"
                    >
                      <Plus size={16} weight="bold" className="text-c-accent" /> Create household
                    </button>
                  </div>
                )}

                {canAddMore && showHouseholdControls && (
                  <div>
                    <input
                      placeholder="Search households"
                      value={householdSearch}
                      onChange={(e) => setHouseholdSearch(e.target.value)}
                      onFocus={() => setHouseholdSearchFocused(true)}
                      onBlur={() => setTimeout(() => setHouseholdSearchFocused(false), 150)}
                      className="w-full bg-c-base border border-c-border focus:border-c-accent rounded-lg px-3 py-2 text-c-text text-xs outline-none transition-colors"
                    />
                    {(householdSearch || householdSearchFocused) && (
                      <div className="mt-1.5 bg-c-base border border-c-border rounded-lg overflow-hidden max-h-[168px] overflow-y-auto">
                        {filteredHouseholds.length === 0 && (
                          <div className="px-3 py-2.5 text-xs text-c-faint">No households</div>
                        )}
                        {filteredHouseholds.map((h) => (
                          <button
                            key={h.id}
                            onClick={() => handleAssign(h.id)}
                            className="w-full bg-transparent border-none border-b border-c-panel px-3 py-2 text-left cursor-pointer text-c-text text-xs font-medium truncate hover:bg-c-accent-soft transition-colors"
                          >
                            {h.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── On this lot (business / club / venue) — one line, read-only jumps ── */}
          {(showBusiness || showClub || showVenue) && (
            <div>
              <div className="mb-2"><SectionLabel>On this lot</SectionLabel></div>
              <div className="flex bg-c-base border border-c-border rounded-lg overflow-hidden">
                {showBusiness && (
                  <div className={`flex-1 flex items-center gap-2 px-3 py-2 ${(showClub || showVenue) ? 'border-r border-c-border' : ''}`}>
                    {assignedSB?.icon
                      ? <img src={`/small-business-icons/${assignedSB.icon}.png`} alt="" className="w-4 h-4 object-contain shrink-0" />
                      : <Storefront size={15} weight="regular" className="text-c-dim shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-bold uppercase tracking-label text-c-faint">Business</div>
                      <div className={`text-xs font-semibold truncate ${assignedSB ? 'text-c-text' : 'text-c-dim font-medium'}`}>
                        {assignedSB ? (assignedSB.name || 'Unnamed Business') : 'None'}
                      </div>
                    </div>
                    <button
                      onClick={() => window.open(`/saves/${saveFileId}/small-businesses`, '_blank')}
                      aria-label="Open in Small Businesses (new tab)"
                      className={iconBtn(6)}
                    >
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  </div>
                )}
                {showClub && (
                  <div className={`flex-1 flex items-center gap-2 px-3 py-2 ${showVenue ? 'border-r border-c-border' : ''}`}>
                    {currentClubs[0]?.icon
                      ? <img src={`/club-icons/${currentClubs[0].icon}.png`} alt="" className="w-4 h-4 object-contain shrink-0" />
                      : <UsersThree size={15} weight="regular" className="text-c-dim shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-bold uppercase tracking-label text-c-faint">Club hangout</div>
                      <div className={`text-xs font-semibold truncate ${currentClubs.length > 0 ? 'text-c-text' : 'text-c-dim font-medium'}`}>
                        {currentClubs.length > 0 ? currentClubs.map((c) => c.name).join(', ') : 'None'}
                      </div>
                    </div>
                    <button
                      onClick={() => window.open(`/saves/${saveFileId}/clubs`, '_blank')}
                      aria-label="Open in Clubs (new tab)"
                      className={iconBtn(6)}
                    >
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  </div>
                )}
                {showVenue && (
                  <div className="flex-1 flex items-center gap-2 px-3 py-2">
                    <img src={VENUE_KIND_ICON.venue} alt="" className="w-4 h-4 object-contain shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-bold uppercase tracking-label text-c-faint">Custom venue</div>
                      <div className={`text-xs font-semibold truncate ${assignedVenue ? 'text-c-text' : 'text-c-dim font-medium'}`}>
                        {assignedVenue ? (assignedVenue.name || 'Unnamed venue') : 'None'}
                      </div>
                    </div>
                    <button
                      onClick={() => window.open(`/saves/${saveFileId}/custom-venues`, '_blank')}
                      aria-label="Open in Custom Venues (new tab)"
                      className={iconBtn(6)}
                    >
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Inspo photos (purple) ── */}
          <div>
            <button
              onClick={() => setInspoOpen((o) => !o)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 border border-c-border hover:border-c-secondary-border bg-c-card cursor-pointer transition-colors ${inspoOpen ? 'rounded-t-xl border-b-transparent' : 'rounded-xl'}`}
            >
              <span className="text-2xs font-bold text-c-secondary uppercase tracking-label">Inspo Photos</span>
              <CaretDown size={12} weight="bold" className={`text-c-secondary transition-transform ${inspoOpen ? '-rotate-180' : ''}`} />
            </button>
            {inspoOpen && (
              <div className="border border-c-border border-t-0 rounded-b-xl p-3.5 bg-c-card">
                <InspoPhotoSection saveFileId={saveFileId} lotKey={lot.lotKey} onAssigned={bumpToPlanned} />
              </div>
            )}
          </div>

          {/* ── Showcase photos (green) ── */}
          <div>
            <button
              onClick={() => setShowcaseOpen((o) => !o)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 border border-c-border hover:border-c-secondary-border bg-c-card cursor-pointer transition-colors ${showcaseOpen ? 'rounded-t-xl border-b-transparent' : 'rounded-xl'}`}
            >
              <span className="text-2xs font-bold text-c-secondary uppercase tracking-label">Showcase Photos</span>
              <CaretDown size={12} weight="bold" className={`text-c-secondary transition-transform ${showcaseOpen ? '-rotate-180' : ''}`} />
            </button>
            {showcaseOpen && (
              <div className="border border-c-border border-t-0 rounded-b-xl p-3.5 bg-c-card">
                <BuiltPhotoStrip saveFileId={saveFileId} lotKey={lot.lotKey} onPhotoChange={handleShowcaseChange} />
              </div>
            )}
          </div>

          {/* ── Description (authored, public) — collapsed unless it has text ── */}
          <AuthoredDescription value={description} onChange={setDescription} onBlur={commitDescription} collapsible defaultOpen={!!lot.description} />

          {/* ── Notes (private) — collapsed unless it has text ── */}
          <Notes value={notes} onChange={setNotes} onBlur={commitNotes} collapsible defaultOpen={!!lot.notes} />

          {/* ── Footer: reset + auto-save note ── */}
          <div className="flex items-center border-t border-c-border -mx-5 sm:-mx-7 px-5 sm:px-7 py-3.5 mt-0">
            <button
              onClick={resetLot}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer transition-colors"
            >
              <Trash size={14} weight="bold" /> Reset lot
            </button>
          </div>
        </div>
      </div>

      {showCasCreate && (
        <CreateHouseholdModal
          lotKey={lot.lotKey}
          onClose={() => setShowCasCreate(false)}
          onCreated={() => setShowCasCreate(false)}
        />
      )}
    </div>
  );
}
