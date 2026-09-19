import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowsClockwise,
  Shuffle,
  GenderFemale,
  GenderMale,
  Pencil,
  Trash,
  Check,
  X,
  Lock,
  LockOpen,
} from '@phosphor-icons/react';
import { useSaveFile } from '../store/useSaveFile';
import { api } from '../lib/api';
import { WorldPromptRoller, SaveLotRoller } from './LotRoller';
import { EMPTY_COMPOSITION, type HouseholdComposition } from '../types';
import {
  rollHousehold,
  rerollSim,
  rerollTraits,
  rerollSingleTrait,
  rerollAspiration,
  buildHouseholdName,
  type PresetKey,
  type CoupleType,
  type RolledHousehold,
  type RolledSim,
  type CustomComposition,
} from '../lib/randomizer';
import { STOCK_TRAITS, traitIconUrlById } from '../data/stockTraits';
import { STOCK_ASPIRATIONS, aspirationIconUrlById } from '../data/stockAspirations';
import { usePackOwnership } from '../store/usePackOwnership';
import { getTraitPack, getAspirationPack } from '../data/packAssignments';
import { resolveGenderedText } from '../lib/genderedText';
import type { ParsedLifestage } from '../lib/parser/types';
import { btn, iconBtn } from '../components/common/btn';
import { Tooltip } from '../components/common/Tooltip';

const PRESET_LABEL: Record<PresetKey, string> = {
  solo: 'Solo',
  couple: 'Couple',
  sibling: 'Siblings',
  nuclear: 'Nuclear family',
  singleParent: 'Single parent',
  multiGen: 'Multi-generational',
  adultChildWithParent: 'Adult child + parent(s)',
  roommates: 'Roommates',
  emptyNesters: 'Empty nesters',
  surpriseMe: 'Surprise me',
  custom: 'Custom',
};

const PRESET_DESCRIPTION: Record<PresetKey, string> = {
  solo: 'One sim, lifestage random.',
  couple: 'Two adults. Surname shared on coin flip.',
  sibling: '2–3 young adult siblings, shared surname.',
  nuclear: '2 parents + 1–6 kids, shared surname.',
  singleParent: '1 parent + 1–7 kids, shared surname.',
  multiGen: 'Three generations — grandparents, their adult child (± partner), and grandkids.',
  adultChildWithParent: '1–2 elders + their single adult child, no kids.',
  roommates: '2–8 adults, independent surnames.',
  emptyNesters: '1–2 elders, shared surname.',
  surpriseMe: 'Random preset, random everything.',
  custom: 'Pick counts per lifestage.',
};

const LIFESTAGE_LABEL: Record<ParsedLifestage, string> = {
  newborn: 'Newborn',  // never rolled (CAS can't create one) — here for type completeness
  infant: 'Infant',
  toddler: 'Toddler',
  child: 'Child',
  teen: 'Teen',
  youngAdult: 'Young Adult',
  adult: 'Adult',
  elder: 'Elder',
  pet: 'Pet',
};

const LIFESTAGE_ICON: Record<ParsedLifestage, string> = {
  newborn: 'newborn-sim',
  infant: 'infant-sim',
  toddler: 'toddler-sim',
  child: 'child-sim',
  teen: 'teen-sim',
  youngAdult: 'young-adult-sim',
  adult: 'adult-sim',
  elder: 'elder-sim',
  pet: 'cat-sim',
};

// Preset list, grouped: Surprise me leads as the featured option, the eight
// preset shapes sit in the main bucket, and Custom is its own free-form section.
const FEATURED_PRESETS: PresetKey[] = ['surpriseMe'];
const FAMILY_PRESETS: PresetKey[] = [
  'solo',
  'couple',
  'nuclear',
  'singleParent',
  'roommates',
  'sibling',
  'multiGen',
  'adultChildWithParent',
  'emptyNesters',
];
const CUSTOM_PRESETS: PresetKey[] = ['custom'];

const PRESETS_WITH_COUPLE_TYPE: ReadonlySet<PresetKey> = new Set<PresetKey>([
  'couple',
  'nuclear',
  'multiGen',
]);

// Starting funds, matching the New household modal: the game's standard
// per-sim default. A household is a household however you made it.
const START_FUNDS_FIRST = 20_000;
const START_FUNDS_EACH_EXTRA = 2_000;

const CUSTOM_LIFESTAGES: Array<keyof CustomComposition> = [
  'elder',
  'adult',
  'youngAdult',
  'teen',
  'child',
  'toddler',
  'infant',
];

// --- Icon fallback components ------------------------------------------------
// Both render the image when present, but fall back to a styled text chip on
// load error so the page works fine before /trait-icons/* and /aspiration-icons/*
// are populated. Dropping PNGs into those folders later upgrades the look
// without code changes.

function IconWithFallback({ kind, id, className }: { kind: 'trait' | 'aspiration'; id: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = kind === 'trait' ? traitIconUrlById(id) : aspirationIconUrlById(id);
  if (failed || !url) return null;
  return <img src={url} alt="" className={className} onError={() => setFailed(true)} />;
}

// --- Main page --------------------------------------------------------------

export default function Randomizer() {
  const navigate = useNavigate();
  const { saveFileId } = useParams<{ saveFileId: string }>();

  const addHousehold = useSaveFile((s) => s.addHousehold);
  const addSim = useSaveFile((s) => s.addSim);

  // Pack-ownership context for the randomizer. The library doesn't know
  // about stores; we pass these as opts so traits + aspirations only get
  // rolled from packs the user owns. Subscribe to overrides + autoDetected
  // so the rolls stay in sync when packs are toggled mid-session.
  const isPackOwned = usePackOwnership((s) => s.isOwned);
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  const packCtx = useMemo(
    () => ({ isPackOwned, getTraitPack, getAspirationPack }),
    [isPackOwned, manualOverrides, autoDetected],
  );

  const [mode, setMode] = useState<'household' | 'world' | 'lot'>('household');
  const [preset, setPreset] = useState<PresetKey>('nuclear');
  const [coupleType, setCoupleType] = useState<CoupleType>('random');
  const [customComp, setCustomComp] = useState<CustomComposition>({ youngAdult: 1 });
  const [customShareSurname, setCustomShareSurname] = useState(true);
  const [hh, setHh] = useState<RolledHousehold | null>(null);
  // Sims held across a Roll again, by id. Ids survive a reroll (only a sim's
  // contents change), so a lock stays attached to the row you set it on.
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null); // sim id being name-edited
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const customTotal = useMemo(
    () => Object.values(customComp).reduce((sum, n) => sum + (n ?? 0), 0),
    [customComp],
  );

  // Auto-toggle share-surname default when custom composition changes: ON
  // when there's at least one child/teen (i.e. likely a family), OFF when
  // it's all adults. User can override.
  const autoShareSurname = useMemo(() => {
    const youngs = (customComp.infant ?? 0) + (customComp.toddler ?? 0) + (customComp.child ?? 0) + (customComp.teen ?? 0);
    return youngs > 0;
  }, [customComp]);

  function handleRoll() {
    // With sims locked, Roll again spins only the rest and the household's
    // SHAPE holds — same roles, same count. That's the slot-machine model the
    // world roller already uses, and the reason a lock means anything: a child
    // you kept in a family of four must not come back in a family of two.
    // Everyone re-rolled goes through the same per-role rules the row's own ⟳
    // uses, so the locked sims anchor the surname and the couple's genders.
    if (hh && locked.size > 0) {
      const before = hh.sims;
      const sims = before.map((s) =>
        locked.has(s.id) ? s : rerollSim(s, packCtx, { sims: before, coupleType }),
      );
      setHh({ ...hh, sims, name: buildHouseholdName(sims) });
      setEditing(null);
      return;
    }
    const opts =
      preset === 'custom'
        ? {
            preset: 'custom' as const,
            coupleType,
            custom: {
              composition: customComp,
              shareSurname: customShareSurname,
            },
          }
        : { preset, coupleType };
    setHh(rollHousehold({ ...opts, ...packCtx }));
    setLocked(new Set());
    setEditing(null);
  }

  // A different preset or a different composition is a different household, so
  // the locks can't survive it — the sims they point at are about to be gone.
  function choosePreset(key: PresetKey) {
    setPreset(key);
    setLocked(new Set());
  }

  function toggleLock(simId: string) {
    setLocked((prev) => {
      const next = new Set(prev);
      if (!next.delete(simId)) next.add(simId);
      return next;
    });
  }

  function updateSim(simId: string, mapper: (s: RolledSim) => RolledSim) {
    if (!hh) return;
    setHh({
      ...hh,
      sims: hh.sims.map((s) => (s.id === simId ? mapper(s) : s)),
    });
  }

  function patchSim(simId: string, patch: Partial<RolledSim>) {
    updateSim(simId, (s) => ({ ...s, ...patch }));
  }

  function removeSim(simId: string) {
    if (!hh) return;
    setHh({ ...hh, sims: hh.sims.filter((s) => s.id !== simId) });
    if (editing === simId) setEditing(null);
    setLocked((prev) => {
      if (!prev.has(simId)) return prev;
      const next = new Set(prev);
      next.delete(simId);
      return next;
    });
  }

  async function handleSave() {
    if (!hh || hh.sims.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const composition = compositionFromRolledSims(hh.sims);
      const targetHouseholdId = await addHousehold({
        name: hh.name,
        composition,
        assignedLotKey: null,
        notes: '',
        description: '',
        thumbnailFilename: null,
        sourceId: null,
        money: START_FUNDS_FIRST + Math.max(0, hh.sims.length - 1) * START_FUNDS_EACH_EXTRA,
        plannedMoney: null,
        // Authored by the user → "yours", so it lands in My Households (matches
        // the Create Household flow). Without this it fell into Rest of Town.
        provenance: 'yours',
        provenanceSub: 'built',
        creatorName: null,
        visibility: 'auto',
      });

      // Sequentially create sims so a failure halts cleanly with earlier
      // sims already persisted (recoverable state).
      for (const sim of hh.sims) {
        await addSim({
          householdId: targetHouseholdId,
          firstName: sim.firstName,
          lastName: sim.lastName,
          gender: sim.gender,
          lifestage: sim.lifestage,
          species: 'human',
          petSubtype: 'pet',
          petBreed: null,
          occult: 'none',
          isGhost: false,
          notes: '',
          sourceId: null,
          recordStatus: 'active',
          deathCause: null,
          culledAt: null,
          traitIds: sim.traitIds,
          aspirationId: sim.aspirationId,
        });
      }

      // ★ The one action the database can't recognise afterwards: this writes
      // provenance='yours' / provenanceSub='built' / sourceId=null, which is
      // byte for byte what the Create Household modal writes. Without this
      // ping nothing can ever say whether the randomizer gets used.
      api.logFeatureEvent('randomizer_save');

      // Drop the preview and route back to the household in the manager.
      setHh(null);
      navigate(`/saves/${saveFileId}/households?hh=${targetHouseholdId}`);
    } catch (err) {
      setSaveError((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const showCoupleType = PRESETS_WITH_COUPLE_TYPE.has(preset) || preset === 'surpriseMe';

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      {/* The title used to rename itself as you switched mode ("Roll a
          household" → "Roll a world"), so the page appeared to be three
          different pages. The mode toggle right below already says which mode
          you're in. */}
      <header className="mb-6">
        {/* "Randomizer", not "Randomize" — the sidebar says Randomizer, and
            "Randomize" is already the VERB on buttons (dynasty crest, per-sim
            reroll). A page names a place; a button issues the command. */}
        <h1 className="text-2xl sm:text-3xl font-bold text-c-text tracking-headline">Randomizer</h1>
      </header>

      <div className="flex gap-1 p-1 mb-6 rounded-xl bg-c-panel border border-c-border w-full max-w-sm">
        {(['household', 'world', 'lot'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer border-none capitalize ${
              mode === m ? 'bg-c-secondary text-white shadow-sm' : 'bg-transparent text-c-dim hover:text-c-text hover:bg-c-card'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'world' ? (
        <WorldPromptRoller />
      ) : mode === 'lot' ? (
        <SaveLotRoller />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* LEFT: controls */}
        {/* On a phone the two cards stack, and in source order that buries the
            Roll button under every preset. The roll card goes first there so
            you land on the button and its result; the rule switches off at the
            breakpoint, leaving the desktop layout exactly as it is. */}
        <aside className="order-last lg:order-none bg-c-card border border-c-border rounded-2xl p-6 space-y-5 self-start">
          <div className="space-y-4">
            {/* Surprise me leads the card with no heading over it. The plum
                pill and the shuffle mark already say "start here", and an
                eyebrow above a single button only pushed it out of line with
                Roll household sitting opposite it. Both cards now open on
                their control. */}
            <div className="space-y-1.5">
              {FEATURED_PRESETS.map((key) => (
                <PresetButton
                  key={key}
                  selected={preset === key}
                  label={PRESET_LABEL[key]}
                  description={PRESET_DESCRIPTION[key]}
                  icon={<Shuffle weight="bold" size={14} />}
                  featured
                  onClick={() => choosePreset(key)}
                />
              ))}
            </div>

            <PresetSection label="Presets">
              {FAMILY_PRESETS.map((key) => (
                <PresetButton
                  key={key}
                  selected={preset === key}
                  label={PRESET_LABEL[key]}
                  description={PRESET_DESCRIPTION[key]}
                  icon={null}
                  onClick={() => choosePreset(key)}
                />
              ))}
            </PresetSection>

            <PresetSection label="Free form">
              {CUSTOM_PRESETS.map((key) => (
                <PresetButton
                  key={key}
                  selected={preset === key}
                  label={PRESET_LABEL[key]}
                  description={PRESET_DESCRIPTION[key]}
                  icon={null}
                  onClick={() => choosePreset(key)}
                />
              ))}
            </PresetSection>
          </div>

          {preset === 'custom' && (
            <div className="border-t border-c-border pt-4 space-y-3">
              <p className="text-2xs uppercase tracking-label text-c-dim">Composition</p>
              {CUSTOM_LIFESTAGES.map((age) => (
                <div key={age} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-c-text">{LIFESTAGE_LABEL[age]}</label>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    value={customComp[age] ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(8, Number(e.target.value) || 0));
                      setCustomComp({ ...customComp, [age]: v });
                      setLocked(new Set());   // a new composition is a new household
                    }}
                    className="w-16 px-2 py-1 text-sm border border-c-border rounded bg-c-base text-c-text text-right"
                  />
                </div>
              ))}
              <p className="text-2xs text-c-dim text-right">
                {customTotal} / 8 sims
                {customTotal > 8 && <span className="text-c-red ml-1">(over limit)</span>}
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customShareSurname}
                  onChange={(e) => setCustomShareSurname(e.target.checked)}
                  className="accent-c-accent"
                />
                <span className="text-sm text-c-text">Share surname</span>
                {customShareSurname !== autoShareSurname && (
                  <span className="text-2xs text-c-dim">(suggested: {autoShareSurname ? 'on' : 'off'})</span>
                )}
              </label>
            </div>
          )}

          {showCoupleType && (
            <div className="border-t border-c-border pt-4">
              <p className="text-2xs uppercase tracking-label text-c-dim mb-2">Couple type</p>
              <div className="grid grid-cols-3 gap-1">
                {(['random', 'mixed', 'sameSex'] as CoupleType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCoupleType(t)}
                    className={`text-xs px-2 py-1.5 rounded border transition-colors ${
                      coupleType === t
                        ? 'bg-c-accent text-white border-c-accent'
                        : 'bg-c-base text-c-text border-c-border hover:border-c-accent'
                    }`}
                  >
                    {t === 'sameSex' ? 'Same-sex' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

        </aside>

        {/* RIGHT: roll button + preview */}
        <section className="order-first lg:order-none bg-c-card border border-c-border rounded-2xl p-6 lg:min-h-[400px]">
          {/* Roll button lives at the top of the right column so it's
              immediately visible on page load — sits above the preview/
              rolled household which renders below. */}
          <button
            onClick={handleRoll}
            disabled={preset === 'custom' && (customTotal === 0 || customTotal > 8)}
            className="w-full py-3 mb-5 rounded-xl bg-c-secondary text-white font-semibold text-sm tracking-headline flex items-center justify-center gap-2 hover:bg-c-secondary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Shuffle size={18} weight="bold" />
            {hh ? 'Roll again' : 'Roll household'}
          </button>

          {!hh ? (
            <EmptyPreview />
          ) : (
            <div>
              <div className="flex items-start justify-between gap-4 mb-5 pb-5 border-b border-c-border">
                <div>
                  <p className="text-2xs uppercase tracking-label text-c-dim">
                    {hh.preset === 'surpriseMe' ? `Surprise → ${PRESET_LABEL[hh.resolvedPreset]}` : PRESET_LABEL[hh.resolvedPreset]}
                  </p>
                  <h2 className="text-2xl font-bold text-c-text tracking-display mt-0.5">{hh.name}</h2>
                  <p className="text-2xs text-c-dim mt-1">
                    {hh.sims.length} {hh.sims.length === 1 ? 'sim' : 'sims'}
                    {locked.size > 0 && <> · {locked.size} kept on the next roll</>}
                  </p>
                  {saveError && <p className="text-2xs text-c-red mt-1">{saveError}</p>}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving || hh.sims.length === 0}
                  className={btn('primary')}
                >
                  {saving ? (
                    <>Saving…</>
                  ) : (
                    <><Check size={16} weight="bold" /> Save to My Households</>
                  )}
                </button>
              </div>

              <div key={hh.id} className="space-y-3">
                {hh.sims.map((sim, idx) => (
                  <SimRow
                    key={sim.id}
                    sim={sim}
                    enterIndex={idx}
                    locked={locked.has(sim.id)}
                    onToggleLock={() => toggleLock(sim.id)}
                    editing={editing === sim.id}
                    onEditToggle={() => setEditing(editing === sim.id ? null : sim.id)}
                    onPatch={(patch) => patchSim(sim.id, patch)}
                    onRerollSim={() => updateSim(sim.id, (s) => rerollSim(s, packCtx, { sims: hh.sims, coupleType }))}
                    onRerollTraits={() => updateSim(sim.id, (s) => rerollTraits(s, packCtx))}
                    onRerollAspiration={() => updateSim(sim.id, (s) => rerollAspiration(s, packCtx))}
                    onRerollSingleTrait={(idx) => updateSim(sim.id, (s) => rerollSingleTrait(s, idx, packCtx))}
                    onDelete={() => removeSim(sim.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
}

// --- Subcomponents -----------------------------------------------------------

function EmptyPreview() {
  return (
    // Shorter on a phone: this card sits ABOVE the presets there, so a
    // 300px-tall empty state would push them off the screen it was moved up to
    // save. "On the left" is gone for the same reason — stacked, there is no
    // left.
    <div className="h-full min-h-[140px] lg:min-h-[300px] flex flex-col items-center justify-center text-center gap-3 text-c-dim py-6 lg:py-0">
      <Shuffle size={44} weight="duotone" className="text-c-secondary opacity-70" />
      <p className="text-base text-c-text">Ready when you are.</p>
      <p className="text-xs max-w-xs">Pick a preset and hit roll. Names, traits, and aspirations pull straight from the game.</p>
    </div>
  );
}

function PresetSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-label text-c-dim mb-1.5 px-0.5">{label}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function PresetButton({
  selected,
  label,
  description,
  icon,
  featured = false,
  onClick,
}: {
  selected: boolean;
  label: string;
  description: string;
  icon: React.ReactNode;
  featured?: boolean;
  onClick?: () => void;
}) {
  const baseClass = 'w-full text-left px-3 py-2 rounded-lg border transition-all';
  let stateClass: string;
  if (featured) {
    // Surprise me carries a flat plum tint rather than a gradient — it marks
    // itself out as the featured row without becoming a different design.
    stateClass = selected
      ? 'bg-c-secondary-soft border-c-secondary'
      : 'bg-c-secondary-soft border-c-secondary-border hover:border-c-secondary';
  } else {
    stateClass = selected
      ? 'bg-c-accent-soft border-c-accent'
      : 'bg-c-base border-c-border hover:border-c-accent';
  }
  const nameClass = featured
    ? 'text-c-secondary'
    : selected ? 'text-c-accent' : 'text-c-text';
  return (
    // `block`, not the default inline-flex: an inline wrapper collapses the
    // button's full width, so the preset list flowed as a wrapping cloud of
    // chips that reshuffled every time a selection grew its description line.
    <Tooltip text={description} display="block">
      <button onClick={onClick} className={`${baseClass} ${stateClass}`} aria-label={description}>
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-c-secondary">{icon}</span>}
          <span className={`text-sm font-medium ${nameClass}`}>{label}</span>
        </div>
        {/* Description only renders for the selected preset — keeps the list
            compact (one line per unselected option) so the Custom composition
            and Couple type controls stay visible without scrolling. */}
        {selected && <p className="text-2xs text-c-dim mt-0.5">{description}</p>}
      </button>
    </Tooltip>
  );
}

function SimRow({
  sim,
  enterIndex,
  locked,
  onToggleLock,
  editing,
  onEditToggle,
  onPatch,
  onRerollSim,
  onRerollTraits,
  onRerollAspiration,
  onRerollSingleTrait,
  onDelete,
}: {
  sim: RolledSim;
  enterIndex: number;
  locked: boolean;
  onToggleLock: () => void;
  editing: boolean;
  onEditToggle: () => void;
  onPatch: (patch: Partial<RolledSim>) => void;
  onRerollSim: () => void;
  onRerollTraits: () => void;
  onRerollAspiration: () => void;
  onRerollSingleTrait: (idx: number) => void;
  onDelete: () => void;
}) {
  const aspiration = sim.aspirationId ? STOCK_ASPIRATIONS[sim.aspirationId] : null;
  const traits = sim.traitIds.map((id) => ({ id, trait: STOCK_TRAITS[id] }));

  return (
    <div
      className={`sim-enter rounded-xl border p-4 ${
        locked ? 'border-c-accent-border bg-c-accent-soft' : 'border-c-border bg-c-base'
      }`}
      style={{ animationDelay: `${enterIndex * 55}ms` }}
    >
      {/* Identity row: gender + name + lifestage + reroll */}
      <div className="flex items-center gap-3">
        {/* Gender icon */}
        <div className="w-9 h-9 rounded-full bg-c-card border border-c-border flex items-center justify-center shrink-0">
          {sim.gender === 'female' ? (
            <GenderFemale size={18} weight="bold" className="text-c-secondary" />
          ) : (
            <GenderMale size={18} weight="bold" className="text-c-accent" />
          )}
        </div>

        {/* Name (editable on click) */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={sim.firstName}
                onChange={(e) => onPatch({ firstName: e.target.value })}
                className="w-32 px-2 py-1 text-sm border border-c-border rounded bg-c-card text-c-text"
                placeholder="First"
                autoFocus
              />
              <input
                type="text"
                value={sim.lastName}
                onChange={(e) => onPatch({ lastName: e.target.value })}
                className="w-32 px-2 py-1 text-sm border border-c-border rounded bg-c-card text-c-text"
                placeholder="Last"
              />
              <Tooltip text="Done">
                <button
                  onClick={onEditToggle}
                  className="text-c-dim hover:text-c-text p-1" aria-label="Done">
                  <X size={14} weight="bold" />
                </button>
              </Tooltip>
            </div>
          ) : (
            <Tooltip text="Edit name">
              <button
                onClick={onEditToggle}
                className="group inline-flex items-center gap-1.5 text-left" aria-label="Edit name">
                <span className="text-base font-semibold text-c-text tracking-headline truncate">
                  {sim.firstName} {sim.lastName}
                </span>
                <Pencil size={12} weight="bold" className="text-c-dim opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </Tooltip>
          )}
          <div className="flex items-center gap-1.5 text-2xs text-c-dim mt-0.5">
            <img
              src={`/lifestage-icons/${LIFESTAGE_ICON[sim.lifestage]}.png`}
              alt=""
              className="w-3 h-3 object-contain"
            />
            <span className="uppercase tracking-label">{LIFESTAGE_LABEL[sim.lifestage]}</span>
          </div>
        </div>

        {/* Reroll whole sim + keep + delete. The reroll label no longer
            itemises the fields: this rerolls as much of the sim as the
            household shape allows, so what moves depends on who they are in
            it. The padlock governs Roll again only — the same split the world
            roller uses, where a locked slot can still be spun on its own. */}
        <Tooltip text="Reroll this sim">
          <button
            onClick={onRerollSim}
            className="w-8 h-8 rounded-full text-c-dim hover:text-c-accent hover:bg-c-accent-soft transition-colors flex items-center justify-center shrink-0" aria-label="Reroll this sim">
            <ArrowsClockwise size={16} weight="bold" />
          </button>
        </Tooltip>
        <Tooltip text={locked ? 'Let this sim reroll again' : 'Keep this sim when you roll again'}>
          <button
            onClick={onToggleLock}
            className={`w-8 h-8 rounded-full transition-colors flex items-center justify-center shrink-0 ${
              locked ? 'text-c-accent hover:bg-c-card' : 'text-c-faint hover:text-c-dim hover:bg-c-accent-soft'
            }`}
            aria-label={locked ? 'Let this sim reroll again' : 'Keep this sim when you roll again'}
            aria-pressed={locked}
          >
            {locked ? <Lock size={15} weight="fill" /> : <LockOpen size={15} weight="bold" />}
          </button>
        </Tooltip>
        <Tooltip text="Remove sim from household">
          <button
            onClick={onDelete}
            className={iconBtn(8, 'danger', 'rounded-full')} aria-label="Remove sim from household">
            <Trash size={15} weight="bold" />
          </button>
        </Tooltip>
      </div>

      {/* Aspiration row (before traits per locked spec). Hidden entirely for
          infants and toddlers — they don't CAS-pick aspirations in TS4. */}
      {(sim.lifestage !== 'infant' && sim.lifestage !== 'toddler') && (
        aspiration ? (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-2xs uppercase tracking-label text-c-dim w-20 shrink-0">Aspiration</p>
            <div className="flex-1 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-c-card border border-c-border">
              <IconWithFallback
                kind="aspiration"
                id={sim.aspirationId ?? null}
                className="w-4 h-4 object-contain"
              />
              <span className="text-sm text-c-text">{resolveGenderedText(aspiration.name, sim.gender)}</span>
            </div>
            <Tooltip text="Reroll aspiration">
              <button
                onClick={onRerollAspiration}
                className="w-7 h-7 rounded-full text-c-dim hover:text-c-accent hover:bg-c-accent-soft transition-colors flex items-center justify-center" aria-label="Reroll aspiration">
                <ArrowsClockwise size={13} weight="bold" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-2xs text-c-dim italic">
            <p className="uppercase tracking-label w-20 shrink-0 not-italic">Aspiration</p>
            <span>none</span>
          </div>
        )
      )}

      {/* Traits row */}
      {traits.length > 0 && (
        <div className="mt-2 flex items-start gap-2">
          <p className="text-2xs uppercase tracking-label text-c-dim w-20 shrink-0 mt-1.5">Traits</p>
          <div className="flex-1 flex flex-wrap gap-1.5">
            {traits.map(({ id, trait }, idx) => (
              <div key={`${id}-${idx}`} className="group relative">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-c-card border border-c-border">
                  <IconWithFallback
                    kind="trait"
                    id={id}
                    className="w-3.5 h-3.5 object-contain"
                  />
                  <span className="text-sm text-c-text">{trait?.name ?? `?${id}`}</span>
                  <Tooltip text={`Swap this trait`}>
                    <button
                      onClick={() => onRerollSingleTrait(idx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-c-dim hover:text-c-accent" aria-label={`Swap this trait`}>
                      <ArrowsClockwise size={11} weight="bold" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
          <Tooltip text="Reroll all traits">
            <button
              onClick={onRerollTraits}
              className="w-7 h-7 rounded-full text-c-dim hover:text-c-accent hover:bg-c-accent-soft transition-colors flex items-center justify-center mt-1 shrink-0" aria-label="Reroll all traits">
              <ArrowsClockwise size={13} weight="bold" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

// Build a HouseholdComposition from rolled sims so composition counts and
// named-sim records start in sync at save time. After save, the two layers
// are independent (per the locked design — counts and records may diverge).
function compositionFromRolledSims(sims: RolledSim[]): HouseholdComposition {
  const c: HouseholdComposition = JSON.parse(JSON.stringify(EMPTY_COMPOSITION));
  for (const sim of sims) {
    if (sim.lifestage === 'pet') continue;
    const bucket = c[sim.lifestage];
    if (bucket) bucket[sim.gender] += 1;
  }
  return c;
}
