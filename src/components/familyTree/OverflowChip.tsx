/**
 * Breadth fallback UI. When a unit has too many bare leaf-children (a 100-baby
 * legacy), the layout collapses them into one chip card; this renders that chip
 * and the grid drawer that lists everyone behind it. Keeps the tree narrow while
 * every collapsed sim stays one click from re-centering.
 */
import { X } from '@phosphor-icons/react';
import type { Sim } from '../../types';
import { iconBtn } from '../common/btn';
import { SimAvatar, cardState, LIFESTAGE_LABEL } from './SimCard';
import { CARD_W, CARD_H } from '../../lib/familyTree/layout';
import { useEscapeToClose } from '../common/useEscapeToClose';

const KIND_NOUN: Record<'children' | 'siblings', [string, string]> = {
  children: ['child', 'children'],
  siblings: ['sibling', 'siblings'],
};

export function OverflowChipCard({ count, kind, preview, onOpen }: {
  count: number;
  kind: 'children' | 'siblings';
  preview: Sim[];
  onOpen: () => void;
}) {
  const [one, many] = KIND_NOUN[kind];
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      style={{ width: CARD_W, height: CARD_H }}
      className="rounded-2xl border-2 border-dashed border-c-border bg-c-panel flex flex-col items-center justify-center gap-2 hover:border-c-accent hover:bg-c-accent-soft transition-colors group"
    >
      <div className="flex -space-x-2">
        {preview.map((s) => (
          <div key={s.id} className="ring-2 ring-c-panel rounded-full group-hover:ring-c-accent-soft transition-colors">
            <SimAvatar sim={s} size="mini" />
          </div>
        ))}
      </div>
      <div className="text-sm font-bold text-c-text">{count} {count === 1 ? one : many}</div>
      <div className="text-[11px] text-c-dim">Click to view all</div>
    </button>
  );
}

export function OverflowGridModal({ kind, sims, onClose, onSelect }: {
  kind: 'children' | 'siblings';
  sims: Sim[];
  onClose: () => void;
  onSelect: (simId: string) => void;
}) {
  useEscapeToClose(onClose);
  const [, many] = KIND_NOUN[kind];
  return (
    <div className="fixed inset-0 bg-black/60 z-[500] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-c-card border border-c-border rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-c-border flex items-center justify-between">
          <h2 className="text-base font-bold text-c-text capitalize">{sims.length} {many}</h2>
          <button onClick={onClose} aria-label="Close" className={iconBtn(8)}><X size={16} weight="bold" /></button>
        </div>
        <div className="p-4 overflow-auto">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {sims.map((s) => {
              const gone = cardState(s) === 'dead';
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl border border-c-border bg-c-card hover:border-c-accent hover:bg-c-accent-soft transition-colors"
                >
                  <SimAvatar sim={s} />
                  <span className={`text-[12px] font-semibold text-center leading-tight truncate w-full ${gone ? 'text-c-dim' : 'text-c-text'}`}>
                    {`${s.firstName} ${s.lastName}`.trim() || '(unnamed)'}
                  </span>
                  <span className="text-[10px] text-c-faint">{LIFESTAGE_LABEL[s.lifestage] ?? s.lifestage}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
