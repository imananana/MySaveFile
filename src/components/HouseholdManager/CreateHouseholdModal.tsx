import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsClockwise, Plus, X, MapPin, House, Users } from '@phosphor-icons/react';
import { useSaveFile } from '../../store/useSaveFile';
import { Dropdown } from '../common/Dropdown';
import { CatalogPickerModal } from '../common/RequirementEditor';
import { AddBtn, RerollBtn } from '../common/PillBtn';
import { usePackOwnership } from '../../store/usePackOwnership';
import { getTraitPack, getAspirationPack, getOccultPack } from '../../data/packAssignments';
import { STOCK_TRAITS, traitsForLifestage, traitIconUrlById } from '../../data/stockTraits';
import { STOCK_ASPIRATIONS, aspirationsForLifestage, aspirationIconUrlById } from '../../data/stockAspirations';
import { LotPickerModal } from './LotPickerModal';
import { rollFirstNameFor, rollLastNameOnce, rollGenderOnce, rollTraitsFor, rollAspirationFor, type PackContext } from '../../lib/randomizer';
import { resolveGenderedText } from '../../lib/genderedText';
import { EMPTY_COMPOSITION } from '../../types';
import type { Choice } from '../../data/criteriaCatalogs';
import type { Sim, SimGender, SimLifestage, SimOccult } from '../../types';
import type { ParsedGender, ParsedLifestage } from '../../lib/parser/types';
import { useConfirm } from '../common/ConfirmDialog';
import { useEscapeToClose } from '../common/useEscapeToClose';

// Trait caps per lifestage (mirror SimPanel).
const TRAIT_COUNT: Record<SimLifestage, number> = {
  newborn: 0, infant: 1, toddler: 1, child: 1, teen: 2, youngAdult: 3, adult: 3, elder: 3, pet: 0,
};
const LIFESTAGE_LABEL: Record<SimLifestage, string> = {
  newborn: 'Newborn', infant: 'Infant', toddler: 'Toddler', child: 'Child', teen: 'Teen',
  youngAdult: 'Young Adult', adult: 'Adult', elder: 'Elder', pet: 'Pet',
};
const LIFESTAGE_OPTIONS = (['newborn', 'infant', 'toddler', 'child', 'teen', 'youngAdult', 'adult', 'elder'] as SimLifestage[])
  .map((v) => ({ value: v, label: LIFESTAGE_LABEL[v] }));
const GENDER_OPTIONS = [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }];
const OCCULT_OPTIONS = [
  { value: 'none', label: '—' }, { value: 'vampire', label: 'Vampire' }, { value: 'alien', label: 'Alien' },
  { value: 'mermaid', label: 'Mermaid' }, { value: 'spellcaster', label: 'Spellcaster' },
  { value: 'werewolf', label: 'Werewolf' }, { value: 'fairy', label: 'Fairy' },
];
// Ghost folded in as an occult (Simmer mental model), mutually exclusive with the
// real occults — mirrors SimPanel. Selecting one clears the other.
const OCCULT_GHOST_OPTIONS = [
  { value: 'none', label: '—' }, { value: 'ghost', label: 'Ghost' },
  ...OCCULT_OPTIONS.filter((o) => o.value !== 'none'),
];

const MAX_SIMS = 8; // in-game household cap

interface Draft {
  key: number;
  firstName: string;
  lastName: string;
  gender: ParsedGender;
  lifestage: SimLifestage;
  occult: SimOccult;
  isGhost: boolean;
  aspirationId: string | null;
  traitIds: string[];
}

function IconImg({ url, size = 14 }: { url: string | null | undefined; size?: number }) {
  if (!url) return null;
  return <img src={url} alt="" style={{ width: size, height: size }} className="object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />;
}

/**
 * The household creation modal — build one or more plan-only sims (roll-or-pick each
 * field), then create the household (or, in `target` mode, add the sims to an
 * existing household). No empty households: a household is born with ≥1 sim.
 * Familial relations are intentionally omitted (see project_planned_moves_spec).
 *
 * - CREATE mode (default): household name + optional preassigned lot + sims.
 * - ADD mode (`target` set): just sims, appended to the existing household.
 */
export function CreateHouseholdModal({ onClose, onCreated, lotKey, target }: {
  onClose: () => void;
  onCreated?: (householdId: string) => void;
  lotKey?: string | null;
  target?: { householdId: string; householdName: string; currentCount: number };
}) {
  const addHousehold = useSaveFile((s) => s.addHousehold);
  const addSim = useSaveFile((s) => s.addSim);
  const assignHousehold = useSaveFile((s) => s.assignHousehold);
  const lots = useSaveFile((s) => s.lots);
  const isOwned = usePackOwnership((s) => s.isOwned);
  const ctx: PackContext = useMemo(() => ({ isPackOwned: isOwned, getTraitPack, getAspirationPack }), [isOwned]);
  // Every occult is one pack's life state, so a sim you're building here can only
  // be one you own — matching the traits and aspiration below. Ghost is base
  // game. Nothing to preserve here: these sims don't exist yet.
  const occultOptions = OCCULT_GHOST_OPTIONS.filter((o) => isOwned(getOccultPack(o.value)));

  const keyRef = useRef(1);
  const newDraft = (sharedLast?: string): Draft => {
    const gender = rollGenderOnce();
    const lifestage: SimLifestage = 'youngAdult';
    return {
      key: keyRef.current++,
      gender,
      lifestage,
      occult: 'none',
      isGhost: false,
      firstName: rollFirstNameFor(gender),
      lastName: sharedLast ?? rollLastNameOnce(),
      aspirationId: rollAspirationFor(lifestage as ParsedLifestage, ctx),
      traitIds: rollTraitsFor(lifestage as ParsedLifestage, ctx),
    };
  };

  const [drafts, setDrafts] = useState<Draft[]>(() => [newDraft()]);
  const [hhName, setHhName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [chosenLot, setChosenLot] = useState<string | null>(lotKey ?? null);
  const [busy, setBusy] = useState(false);
  // Which draft's trait / aspiration picker is open (by key), or null.
  const [pickTraitsFor, setPickTraitsFor] = useState<number | null>(null);
  const [pickAspFor, setPickAspFor] = useState<number | null>(null);
  const [showLotPicker, setShowLotPicker] = useState(false);

  // The one exception to Escape-closes-everything. Every other modal either
  // auto-saves or costs you a re-pick; this one can hold several sims you've
  // rolled and tuned, with nothing written yet, so it asks first. Unconditional
  // rather than dirty-checked: a fresh draft is already fully populated by the
  // randomiser, so there's no honest way to tell "untouched" from "deliberate".
  const confirmDiscard = useConfirm();
  useEscapeToClose(async () => {
    if (await confirmDiscard({
      message: 'Discard this household? The sims you\'ve set up here haven\'t been created yet.',
      confirmLabel: 'Discard',
      danger: true,
    })) onClose();
  }, !busy);

  const addMode = !!target;
  // The name auto-follows the first sim's surname until the user types their own.
  const autoName = drafts[0]?.lastName || 'New household';
  const effectiveName = nameEdited ? hhName : autoName;
  // Starting funds = the game's standard per-sim default (§20k for 1 sim, +§2k
  // per extra). Not shown in the modal — editable later on the household page.
  const startingFunds = 20_000 + Math.max(0, drafts.length - 1) * 2_000;
  const chosenLotObj = chosenLot ? lots[chosenLot] : null;
  // Cap: ADD mode counts existing members too; CREATE starts empty.
  const total = (target?.currentCount ?? 0) + drafts.length;
  const atCap = total >= MAX_SIMS;

  function patch(key: number, p: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
  }
  // Changing lifestage keeps still-valid traits/aspiration, then RE-ROLLS to
  // refill anything dropped (age-appropriate) — so a big age jump reads as
  // "aged into a new sim" rather than wiped, and never leaves empty slots.
  function changeLifestage(key: number, v: SimLifestage) {
    setDrafts((ds) => ds.map((d) => {
      if (d.key !== key) return d;
      const parsed = v as ParsedLifestage;
      const cap = TRAIT_COUNT[v] ?? 0;
      const valid = new Set(traitsForLifestage(parsed).map((t) => t.id));
      const kept = d.traitIds.filter((id) => valid.has(id)).slice(0, cap);
      let traitIds = kept;
      if (kept.length < cap) {
        const fresh = rollTraitsFor(parsed, ctx).filter((id) => !kept.includes(id));
        traitIds = [...kept, ...fresh].slice(0, cap);
      }
      const hasAsp = v !== 'newborn' && v !== 'infant' && v !== 'toddler';
      const validAsp = new Set(aspirationsForLifestage(parsed).map((a) => a.id));
      const aspirationId = !hasAsp ? null
        : d.aspirationId && validAsp.has(d.aspirationId) ? d.aspirationId
        : rollAspirationFor(parsed, ctx);
      return { ...d, lifestage: v, traitIds, aspirationId };
    }));
  }
  function rerollSim(key: number) {
    setDrafts((ds) => ds.map((d) => d.key === key ? {
      ...d,
      firstName: rollFirstNameFor(d.gender),
      lastName: rollLastNameOnce(),
      traitIds: rollTraitsFor(d.lifestage as ParsedLifestage, ctx),
      aspirationId: rollAspirationFor(d.lifestage as ParsedLifestage, ctx),
    } : d));
  }
  async function commit() {
    if (busy) return;
    setBusy(true);
    try {
      const toSim = (d: Draft, householdId: string): Omit<Sim, 'id'> => ({
        householdId,
        firstName: d.firstName.trim(), lastName: d.lastName.trim(),
        gender: d.gender as SimGender, lifestage: d.lifestage,
        species: 'human', petSubtype: 'pet', petBreed: null,
        occult: d.occult, isGhost: d.isGhost, notes: '',
        sourceId: null, traitIds: d.traitIds, aspirationId: d.aspirationId,
        recordStatus: 'active', deathCause: null, culledAt: null,
        enrolledDegree: null, career: null, skills: [],
        plannedSkillIds: [], plannedCareerUid: null, plannedMoveHouseholdId: null,
        lastImportedState: null,
      });
      if (addMode) {
        for (const d of drafts) await addSim(toSim(d, target!.householdId));
        onCreated?.(target!.householdId);
      } else {
        const hhId = await addHousehold({
          name: effectiveName.trim() || 'New household', composition: { ...EMPTY_COMPOSITION },
          assignedLotKey: null, notes: '', description: '', thumbnailFilename: null,
          sourceId: null, money: startingFunds, plannedMoney: null,
          provenance: 'yours', provenanceSub: 'built', creatorName: null,
          visibility: 'auto', lastImportedState: null,
        });
        // A refused lot (filled since the picker opened) must not take the whole
        // creation down with it — the household and its sims still land, and the
        // store toasts why the lot didn't.
        if (chosenLot) await assignHousehold(chosenLot, hhId).catch(() => {});
        for (const d of drafts) await addSim(toSim(d, hhId));
        onCreated?.(hhId);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">{addMode ? `Add sims to ${target!.householdName}` : 'New household'}</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text cursor-pointer w-8 h-8 flex items-center justify-center"><X size={16} weight="bold" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 bg-c-base">
          {/* Household name + funds + lot (CREATE only). */}
          {!addMode && (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-c-secondary uppercase tracking-label mb-1.5">Household name</label>
                <input
                  value={effectiveName}
                  onChange={(e) => { setNameEdited(true); setHhName(e.target.value); }}
                  className="w-full bg-c-card border border-c-border rounded-lg px-3 py-2 text-sm text-c-text outline-none focus:border-c-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-c-secondary uppercase tracking-label mb-1.5">Lot</label>
                {chosenLotObj ? (
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setShowLotPicker(true)} className="flex-1 min-w-0 inline-flex items-center gap-2 bg-c-card border border-c-border rounded-lg px-3.5 py-2.5 text-sm text-c-text hover:border-c-accent cursor-pointer transition-colors">
                      <MapPin size={15} weight="fill" className="text-c-secondary shrink-0" /> <span className="truncate font-semibold">{chosenLotObj.customName}</span> <span className="text-c-dim truncate">· {chosenLotObj.worldName}</span>
                    </button>
                    <button type="button" onClick={() => setChosenLot(null)} aria-label="Clear lot" className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-lg text-c-faint hover:text-c-red bg-transparent border border-c-border cursor-pointer"><X size={14} weight="bold" /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowLotPicker(true)} className="w-full inline-flex items-center gap-2 bg-c-card border border-dashed border-c-border rounded-lg px-3.5 py-2.5 text-sm font-semibold text-c-dim hover:border-c-accent hover:text-c-accent cursor-pointer transition-colors">
                    <MapPin size={15} weight="regular" className="shrink-0" /> Assign a lot
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sim cards */}
          <div className="space-y-3">
            {drafts.map((d) => {
              const cap = TRAIT_COUNT[d.lifestage] ?? 0;
              // Infants/toddlers (and newborns) don't CAS-pick aspirations in TS4.
              const showAsp = d.lifestage !== 'newborn' && d.lifestage !== 'infant' && d.lifestage !== 'toddler';
              return (
                <div key={d.key} className="rounded-xl border border-c-border bg-c-card px-4 py-3.5 space-y-3">
                  {/* Card header: whole-sim randomize (moved off the name row so it
                      doesn't read as a name randomizer) + remove. */}
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => rerollSim(d.key)} title="Randomize this sim" className="inline-flex items-center gap-1 text-[11px] font-semibold text-c-dim hover:text-c-accent bg-transparent border-none cursor-pointer transition-colors">
                      <ArrowsClockwise size={12} weight="bold" /> Randomize
                    </button>
                    {drafts.length > 1 && (
                      <button type="button" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} aria-label="Remove sim" className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer"><X size={14} weight="bold" /></button>
                    )}
                  </div>

                  {/* Name row — first + last each reroll independently. */}
                  <div className="flex items-center gap-1.5">
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-semibold shrink-0 ${d.gender === 'male' ? 'bg-c-accent' : 'bg-c-secondary'}`}>
                      {(d.firstName || '?').charAt(0).toUpperCase()}
                    </span>
                    <input value={d.firstName} onChange={(e) => patch(d.key, { firstName: e.target.value })} placeholder="First" className="flex-1 min-w-0 bg-c-card border border-c-border rounded-lg px-3 py-1.5 text-sm text-c-text outline-none focus:border-c-accent" />
                    <RerollBtn title="Reroll first name" onClick={() => patch(d.key, { firstName: rollFirstNameFor(d.gender) })} />
                    <input value={d.lastName} onChange={(e) => patch(d.key, { lastName: e.target.value })} placeholder="Last" className="flex-1 min-w-0 bg-c-card border border-c-border rounded-lg px-3 py-1.5 text-sm text-c-text outline-none focus:border-c-accent" />
                    <RerollBtn title="Reroll last name" onClick={() => patch(d.key, { lastName: rollLastNameOnce() })} />
                  </div>

                  {/* Gender | Lifestage | Occult (all deliberate picks — no dice) */}
                  <div className="grid grid-cols-3 gap-2">
                    <Dropdown value={d.gender} options={GENDER_OPTIONS} onChange={(v) => patch(d.key, { gender: v as ParsedGender })} ariaLabel="Gender" />
                    <Dropdown value={d.lifestage} options={LIFESTAGE_OPTIONS} onChange={(v) => changeLifestage(d.key, v as SimLifestage)} ariaLabel="Lifestage" />
                    <Dropdown
                      value={d.isGhost ? 'ghost' : d.occult}
                      options={occultOptions}
                      onChange={(v) => patch(d.key, v === 'ghost' ? { isGhost: true, occult: 'none' } : { isGhost: false, occult: v as SimOccult })}
                      ariaLabel="Occult"
                    />
                  </div>

                  {/* Aspiration (child+ only). The chip itself is clickable to
                      change (no separate swap icon — that was confused with the
                      randomize ⟳). Only Add (+) and Randomize (⟳) buttons remain. */}
                  {showAsp && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-c-dim w-[68px] shrink-0">Aspiration</span>
                      {d.aspirationId && STOCK_ASPIRATIONS[d.aspirationId] ? (
                        <button type="button" onClick={() => setPickAspFor(d.key)} title="Change aspiration" className="inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-[12px] text-c-text border border-c-border bg-c-card hover:border-c-accent hover:bg-c-accent-soft cursor-pointer transition-colors">
                          <IconImg url={aspirationIconUrlById(d.aspirationId)} /> {resolveGenderedText(STOCK_ASPIRATIONS[d.aspirationId].name, d.gender)}
                        </button>
                      ) : (
                        <AddBtn title="Choose an aspiration" onClick={() => setPickAspFor(d.key)} />
                      )}
                      <RerollBtn title="Reroll aspiration" onClick={() => patch(d.key, { aspirationId: rollAspirationFor(d.lifestage as ParsedLifestage, ctx) })} />
                    </div>
                  )}

                  {/* Traits */}
                  {cap > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-c-dim w-[68px] shrink-0">Traits</span>
                      {d.traitIds.map((id) => (
                        <span key={id} className="group/chip inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-[12px] text-c-text border border-c-border bg-c-base">
                          <IconImg url={traitIconUrlById(id)} /> {STOCK_TRAITS[id]?.name ?? id}
                          <button type="button" onClick={() => patch(d.key, { traitIds: d.traitIds.filter((t) => t !== id) })} aria-label="Remove trait" className="text-c-faint hover:text-c-red hidden group-hover/chip:flex bg-transparent border-none cursor-pointer items-center -mr-1"><X size={10} weight="bold" /></button>
                        </span>
                      ))}
                      <AddBtn title="Edit traits" onClick={() => setPickTraitsFor(d.key)} />
                      <RerollBtn title="Reroll traits" onClick={() => patch(d.key, { traitIds: rollTraitsFor(d.lifestage as ParsedLifestage, ctx) })} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add sim */}
          <button
            type="button"
            onClick={() => setDrafts((ds) => [...ds, newDraft(ds[0]?.lastName)])}
            disabled={atCap}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-c-border bg-transparent py-2.5 text-[13px] font-semibold text-c-accent cursor-pointer transition-colors hover:border-c-accent hover:bg-c-accent-soft disabled:opacity-40 disabled:cursor-default"
          >
            <Plus size={14} weight="bold" /> Add sim
          </button>
          {atCap && <p className="text-[11px] text-c-warn m-0 flex items-center gap-1"><Users size={12} weight="bold" /> {MAX_SIMS}-sim household limit reached.</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-c-border flex items-center justify-between gap-2">
          <span className="text-[11px] text-c-faint">{addMode ? '' : `${drafts.length} sim${drafts.length === 1 ? '' : 's'} · plan-only`}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="inline-flex items-center h-8 px-3 rounded-md text-[12px] font-semibold text-c-dim hover:text-c-text bg-transparent border border-c-border cursor-pointer disabled:opacity-40">Cancel</button>
            <button type="button" onClick={commit} disabled={busy || drafts.length === 0} className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md text-[12px] font-semibold bg-c-accent text-white cursor-pointer transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-default border-none">
              <House size={13} weight="bold" /> {addMode ? 'Add sim' : 'Create household'}
            </button>
          </div>
        </div>
      </div>

      {/* Trait / aspiration pickers for the active draft (portal-stacked). */}
      {pickTraitsFor != null && (() => {
        const d = drafts.find((x) => x.key === pickTraitsFor);
        if (!d) return null;
        const items: Choice[] = traitsForLifestage(d.lifestage as ParsedLifestage)
          .filter((t) => isOwned(getTraitPack(t.id)))
          .map((t) => ({ id: t.id, name: t.name, icon: traitIconUrlById(t.id) ?? undefined }));
        const cap = TRAIT_COUNT[d.lifestage] ?? 0;
        return (
          <CatalogPickerModal title="Edit traits" items={items} multiSelect preselected={new Set(d.traitIds)} maxSelected={cap}
            onSelect={(picked) => patch(d.key, { traitIds: picked.map((p) => p.id).slice(0, cap) })}
            onClose={() => setPickTraitsFor(null)} />
        );
      })()}
      {pickAspFor != null && (() => {
        const d = drafts.find((x) => x.key === pickAspFor);
        if (!d) return null;
        const items: Choice[] = aspirationsForLifestage(d.lifestage as ParsedLifestage)
          .filter((a) => isOwned(getAspirationPack(a.id)))
          .map((a) => ({ id: a.id, name: resolveGenderedText(a.name, d.gender), icon: aspirationIconUrlById(a.id) ?? undefined }));
        return (
          <CatalogPickerModal title="Choose an aspiration" items={items}
            onSelect={(picked) => { if (picked[0]) patch(d.key, { aspirationId: picked[0].id }); }}
            onClose={() => setPickAspFor(null)} />
        );
      })()}
      {showLotPicker && (
        <LotPickerModal onClose={() => setShowLotPicker(false)} onSelect={(k) => setChosenLot(k)} />
      )}
    </div>,
    document.body,
  );
}
