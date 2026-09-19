/**
 * "Add ancestor" drawer — two modes:
 *  • fill — flesh out an existing Unknown stub (a culled ancestor the game only
 *    remembers as a dangling ID). Saving flips the row from 'stub' to 'manual'.
 *  • create — invent a brand-new parent for a top-of-tree sim that has none,
 *    extending a line upward. Creates a 'manual' sim + a manual parent edge.
 * Either way the result is sync-invisible: re-imports never overwrite what the
 * user wrote here.
 */
import { useState } from 'react';
import type { Sim, SimGender, SimLifestage } from '../../types';
import { useSaveFile } from '../../store/useSaveFile';
import { api } from '../../lib/api';
import { DEATH_CAUSE_TRAITS } from '../../data/deathCauses';
import { useEscapeToClose } from '../common/useEscapeToClose';
import { btn } from '../common/btn';

const LIFESTAGE_OPTIONS: Array<{ value: SimLifestage; label: string }> = [
  { value: 'elder', label: 'Elder' },
  { value: 'adult', label: 'Adult' },
  { value: 'youngAdult', label: 'Young Adult' },
  { value: 'teen', label: 'Teen' },
  { value: 'child', label: 'Child' },
  { value: 'toddler', label: 'Toddler' },
  { value: 'infant', label: 'Infant' },
  { value: 'newborn', label: 'Newborn' },
];

const KNOWN_CAUSES = [...new Set(Object.values(DEATH_CAUSE_TRAITS))].sort();

interface AddAncestorModalProps {
  sim?: Sim;                  // fill mode: the existing stub row to flesh out
  childId?: string;           // create mode: invent a new parent OF this sim
  childLastName?: string;     // create mode: prefill the surname
  onClose: () => void;
  onSaved?: () => void;       // create mode: refresh edges after the new link
}

export function AddAncestorModal({ sim, childId, childLastName, onClose, onSaved }: AddAncestorModalProps) {
  useEscapeToClose(onClose);
  const updateSim = useSaveFile((s) => s.updateSim);
  const addSim = useSaveFile((s) => s.addSim);
  const [firstName, setFirstName] = useState(sim && sim.firstName !== 'Unknown' ? sim.firstName : '');
  const [lastName, setLastName] = useState(sim ? sim.lastName : (childLastName ?? ''));
  const [gender, setGender] = useState<SimGender>(sim ? sim.gender : 'female');
  const [lifestage, setLifestage] = useState<SimLifestage>('elder');
  const [deceased, setDeceased] = useState(true);   // ancestors usually are
  const [deathCause, setDeathCause] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const common = {
        firstName: firstName.trim() || 'Unknown',
        lastName: lastName.trim(),
        gender,
        lifestage,
        isGhost: deceased,
        deathCause: deceased && deathCause ? deathCause : null,
      };
      if (sim) {
        // fill an existing stub
        await updateSim(sim.id, { ...common, recordStatus: 'manual' });
      } else if (childId) {
        // create a brand-new ancestor and link it as the child's parent
        const saveFileId = useSaveFile.getState().saveFileId;
        if (!saveFileId) throw new Error('No save file loaded');
        const newId = await addSim({
          householdId: null, ...common,
          species: 'human', petSubtype: 'pet', petBreed: null, occult: 'none',
          notes: '', sourceId: null, traitIds: [], aspirationId: null,
          recordStatus: 'manual', culledAt: null,
        });
        await api.createManualRelationship(saveFileId, { simAId: newId, simBId: childId, relType: 'parent' });
        onSaved?.();
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const genderBtn = (g: SimGender, label: string) => (
    <button
      onClick={() => setGender(g)}
      className={`flex-1 px-3 py-1.5 rounded-md text-sm border transition-colors ${
        gender === g
          ? g === 'male'
            ? 'bg-c-accent-soft border-c-accent text-c-green font-semibold'
            : 'bg-c-secondary-soft border-c-secondary text-c-secondary font-semibold'
          : 'bg-c-card border-c-border text-c-dim hover:text-c-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-c-card border border-c-border rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-c-border">
          <h2 className="text-base font-bold text-c-text">Add ancestor</h2>
          <p className="text-xs text-c-muted mt-1">
            Whatever you fill in here will not be overwritten by re-syncs.
          </p>
        </div>

        <div className="p-5 flex flex-col gap-3 bg-c-base">
          <div className="flex gap-2">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              autoFocus
              className="flex-1 min-w-0 bg-c-card border border-c-border rounded-md px-3 py-1.5 text-sm text-c-text"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="flex-1 min-w-0 bg-c-card border border-c-border rounded-md px-3 py-1.5 text-sm text-c-text"
            />
          </div>
          <div className="flex gap-2">
            {genderBtn('female', '♀ Female')}
            {genderBtn('male', '♂ Male')}
          </div>
          <select
            value={lifestage}
            onChange={(e) => setLifestage(e.target.value as SimLifestage)}
            className="bg-c-card border border-c-border rounded-md px-2 py-1.5 text-sm text-c-text"
          >
            {LIFESTAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-c-text cursor-pointer">
            <input
              type="checkbox"
              checked={deceased}
              onChange={(e) => setDeceased(e.target.checked)}
              className="accent-c-accent cursor-pointer"
            />
            Deceased
          </label>
          {deceased && (
            <select
              value={deathCause}
              onChange={(e) => setDeathCause(e.target.value)}
              className="bg-c-card border border-c-border rounded-md px-2 py-1.5 text-sm text-c-text"
            >
              <option value="">Cause of death — unknown</option>
              {KNOWN_CAUSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {error && <p className="text-xs text-c-red">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-c-border flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-c-dim hover:text-c-text px-3 py-1.5">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={btn('primary')}
          >
            {saving ? 'Saving…' : 'Save ancestor'}
          </button>
        </div>
      </div>
    </div>
  );
}
