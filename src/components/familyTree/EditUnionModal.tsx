/**
 * Union editing — click a union ring (or co-parent dotted line) to record a
 * bond the save no longer remembers. The motivating case: long-dead ancestor
 * couples, where the game culls both the spouse pointer and the relationship
 * records, leaving only co-parentage. The user's correction is stored as a
 * MANUAL edge (never touched by re-sync); imported edges stay untouched
 * underneath, so clearing the manual bond restores exactly what the save says.
 */
import { useState } from 'react';
import type { Sim, SimRelType, SimRelationship } from '../../types';
import { api } from '../../lib/api';
import { useEscapeToClose } from '../common/useEscapeToClose';

const BOND_OPTIONS: Array<{ value: SimRelType; label: string }> = [
  { value: 'spouse', label: 'Married' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'partner', label: 'Partners' },
  { value: 'ex_spouse', label: 'Divorced' },
  { value: 'ex_fiance', label: 'Engagement ended' },
  { value: 'ex_partner', label: 'Broken up' },
];

const BOND_LABEL = Object.fromEntries(BOND_OPTIONS.map((o) => [o.value, o.label]));

interface EditUnionModalProps {
  saveFileId: string;
  a: Sim;
  b: Sim;
  /** All couple edges currently stored between the pair. */
  existing: SimRelationship[];
  onClose: () => void;
  /** Called after any mutation so the page can refetch edges. */
  onChanged: () => void;
}

export function EditUnionModal({ saveFileId, a, b, existing, onClose, onChanged }: EditUnionModalProps) {
  useEscapeToClose(onClose);
  const manual = existing.find((e) => e.source === 'manual');
  const imported = existing.filter((e) => e.source === 'import');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const name = (s: Sim) => `${s.firstName} ${s.lastName}`.trim() || '(unnamed)';

  /**
   * Picking a bond APPLIES it and stays open.
   *
   * It used to close the modal the instant you clicked, which gave you no
   * moment to see that the choice registered — you were just ejected, and the
   * only way to check what you'd picked was to open it again. Everything else
   * in the app auto-saves and lets you leave when you're ready; this now does
   * the same, and the picked option is visibly the selected one.
   */
  async function setBond(relType: SimRelType) {
    setBusy(true);
    setError('');
    try {
      if (manual) await api.deleteManualRelationship(saveFileId, manual.id);
      if (manual?.relType !== relType) {
        await api.createManualRelationship(saveFileId, { simAId: a.id, simBId: b.id, relType });
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clearManual() {
    if (!manual) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteManualRelationship(saveFileId, manual.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-c-card border border-c-border rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-c-border">
          <h2 className="text-base font-bold text-c-text">{name(a)} & {name(b)}</h2>
          <p className="text-xs text-c-muted mt-1">
            {manual
              ? <>Manually set: <strong className="text-c-text">{BOND_LABEL[manual.relType] ?? manual.relType}</strong></>
              : imported.length > 0
                ? <>From the save: <strong className="text-c-text">{imported.map((e) => BOND_LABEL[e.relType] ?? e.relType).join(', ')}</strong></>
                : 'No recorded bond — the save only remembers them as co-parents. Old saves cull relationship data when sims die, so this is common for ancestors.'}
          </p>
        </div>

        <div className="p-5 grid grid-cols-2 gap-2 bg-c-base">
          {BOND_OPTIONS.map((o) => {
            const isCurrent = manual?.relType === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setBond(o.value)}
                disabled={busy}
                className={`px-3 py-2 rounded-md text-sm border transition-colors disabled:opacity-50 ${
                  isCurrent
                    ? 'bg-c-secondary-soft border-c-secondary text-c-secondary font-semibold'
                    : 'bg-c-card border-c-border text-c-text hover:border-c-secondary'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {error && <p className="px-5 pb-2 text-xs text-c-red">{error}</p>}

        <div className="px-5 py-3 border-t border-c-border flex items-center justify-between">
          {manual ? (
            <button
              onClick={clearManual}
              disabled={busy}
              className="text-sm text-c-red hover:underline bg-transparent border-none cursor-pointer p-0 disabled:opacity-50"
            >
              Remove manual bond
            </button>
          ) : <span />}
          <button onClick={onClose} className="text-sm text-c-dim hover:text-c-text px-3 py-1.5">Done</button>
        </div>
      </div>
    </div>
  );
}
