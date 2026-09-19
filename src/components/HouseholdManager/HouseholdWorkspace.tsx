import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CaretDown, CaretRight, House, Users, UsersThree, List, X, Plus, Camera, MagnifyingGlass, MapPin, GearSix, ArrowCounterClockwise, Trash, Info } from '@phosphor-icons/react';
import { LotPickerModal } from './LotPickerModal';
import { HouseholdBuiltPhotos } from './HouseholdBuiltPhotos';
import { useSaveFile } from '../../store/useSaveFile';
import { computeHouseholdRelevance, isForegroundEffective } from '../../lib/householdRelevance';
import { api } from '../../lib/api';
import { usePlannableWorlds } from '../../hooks/usePlannableWorlds';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import { Dropdown } from '../common/Dropdown';
import { Tooltip } from '../common/Tooltip';
import { Notes, MirroredDescription } from '../common/EntityText';
import { OverviewLanding, HeroSplit, StatTile } from '../common/OverviewTiles';
import { useConfirm } from '../common/ConfirmDialog';
import { isFundsGoalActive } from '../../lib/effective';
import { SimPanel } from './SimPanel';
import { ImportPortraitsModal } from './ImportPortraitsModal';
import { CreateHouseholdModal } from './CreateHouseholdModal';
import type { Household, Photo, Sim, SimLifestage } from '../../types';
import { PlannerPill } from '../common/PlannerPill';

const LIFESTAGE_LABEL: Record<SimLifestage, string> = {
  newborn: 'Newborn', infant: 'Infant', toddler: 'Toddler', child: 'Child', teen: 'Teen',
  youngAdult: 'Young Adult', adult: 'Adult', elder: 'Elder', pet: 'Pet',
};

// ─── Provenance → user-facing label + tone (glossary: Yours/EA/Mod · Premade/
// Townie/Service Sims · Plan-only). The three "yours" subs (built / adopted-ea /
// downloaded) collapse to one "Yours" badge — the origin detail lives in the
// hover tooltip instead ("Adopted" read as in-game adoption and confused). ──
function provLabel(hh: Household): string {
  if (!hh.provenance) return 'Plan-only';
  if (hh.provenance === 'yours') return 'Yours';
  if (hh.provenance === 'ea') return hh.provenanceSub === 'townie' ? 'Townie' : hh.provenanceSub === 'service' ? 'Service Sim' : 'Premade';
  return 'Mod';
}
function provTip(hh: Household): string {
  if (!hh.provenance) return "In your plan, not your save — something you're planning, or that your save no longer has.";
  if (hh.provenance === 'yours') {
    if (hh.provenanceSub === 'downloaded') return hh.creatorName ? `Downloaded from the gallery — made by ${hh.creatorName}.` : 'Downloaded from the gallery.';
    if (hh.provenanceSub === 'adopted-ea') return "A premade household you've made yours — played, edited, or moved a sim in.";
    return 'A household you created.';
  }
  if (hh.provenance === 'ea') {
    if (hh.provenanceSub === 'townie') return 'A townie household the game generated.';
    if (hh.provenanceSub === 'service') return 'Game-run service sims, like the Maid or the Grim Reaper.';
    return "A premade household from the game — you haven't played or edited it.";
  }
  return 'Added by a mod.';
}
function provTone(hh: Household): string {
  if (!hh.provenance) return 'text-c-secondary border-c-secondary';
  if (hh.provenance === 'yours') return 'text-c-accent border-c-accent';
  if (hh.provenance === 'mod') return 'text-c-secondary border-c-secondary';
  return 'text-c-dim border-c-border';
}
function ProvBadge({ hh }: { hh: Household }) {
  return (
    <Tooltip text={provTip(hh)} wrap>
      <span className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-label ${provTone(hh)}`}>
        {provLabel(hh)}
      </span>
    </Tooltip>
  );
}

const fmtFunds = (n: number | null) => (n == null ? null : '§' + n.toLocaleString());

// (Cover trimming happens at IMPORT time — cleanThumbnail in lib/thumbCache.ts
// crops the transparent margins before upload. A display-time canvas trim was
// tried here first and reverted: photos are served from the public R2 bucket,
// which sends no CORS headers, so browser-side pixel reads are blocked.)

// ─── Column 2: a selectable sim roster row (Members / Moving out / Moving in) ──
// `planned` = a plan-only relationship (a move) → purple dashed, not solid.
function SimRosterRow({ sim, selected, onClick, subline, planned = false, onDelete }: {
  sim: Sim; selected: boolean; onClick: () => void; subline: string; planned?: boolean; onDelete?: () => void;
}) {
  const border = planned
    ? (selected ? 'border-dashed bg-c-secondary-soft border-c-secondary' : 'border-dashed bg-c-base border-c-secondary-border hover:border-c-secondary')
    : (selected ? 'bg-c-accent-soft border-c-accent' : 'bg-c-base border-c-border hover:border-c-accent');
  return (
    <div className="relative group/row">
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left rounded-lg px-3 py-2.5 cursor-pointer border transition-colors flex items-center gap-2.5 ${onDelete ? 'pr-10' : ''} ${border}`}
      >
        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-semibold shrink-0 ${sim.gender === 'male' ? 'bg-c-accent' : 'bg-c-secondary'} ${sim.isGhost ? 'opacity-60' : ''}`}>
          {(sim.firstName || '?').charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-c-text truncate">{sim.firstName}{sim.lastName ? ' ' + sim.lastName : ''}</span>
          <span className="block text-[11px] text-c-dim truncate">{subline}</span>
        </span>
        {/* Plan-only (created here) sims get a purple Planner badge — the avatar
            colour is GENDER, not provenance, so it can't carry this. */}
        {!sim.sourceId && (
          <PlannerPill />
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${sim.firstName || 'sim'}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-full text-c-faint hover:text-c-red hover:bg-c-red-bg opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-opacity bg-transparent border-none cursor-pointer"
        >
          <Trash size={14} weight="bold" />
        </button>
      )}
    </div>
  );
}

// ─── Column 2: a soft-filled section card (matches SimPanel's Card so Col2 and
//     Col3 read as one visual family — white cards floating on the beige). ──
function Card({ title, count, action, children }: { title: string; count?: number | null; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-c-border py-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <h4 className="text-[10px] font-bold text-c-secondary uppercase tracking-label m-0">{title}</h4>
          {count != null && <span className="text-[10px] text-c-faint">{count}</span>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Column 2 body: the selected household (keyed by hh.id so text state resets) ──
function HouseholdDetails({ hh, members, cover, photos, onPhotosChanged, selectedSimId, onSelectSim, onSyncPhotos }: {
  hh: Household; members: Sim[]; cover: Photo | null;
  photos: Photo[]; onPhotosChanged: () => void;
  selectedSimId: string | null; onSelectSim: (id: string) => void;
  onSyncPhotos: () => void;
}) {
  const updateHousehold = useSaveFile((s) => s.updateHousehold);
  const assignHousehold = useSaveFile((s) => s.assignHousehold);
  const unassignHousehold = useSaveFile((s) => s.unassignHousehold);
  const deleteHousehold = useSaveFile((s) => s.deleteHousehold);
  const deleteSim = useSaveFile((s) => s.deleteSim);
  const lots = useSaveFile((s) => s.lots);
  const sims = useSaveFile((s) => s.sims);
  const households = useSaveFile((s) => s.households);
  const confirm = useConfirm();
  // Only PLAN-ONLY (created here, no save origin) things can be truly deleted —
  // a save-backed household/sim would just re-import on the next sync.
  const isPlannerHh = !hh.sourceId;
  async function handleDeleteHousehold() {
    const ok = await confirm({ message: `Delete ${hh.name || 'this household'} and its sims? This can't be undone.`, confirmLabel: 'Delete', danger: true });
    if (ok) await deleteHousehold(hh.id);
  }
  async function handleDeleteSim(sim: Sim) {
    const ok = await confirm({ message: `Delete ${sim.firstName || 'this sim'}? This can't be undone.`, confirmLabel: 'Delete', danger: true });
    if (ok) await deleteSim(sim.id);
  }
  // Roster buckets (Option C): current members split into those staying and
  // those with a planned move OUT; plus sims moving IN (still in their real home
  // elsewhere). A planned move clears when the sim moves in-game.
  const staying = useMemo(() => members.filter((s) => !s.plannedMoveHouseholdId), [members]);
  const movingOut = useMemo(() => members.filter((s) => s.plannedMoveHouseholdId), [members]);
  const incoming = useMemo(
    () => Object.values(sims).filter((s) => s.plannedMoveHouseholdId === hh.id),
    [sims, hh.id],
  );
  // Info-icon tooltip shared by the two planned-move cards, replacing the
  // old standalone grey caption.
  const plannedMoveHint = (
    <Tooltip text="Planned moves clear when the sim moves in-game." wrap side="top">
      <Info size={13} weight="bold" className="text-c-faint cursor-help" />
    </Tooltip>
  );
  const [notes, setNotes] = useState(hh.notes);
  const [nameDraft, setNameDraft] = useState(hh.name);
  const [showLotPicker, setShowLotPicker] = useState(false);
  const [showAddSim, setShowAddSim] = useState(false);
  // Gear mode (CustomVenues pattern): header facts (lot now, funds later) are
  // display-only until the gear activates their edit controls.
  const [editingFacts, setEditingFacts] = useState(false);

  const lot = hh.assignedLotKey ? lots[hh.assignedLotKey] : null;

  // Lot = goal-vs-reality field. Edited iff the assignment differs from the
  // save baseline — surface-agnostic (this panel and the WorldView lot editor
  // mutate the same store relation, so either triggers it). Consumed-on-match.
  const baselineLotKey = hh.lastImportedState?.assignedLotKey;
  const lotEdited = baselineLotKey !== undefined && (baselineLotKey ?? null) !== (hh.assignedLotKey ?? null);
  const baselineLotName = baselineLotKey
    ? (lots[baselineLotKey]?.customName ?? baselineLotKey.split('::').pop() ?? baselineLotKey)
    : 'no lot';
  // If the save's lot is now occupied by a household you moved there, the
  // server refuses the move and toasts "<lot> is full" rather than double-
  // occupying it. (This used to be waved through to a "Loose Ends tray" that was
  // never built, so the revert silently produced a two-household house.)
  function revertLot() {
    if (baselineLotKey) assignHousehold(baselineLotKey, hh.id).catch(() => {});
    else if (hh.assignedLotKey) unassignHousehold(hh.assignedLotKey, hh.id).catch(() => {});
  }

  // Funds target (threshold): "reach §X". The save's money stays the mirror;
  // the target is CONSUMED once the save reaches it. In gear mode the money
  // pill shows planned ?? mirror — editing writes the target; typing the
  // mirror's own value (or clearing) drops back to mirroring.
  const goalActive = isFundsGoalActive(hh);
  // An authored funds target exists (diverges from the save's mirror), whether
  // or not the save has already reached it. This — not goalActive — is what
  // makes the field "edited" for the revert affordance + edit count, matching
  // how the lot field reverts on any divergence from its baseline.
  const fundsEdited = hh.plannedMoney != null;
  const [goalDraft, setGoalDraft] = useState(() =>
    hh.plannedMoney != null ? String(hh.plannedMoney) : hh.money != null ? String(hh.money) : '');
  function commitGoal() {
    const n = goalDraft.trim() === '' ? null : Number(goalDraft.replace(/[^0-9]/g, ''));
    let v = n != null && Number.isFinite(n) && n > 0 ? Math.min(n, 999_999_999) : null;
    if (v != null && v === hh.money) v = null; // consumed-on-match: typing the save's value = mirroring
    if (v !== (hh.plannedMoney ?? null)) updateHousehold(hh.id, { plannedMoney: v });
    setGoalDraft(v != null ? String(v) : hh.money != null ? String(hh.money) : '');
  }

  // Panel-level revert-all (lot + funds), matching SimPanel's Revert N edits.
  const factsEditedCount = (lotEdited ? 1 : 0) + (fundsEdited ? 1 : 0);
  async function revertAllFacts() {
    const ok = await confirm({
      message: `Revert ${factsEditedCount === 1 ? 'the 1 edit' : `all ${factsEditedCount} edits`} on ${hh.name || 'this household'} back to the save?\n\nThis can't be undone.`,
      confirmLabel: 'Revert all', danger: true,
    });
    if (!ok) return;
    if (lotEdited) revertLot();
    if (fundsEdited) { updateHousehold(hh.id, { plannedMoney: null }); setGoalDraft(hh.money != null ? String(hh.money) : ''); }
  }

  return (
    <>
      {/* Cover photo (from the imported-photos system; margins pre-trimmed at import). */}
      {cover && (
        <img src={api.photoUrl(cover.filename, 400)} alt="" className="w-full h-40 object-contain rounded-lg mb-2.5 shrink-0" />
      )}

      <div className="flex items-start justify-between gap-2 pb-2 shrink-0">
        <div className="min-w-0">
          {editingFacts ? (
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                const v = nameDraft.trim();
                if (v && v !== hh.name) updateHousehold(hh.id, { name: v });
                else if (!v) setNameDraft(hh.name); // don't allow a blank name
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              placeholder="Household name"
              aria-label="Household name"
              className="w-full text-xl font-bold text-c-text bg-c-base border border-c-secondary rounded-md px-2 py-0.5 leading-tight outline-none focus:border-c-secondary"
            />
          ) : (
            <div className="text-xl font-bold text-c-text truncate leading-tight">{hh.name || 'Untitled household'}</div>
          )}
          {/* Where they live — prominent, right under the name. Gear mode turns
              the fact ITSELF into the control (direct manipulation): the lot
              becomes a clickable pill (tap → picker, ✕ unassigns, ↺ reverts
              when diverged). Display mode is plain text. */}
          {editingFacts ? (
            <div className="flex items-center gap-1.5 mt-1 min-w-0">
              <MapPin size={14} weight={lot ? 'fill' : 'regular'} className={`shrink-0 ${lot ? 'text-c-secondary' : 'text-c-faint'}`} />
              <button
                type="button"
                title={lot ? 'Change lot' : 'Assign to a lot'}
                onClick={() => setShowLotPicker(true)}
                className="group/lotpill min-w-0 inline-flex items-center gap-1.5 rounded-full border border-c-border bg-c-base hover:border-c-accent px-3 py-1.5 text-sm cursor-pointer transition-colors"
              >
                {lot ? (
                  <span className="font-semibold text-c-text truncate">{lot.customName}</span>
                ) : (
                  <span className="text-c-dim">Assign a lot</span>
                )}
                {lot && (
                  <span
                    role="button"
                    aria-label="Unassign lot"
                    title="Unassign"
                    onClick={(e) => { e.stopPropagation(); unassignHousehold(hh.assignedLotKey!, hh.id).catch(() => {}); }}
                    className="hidden group-hover/lotpill:flex items-center text-c-faint hover:text-c-red"
                  >
                    <X size={11} weight="bold" />
                  </span>
                )}
              </button>
              {lotEdited && (
                <button
                  type="button"
                  title={`Revert to save · ${baselineLotName}`}
                  onClick={revertLot}
                  className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border border-c-border bg-c-secondary-soft text-c-secondary hover:border-c-secondary cursor-pointer transition-colors"
                >
                  <ArrowCounterClockwise size={12} weight="bold" />
                </button>
              )}
            </div>
          ) : lot ? (
            <div className="flex items-start gap-1.5 text-sm mt-1 min-w-0">
              <MapPin size={14} weight="fill" className="text-c-secondary shrink-0 mt-0.5" />
              {/* One text run so the world flows on the same line as the name. */}
              <span className="font-semibold text-c-text break-words min-w-0">
                {lot.customName} <span className="font-normal text-c-dim whitespace-nowrap">· {lot.worldName}</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm mt-1">
              <MapPin size={14} weight="regular" className="text-c-faint shrink-0" />
              <span className="italic text-c-faint">No lot</span>
            </div>
          )}

          {/* Funds: the save's money is the mirror. Gear mode = the money line
              IS the pill (amount inside, editable — writes the target); a
              purple border + ↺ mark divergence. Display mode shows
              §mirror → §target (wordless) while the target is unmet. */}
          {editingFacts ? (
            <div className="flex items-center gap-1.5 mt-1.5 text-sm">
              <span className="w-[14px] text-center text-[13px] text-c-dim shrink-0">§</span>
              <span className={`inline-flex items-center rounded-full border bg-c-base px-3 py-1.5 focus-within:border-c-accent transition-colors ${fundsEdited ? 'border-c-secondary' : 'border-c-border'}`}>
                <input
                  inputMode="numeric"
                  placeholder="—"
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={commitGoal}
                  className="w-[9ch] bg-transparent border-none outline-none text-[13px] text-c-text p-0"
                />
              </span>
              {fundsEdited && (
                <button
                  type="button"
                  title={`Revert to save · ${fmtFunds(hh.money) ?? '§0'}`}
                  onClick={() => { updateHousehold(hh.id, { plannedMoney: null }); setGoalDraft(hh.money != null ? String(hh.money) : ''); }}
                  className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border border-c-border bg-c-secondary-soft text-c-secondary hover:border-c-secondary cursor-pointer transition-colors"
                >
                  <ArrowCounterClockwise size={12} weight="bold" />
                </button>
              )}
            </div>
          ) : (fmtFunds(hh.money) || goalActive) && (
            // Plan-primary like every other field: the authored target displays;
            // the save's actual lives behind the beacon/editor.
            <div className="text-sm text-c-dim mt-1">{fmtFunds(goalActive ? hh.plannedMoney : hh.money) ?? '§0'}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Revert-all, same pattern as SimPanel: view = a purple "↺ N" cue that
              enters edit AND opens the revert popup in one click; edit = the
              labeled "Revert N edits". */}
          {factsEditedCount > 0 && !editingFacts && (
            <button
              type="button"
              onClick={() => { setEditingFacts(true); revertAllFacts(); }}
              title="Revert every edited detail to the save's value"
              className="inline-flex items-center gap-1 h-7 rounded-full border border-c-secondary bg-c-secondary-soft text-c-secondary px-2.5 text-[11px] font-semibold cursor-pointer transition-colors hover:bg-c-secondary hover:text-white"
            >
              <ArrowCounterClockwise size={13} weight="bold" /> {factsEditedCount}
            </button>
          )}
          {factsEditedCount > 0 && editingFacts && (
            <button
              type="button"
              onClick={revertAllFacts}
              title="Restore every edited detail to the save's value"
              className="inline-flex items-center gap-1.5 h-7 rounded-full border border-c-border bg-c-secondary-soft text-c-secondary px-3 text-[11px] font-semibold cursor-pointer transition-colors hover:border-c-secondary"
            >
              <ArrowCounterClockwise size={12} weight="bold" /> Revert {factsEditedCount} {factsEditedCount === 1 ? 'edit' : 'edits'}
            </button>
          )}
          {/* Labeled Edit toggle — advertises that lot, funds, and members are
              editable (the icon-only gear hid too much). */}
          <button
            type="button"
            onClick={() => setEditingFacts((v) => !v)}
            aria-label="Edit household details"
            title={editingFacts ? 'Done editing' : 'Edit lot, funds & members'}
            className={`inline-flex items-center gap-1.5 rounded-md pl-2 pr-2.5 py-1.5 text-[11px] font-semibold cursor-pointer border-none transition-colors ${editingFacts ? 'bg-c-secondary text-white' : 'bg-c-secondary-soft text-c-secondary hover:bg-c-secondary hover:text-white'}`}
          >
            <GearSix size={14} weight={editingFacts ? 'fill' : 'bold'} /> {editingFacts ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-0.5">
        {/* Members — those staying (a planned move pulls a member into Moving
            out below). Edit mode reveals "Add sim" (same create modal). */}
        <Card
          title="Members"
          count={staying.length || null}
          action={editingFacts ? (
            <button
              type="button"
              onClick={() => setShowAddSim(true)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-c-border bg-c-accent-soft text-c-accent text-[11px] font-semibold cursor-pointer transition-colors hover:border-c-accent"
            >
              <Plus size={12} weight="bold" /> Add sim
            </button>
          ) : undefined}
        >
          <div className="space-y-1.5">
            {staying.length === 0 && <p className="text-[11px] text-c-faint italic m-0">{members.length === 0 ? 'No named sims.' : 'Everyone here is moving out.'}</p>}
            {staying.map((sim) => (
              <SimRosterRow key={sim.id} sim={sim} selected={sim.id === selectedSimId} onClick={() => onSelectSim(sim.id)} subline={`${LIFESTAGE_LABEL[sim.lifestage]}${sim.isGhost ? ' · Ghost' : ''}`} onDelete={editingFacts && !sim.sourceId ? () => handleDeleteSim(sim) : undefined} />
            ))}
          </div>
        </Card>

        {/* Moving out — current members with a planned move; they still live here
            until the game move, so purple/dashed = plan, not gone. */}
        {movingOut.length > 0 && (
          <Card title="Moving out" action={plannedMoveHint}>
            <div className="space-y-1.5">
              {movingOut.map((sim) => (
                <SimRosterRow key={sim.id} sim={sim} planned selected={sim.id === selectedSimId} onClick={() => onSelectSim(sim.id)} subline={sim.plannedMoveHouseholdId && households[sim.plannedMoveHouseholdId] ? `→ ${households[sim.plannedMoveHouseholdId].name}` : 'planned move'} />
              ))}
            </div>
          </Card>
        )}

        {/* Moving in — sims still living in their real home elsewhere who plan to
            move here. Selectable so you can jump to their panel. */}
        {incoming.length > 0 && (
          <Card title="Moving in" action={plannedMoveHint}>
            <div className="space-y-1.5">
              {incoming.map((sim) => (
                <SimRosterRow key={sim.id} sim={sim} planned selected={sim.id === selectedSimId} onClick={() => onSelectSim(sim.id)} subline={sim.householdId && households[sim.householdId] ? `now in ${households[sim.householdId].name}` : 'planned move'} />
              ))}
            </div>
          </Card>
        )}

        {/* Description — the household bio from the save (read-only mirror).
            Hidden entirely when the save has none. */}
        <MirroredDescription value={hh.description} bare />

        {/* Showcase photos — HouseholdBuiltPhotos carries its own header, so this
            section is title-less. */}
        <div className="border-t border-c-border py-4">
          <HouseholdBuiltPhotos
            householdId={hh.id}
            photos={photos}
            onAdded={onPhotosChanged}
            onDeleted={onPhotosChanged}
            onCaptionSaved={onPhotosChanged}
            onSyncPhotos={onSyncPhotos}
          />
        </div>

        {/* Notes — private, planner-only. */}
        <Notes
          value={notes}
          rows={2}
          bare
          onChange={setNotes}
          onBlur={() => { if (notes !== hh.notes) updateHousehold(hh.id, { notes }); }}
        />

        {/* Delete — only for plan-only (created here) households, in edit mode.
            A save-backed household can't be truly deleted (re-imports on sync). */}
        {editingFacts && isPlannerHh && (
          <button
            type="button"
            onClick={handleDeleteHousehold}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-c-red hover:bg-c-red-bg rounded-md px-2.5 py-1.5 bg-transparent border-none cursor-pointer transition-colors"
          >
            <Trash size={14} weight="bold" /> Delete household
          </button>
        )}
      </div>

      {showLotPicker && (
        <LotPickerModal
          onClose={() => setShowLotPicker(false)}
          onSelect={(lotKey) => { assignHousehold(lotKey, hh.id).catch(() => {}); }}
        />
      )}
      {showAddSim && (
        <CreateHouseholdModal
          onClose={() => setShowAddSim(false)}
          target={{ householdId: hh.id, householdName: hh.name || 'this household', currentCount: members.length }}
        />
      )}
    </>
  );
}

// ─── Column 1: an accordion-zone header (My Households / Rest of Town) ────────
function ZoneToggle({ label, count, open, onClick }: { label: string; count: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full shrink-0 flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors text-left focus:outline-none ${open ? 'bg-c-accent-soft border-c-accent' : 'bg-c-panel border-c-border hover:border-c-accent'}`}
    >
      {open ? <CaretDown size={13} weight="bold" className="text-c-dim shrink-0" /> : <CaretRight size={13} weight="bold" className="text-c-dim shrink-0" />}
      <span className="flex-1 min-w-0 text-[12px] font-semibold text-c-text">{label}</span>
      <span className="text-[12px] font-semibold text-c-dim shrink-0">{count}</span>
    </button>
  );
}

// ─── Column 1: a selectable household row ─────────────────────────────────────
function HouseholdRow({ hh, count, cover, selected, onSelect, showBadge = false, showAvatar = true }: {
  hh: Household; count: number; cover: Photo | null;
  selected: boolean; onSelect: () => void; showBadge?: boolean; showAvatar?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-listnav-id={hh.id}
      className={`w-full text-left rounded-md px-2.5 py-2 cursor-pointer border transition-colors flex items-center gap-2.5 focus:outline-none ${selected ? 'bg-c-accent-soft border-c-accent' : 'bg-c-base border-c-border hover:border-c-accent'}`}
    >
      {/* Portrait circle (imported game photo) with the classic gradient
          fallback. My Households only — Rest of Town rows stay compact
          (photos still import + show on the Col2 panel). */}
      {showAvatar && (cover ? (
        <img
          src={api.photoUrl(cover.filename, 40)}
          alt=""
          className="w-10 h-10 rounded-full object-cover object-top border border-c-border shrink-0"
        />
      ) : (
        <div
          className="w-10 h-10 rounded-full border border-c-border shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--c-accent-soft) 0%, var(--c-secondary-soft) 100%)' }}
        >
          <UsersThree size={18} weight="duotone" className="text-c-secondary" />
        </div>
      ))}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-c-text truncate">{hh.name || 'Untitled household'}</div>
        <div className="text-[11px] text-c-dim flex items-center gap-1 mt-0.5 min-w-0">
          <Users size={11} weight="regular" className="shrink-0" /> {count}
        </div>
      </div>
      {/* Provenance badges live on Rest of Town rows (Premade/Townie/Service).
          On My Households, the only distinction worth marking is plan-only
          (created here) vs from-save — a purple "Planner" badge, matching the
          plan grammar (purple = your hand). */}
      {showBadge ? <ProvBadge hh={hh} /> : !hh.sourceId && (
        <PlannerPill />
      )}
    </button>
  );
}

export function HouseholdWorkspace() {
  const householdsMap = useSaveFile((s) => s.households);
  const simsMap = useSaveFile((s) => s.sims);
  const relationships = useSaveFile((s) => s.relationships);
  const lots = useSaveFile((s) => s.lots);

  const saveFileId = useSaveFile((s) => s.saveFileId);

  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [selectedSimId, setSelectedSimId] = useState<string | null>(null);
  const [openZone, setOpenZone] = useState<'mine' | 'town'>('mine'); // Col1 accordion — one zone open at a time
  const [navOpen, setNavOpen] = useState(false); // narrow-screen households/household drawer
  const [showImportPortraits, setShowImportPortraits] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [worldFilter, setWorldFilter] = useState<string | null>(null);
  const [townFilter, setTownFilter] = useState<string | null>(null); // Rest of Town badge filter (provLabel)
  const [mineFilter, setMineFilter] = useState<'real' | 'planner' | null>(null); // My Households: from-save vs created

  // Household photos (covers) — same source as the old manager: built photos
  // targeted at households; sim portraits never the cover except solo-sim fallback.
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [simPortraitIds, setSimPortraitIds] = useState<Set<string>>(new Set());
  const refreshPhotos = useCallback(() => {
    if (!saveFileId) return;
    api.listBuiltPhotos(saveFileId, 'household').then(setAllPhotos).catch(() => {});
    api.listSimPortraits(saveFileId).then((rows) => setSimPortraitIds(new Set(rows.map((r) => r.photoId)))).catch(() => {});
  }, [saveFileId]);
  useEffect(() => { refreshPhotos(); }, [refreshPhotos]);

  const relevance = useMemo(
    () => computeHouseholdRelevance(householdsMap, simsMap, relationships),
    [householdsMap, simsMap, relationships],
  );

  const membersByHousehold = useMemo(() => {
    const m = new Map<string, Sim[]>();
    for (const sim of Object.values(simsMap)) {
      if (!sim.householdId) continue;
      (m.get(sim.householdId) ?? m.set(sim.householdId, []).get(sim.householdId)!).push(sim);
    }
    return m;
  }, [simsMap]);

  // Cover per household (ported from the old manager): newest build photo wins;
  // a solo-sim household with nothing else falls back to its sim portrait.
  const coversByHousehold = useMemo(() => {
    const byHh: Record<string, Photo[]> = {};
    for (const p of allPhotos) if (p.target_key) (byHh[p.target_key] ??= []).push(p);
    const map: Record<string, Photo> = {};
    for (const [hhId, ps] of Object.entries(byHh)) {
      const builds = ps.filter((p) => !simPortraitIds.has(p.id));
      if (builds.length) map[hhId] = builds[builds.length - 1];
      else if ((membersByHousehold.get(hhId)?.length ?? 0) === 1) map[hhId] = ps[ps.length - 1];
    }
    return map;
  }, [allPhotos, simPortraitIds, membersByHousehold]);

  // Same world list + order as every other picker in the planner (canonical
  // release order, unowned packs and switched-off worlds dropped).
  const availableWorlds = usePlannableWorlds();

  const searching = !!search.trim();
  const filterActive = searching || !!worldFilter;

  const { foreground, background } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fg: Household[] = [];
    const bg: Household[] = [];
    for (const hh of Object.values(householdsMap)) {
      if (q && !(hh.name || '').toLowerCase().includes(q)) continue;
      if (worldFilter) {
        const w = hh.assignedLotKey ? lots[hh.assignedLotKey]?.worldName : null;
        if (w !== worldFilter) continue;
      }
      (isForegroundEffective(hh, relevance) ? fg : bg).push(hh);
    }
    const byName = (a: Household, b: Household) => (a.name || '').localeCompare(b.name || '');
    return { foreground: fg.sort(byName), background: bg.sort(byName) };
  }, [householdsMap, relevance, search, worldFilter, lots]);

  // Town-wide overview stats (UNFILTERED — the landing shows the whole town,
  // regardless of the list's search/world filters).
  const hhOverview = useMemo(() => {
    const all = Object.values(householdsMap);
    const total = all.length;
    let mine = 0;
    let sims = 0;
    let assigned = 0;
    for (const hh of all) {
      if (isForegroundEffective(hh, relevance)) mine++;
      if (hh.assignedLotKey) assigned++;
      sims += membersByHousehold.get(hh.id)?.length ?? 0;
    }
    return { total, mine, town: total - mine, sims, assigned };
  }, [householdsMap, relevance, membersByHousehold]);

  function selectHousehold(id: string) {
    setSelectedHouseholdId(id);
    // Auto-select the first member so the sim panel isn't empty.
    const members = membersByHousehold.get(id) ?? [];
    setSelectedSimId(members[0]?.id ?? null);
  }

  // Deep-link: /households?hh=<id>&sim=<id> preselects a household (and
  // optionally a sim) — used by the Randomizer, Family tree, and Sims roster.
  // Consume once the target household has loaded, then strip the params so the
  // URL stays clean and back-navigation doesn't re-fire the jump.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkConsumed = useRef(false);
  useEffect(() => {
    if (deepLinkConsumed.current) return;
    const hhId = searchParams.get('hh');
    if (!hhId) { deepLinkConsumed.current = true; return; }
    if (!householdsMap[hhId]) return; // wait for households to load
    deepLinkConsumed.current = true;
    setSelectedHouseholdId(hhId);
    const simId = searchParams.get('sim');
    const members = membersByHousehold.get(hhId) ?? [];
    setSelectedSimId(simId && members.some((m) => m.id === simId) ? simId : (members[0]?.id ?? null));
    setSearchParams((p) => { p.delete('hh'); p.delete('sim'); return p; }, { replace: true });
  }, [searchParams, householdsMap, membersByHousehold, setSearchParams]);

  // Land on the town overview, not a forced selection — dropping straight into
  // a household's editor on open was overwhelming. Only recover here if the
  // selected household was deleted (stale id → clear back to the overview).
  useEffect(() => {
    if (selectedHouseholdId && !householdsMap[selectedHouseholdId]) {
      setSelectedHouseholdId(null);
      setSelectedSimId(null);
    }
  }, [selectedHouseholdId, householdsMap]);

  // Rest of Town badge filter — pills for whichever provenance labels are present.
  const townLabels = useMemo(() => {
    const present = new Set(background.map(provLabel));
    return ['Premade', 'Townie', 'Service Sim', 'Yours', 'Mod', 'Plan-only'].filter((l) => present.has(l));
  }, [background]);
  const townRows = useMemo(
    () => (townFilter ? background.filter((hh) => provLabel(hh) === townFilter) : background),
    [background, townFilter],
  );

  // My Households real-vs-planner split — offer the filter only when both kinds
  // are present (created plan-only households have no sourceId). 'real' = mirrors
  // a save household; 'planner' = you built it here.
  const mineHasReal = useMemo(() => foreground.some((h) => h.sourceId), [foreground]);
  const mineHasPlanner = useMemo(() => foreground.some((h) => !h.sourceId), [foreground]);
  const foregroundRows = useMemo(
    () => (mineFilter ? foreground.filter((h) => (mineFilter === 'planner' ? !h.sourceId : !!h.sourceId)) : foreground),
    [foreground, mineFilter],
  );

  // ↑/↓ walk the visible rows: search shows both zones; otherwise the open zone.
  const navItems = searching ? [...foreground, ...background] : openZone === 'town' ? townRows : foreground;
  useListKeyboardNav({
    items: navItems,
    selectedId: selectedHouseholdId,
    onSelect: selectHousehold,
    enabled: !showImportPortraits,
  });

  const selectedHousehold = selectedHouseholdId ? householdsMap[selectedHouseholdId] : null;
  const selectedMembers = selectedHouseholdId ? (membersByHousehold.get(selectedHouseholdId) ?? []) : [];
  const selectedSim = selectedSimId ? simsMap[selectedSimId] : null;

  return (
    <div className="flex gap-3 h-[calc(100vh-56px)] p-4 min-h-0 relative max-w-[1600px] w-full">
      {/* Backdrop for the nav drawer (below lg only). */}
      {navOpen && (
        <button type="button" aria-label="Close" onClick={() => setNavOpen(false)} className="lg:hidden absolute inset-0 z-30 bg-black/40 border-none cursor-pointer rounded-lg" />
      )}

      {/* Columns 1+2 (households list + selected household) — inline at lg+,
          collapsed into a single drawer below lg so the sim panel keeps width. */}
      <aside
        className={`flex gap-3 min-h-0 shrink-0
          absolute inset-y-0 left-0 z-40 w-[320px] flex-col bg-c-base rounded-lg shadow-2xl transition-transform ${navOpen ? 'translate-x-0' : '-translate-x-[110%]'}
          lg:static lg:z-auto lg:w-auto lg:flex-row lg:bg-transparent lg:rounded-none lg:shadow-none lg:translate-x-0 lg:transition-none`}
      >
        <button type="button" onClick={() => setNavOpen(false)} aria-label="Close" className="lg:hidden absolute top-2 right-2 z-10 w-7 h-7 rounded-md flex items-center justify-center text-c-dim hover:text-c-text bg-c-card border border-c-border cursor-pointer">
          <X size={15} weight="bold" />
        </button>
      {/* ── Column 1: households list + Rest of Town drawer ── */}
      <div className="w-full lg:w-[260px] xl:w-[300px] lg:shrink-0 flex-1 lg:flex-none flex flex-col min-h-0 border border-c-border rounded-lg bg-c-card p-2">
        <div className="px-1 pb-2 space-y-2">
          {/* This column had no title at all — it opened straight onto two
              buttons, so Households was the only manager that never named
              itself. Tier-2 rail title, same as Clubs/Holidays/Dynasties. */}
          <h1 className="text-xl font-bold text-c-text m-0 tracking-headline pt-0.5">Households</h1>
          {/* Primary CTAs (ported from the old manager). New household opens the
              creation modal (a household is born with its first sim). */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              title="Create a new household"
              className="flex flex-col items-center justify-center gap-1 bg-c-accent hover:bg-c-accent-hover text-white border-none rounded-lg py-3 px-1 cursor-pointer transition-colors shadow-sm"
            >
              <Plus size={18} weight="bold" />
              <span className="text-2xs font-semibold uppercase tracking-label leading-tight text-center">New household</span>
            </button>
            <button
              type="button"
              onClick={() => setShowImportPortraits(true)}
              title="Auto-sync household portraits from the save's localthumbcache.package"
              className="flex flex-col items-center justify-center gap-1 bg-c-secondary hover:bg-c-secondary-hover text-white border-none rounded-lg py-3 px-1 cursor-pointer transition-colors shadow-sm"
            >
              <Camera size={18} weight="duotone" />
              <span className="text-2xs font-semibold uppercase tracking-label leading-tight text-center">Sync photos</span>
            </button>
          </div>

          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-9 py-1.5 text-[12px] text-c-text outline-none focus:border-c-accent"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-c-faint hover:text-c-text p-1"
              >
                <X size={11} weight="bold" />
              </button>
            )}
          </div>

          {/* World filter — secondary tool, so the compact quiet variant. */}
          {availableWorlds.length > 0 && (
            <Dropdown
              compact
              value={worldFilter ?? ''}
              onChange={(v) => setWorldFilter(v || null)}
              options={[{ value: '', label: 'All Worlds' }, ...availableWorlds.map((w) => ({ value: w, label: w }))]}
              ariaLabel="Filter by world"
            />
          )}

          {/* Zone header — plain bold title while My Households is the open zone
              (the default, prime state); it collapses into an accordion card
              only when Rest of Town takes over below. Hidden while searching —
              results carry their own section labels. The Real/Planner filter
              rides this same row (quiet chips) to avoid a stacked control row. */}
          {openZone === 'mine' && !searching && (
            <div className="flex items-center justify-between gap-2 pt-1.5">
              <div className="flex items-baseline gap-1.5">
                <div className="text-[13px] font-bold text-c-text">My Households</div>
                <div className="text-[12px] font-semibold text-c-dim">{foreground.length}</div>
              </div>
              {mineHasReal && mineHasPlanner && (
                <div className="flex items-center gap-1 shrink-0">
                  {(['real', 'planner'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setMineFilter(mineFilter === f ? null : f)}
                      title={f === 'real' ? 'Show only from-save households' : 'Show only households you created'}
                      className={`whitespace-nowrap text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-colors focus:outline-none ${mineFilter === f ? 'bg-c-accent text-white border-c-accent' : 'bg-transparent text-c-faint border-c-border hover:border-c-accent hover:text-c-text'}`}
                    >
                      {f === 'real' ? 'Save' : 'Planner'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* ── Searching overrides the accordion: matches from BOTH zones, with
            section labels — a Rest of Town hit must never hide behind a closed
            drawer. ── */}
        {searching ? (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-2">
            {foreground.length > 0 && (
              <div className="pt-0.5 pb-0.5 px-1 text-[10px] font-semibold text-c-dim uppercase tracking-label">My Households</div>
            )}
            {foreground.map((hh) => (
              <HouseholdRow key={hh.id} hh={hh} count={(membersByHousehold.get(hh.id) ?? []).length} cover={coversByHousehold[hh.id] ?? null} selected={hh.id === selectedHouseholdId} onSelect={() => selectHousehold(hh.id)} />
            ))}
            {background.length > 0 && (
              <div className="pt-1.5 pb-0.5 px-1 text-[10px] font-semibold text-c-dim uppercase tracking-label">Rest of Town</div>
            )}
            {background.map((hh) => (
              <HouseholdRow key={hh.id} hh={hh} count={(membersByHousehold.get(hh.id) ?? []).length} cover={coversByHousehold[hh.id] ?? null} selected={hh.id === selectedHouseholdId} onSelect={() => selectHousehold(hh.id)} showBadge showAvatar={false} />
            ))}
            {foreground.length + background.length === 0 && (
              <p className="text-[11px] text-c-faint italic px-1">No households match.</p>
            )}
          </div>
        ) : (
        <>
        {/* ── My Households: the prime zone. Open (default) = plain list under
            the bold header above; collapsed (Rest of Town open) = an accordion
            card row you tap to come back. ── */}
        {openZone === 'mine' ? (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-2">
            {foregroundRows.length === 0 && (
              <p className="text-[11px] text-c-faint italic px-1">{filterActive || mineFilter ? 'No households match.' : 'No foreground households yet.'}</p>
            )}
            {foregroundRows.map((hh) => (
              <HouseholdRow key={hh.id} hh={hh} count={(membersByHousehold.get(hh.id) ?? []).length} cover={coversByHousehold[hh.id] ?? null} selected={hh.id === selectedHouseholdId} onSelect={() => selectHousehold(hh.id)} />
            ))}
          </div>
        ) : (
          <ZoneToggle
            label="My Households"
            count={foreground.length}
            open={false}
            onClick={() => setOpenZone('mine')}
          />
        )}

        {/* Rest of Town — everyone else in the save is ingested; this is where
            the other N hundred live. */}
        <div className="mt-2 shrink-0" />
        <ZoneToggle
          label="Rest of Town"
          count={background.length}
          open={openZone === 'town'}
          onClick={() => setOpenZone(openZone === 'town' ? 'mine' : 'town')}
        />
        {openZone === 'town' && (
          <>
            {townLabels.length > 1 && (
              <div className="flex gap-1.5 mt-1.5 px-0.5 shrink-0">
                {townLabels.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setTownFilter(townFilter === l ? null : l)}
                    className={`flex-1 whitespace-nowrap text-center text-[10px] font-semibold px-2 py-1 rounded-full border cursor-pointer transition-colors focus:outline-none ${townFilter === l ? 'bg-c-accent text-white border-c-accent' : 'bg-c-base text-c-dim border-c-border hover:border-c-accent hover:text-c-text'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-2 mt-1.5">
              {townRows.map((hh) => (
                <HouseholdRow key={hh.id} hh={hh} count={(membersByHousehold.get(hh.id) ?? []).length} cover={coversByHousehold[hh.id] ?? null} selected={hh.id === selectedHouseholdId} onSelect={() => selectHousehold(hh.id)} showBadge showAvatar={false} />
              ))}
              {townRows.length === 0 && <p className="text-[11px] text-c-faint italic px-1">No households match.</p>}
            </div>
          </>
        )}
        </>
        )}
      </div>

      {/* ── Column 2: Selected Household (interim slim panel — full redo deferred) ── */}
      <div className={`w-full lg:w-[300px] xl:w-[400px] lg:shrink-0 flex-1 lg:flex-none flex-col min-h-0 border border-c-border rounded-lg bg-c-card p-3 ${selectedHousehold ? 'flex' : 'hidden'}`}>
        {!selectedHousehold ? null : (
          <HouseholdDetails
            key={selectedHousehold.id}
            hh={selectedHousehold}
            members={selectedMembers}
            cover={coversByHousehold[selectedHousehold.id] ?? null}
            photos={allPhotos.filter((p) => p.target_key === selectedHousehold.id)}
            onPhotosChanged={refreshPhotos}
            selectedSimId={selectedSimId}
            onSelectSim={(id) => { setSelectedSimId(id); setNavOpen(false); }}
            onSyncPhotos={() => setShowImportPortraits(true)}
          />
        )}
      </div>
      </aside>

      {/* ── Column 3: Selected Sim ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 border border-c-border rounded-lg bg-c-card p-3">
        <div className="lg:hidden shrink-0 pb-2">
          <button type="button" onClick={() => setNavOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-c-border bg-c-card px-2.5 py-1.5 text-xs font-semibold text-c-dim hover:text-c-text cursor-pointer transition-colors">
            <List size={14} weight="bold" /> Households
          </button>
        </div>
        {selectedSim ? (
          <SimPanel key={selectedSim.id} sim={selectedSim} onJumpToHousehold={(id) => { selectHousehold(id); setNavOpen(false); }} />
        ) : !selectedHousehold ? (
          <div className="flex-1 overflow-y-auto pt-2">
            <OverviewLanding title="Town at a glance" columns={2}>
              <HeroSplit
                total={hhOverview.total}
                label={hhOverview.total === 1 ? 'Household' : 'Households'}
                segments={[
                  { value: hhOverview.mine, label: 'My Households', tone: 'green' },
                  { value: hhOverview.town, label: 'Rest of Town', tone: 'neutral' },
                ]}
              />
              <StatTile tone="green" label="Sims" value={hhOverview.sims} sub="across all households"
                icon={<Users size={20} weight="duotone" />} />
              <StatTile tone="green" label="Assigned to a lot" value={hhOverview.assigned} sub={`of ${hhOverview.total} households`}
                icon={<House size={20} weight="duotone" />} />
            </OverviewLanding>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center text-[12px] text-c-faint px-4">
            <span><Users size={22} weight="light" className="mx-auto mb-2 block opacity-50" />Select a sim to edit</span>
          </div>
        )}
      </div>

      {showImportPortraits && (
        <ImportPortraitsModal
          onClose={() => setShowImportPortraits(false)}
          onComplete={refreshPhotos}
        />
      )}
      {showCreate && (
        <CreateHouseholdModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            // Clear anything that could hide the new household, open My
            // Households, and select it so Col2/Col3 show it immediately.
            setSearch(''); setWorldFilter(null); setMineFilter(null);
            setOpenZone('mine');
            selectHousehold(id);
          }}
        />
      )}
    </div>
  );
}
