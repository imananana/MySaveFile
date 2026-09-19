/**
 * The v5 family-tree card: initial-avatar, first/last name, lifestage chip,
 * ghost/tomb badge, focus ring + top tab. Four states straight from the
 * design: living (white), ghost (white + line icon — playable, still on the
 * roster), deceased (solid warm grey + tomb), Unknown stub (dashed + add).
 */
import type { Sim, SimGender, SimLifestage } from '../../types';
import type { FocusRelation } from '../../lib/familyTree/layout';
import { GhostIcon, TombIcon, PersonIcon } from './icons';

export type CardState = 'living' | 'ghost' | 'dead' | 'stub';

/** ghost = deceased but still in a household (playable); dead = truly gone. */
export function cardState(sim: Sim): CardState {
  if (sim.recordStatus === 'stub') return 'stub';
  if (sim.isGhost) return sim.recordStatus === 'active' ? 'ghost' : 'dead';
  return 'living';
}

export const LIFESTAGE_LABEL: Record<SimLifestage, string> = {
  newborn: 'Newborn', infant: 'Infant', toddler: 'Toddler', child: 'Child', teen: 'Teen',
  youngAdult: 'Young Adult', adult: 'Adult', elder: 'Elder', pet: 'Pet',
};

export function initials(first: string, last: string): string {
  return `${first.trim()[0] ?? ''}${last.trim()[0] ?? ''}`.toUpperCase() || '?';
}

/** Gendered kinship label for the card chip (relative to the focused sim). */
export function relationLabel(relation: FocusRelation, gender: SimGender): string {
  const m = gender === 'male';
  switch (relation) {
    case 'parent':           return m ? 'Father' : 'Mother';
    case 'step-parent':      return m ? 'Stepfather' : 'Stepmother';
    case 'parents-partner':  return "Parent's partner";
    case 'parents-ex':       return "Parent's ex";
    case 'siblings-parent':  return "Sibling's parent";
    case 'sibling':          return m ? 'Brother' : 'Sister';
    case 'half-sibling':     return m ? 'Half-brother' : 'Half-sister';
    case 'spouse':           return m ? 'Husband' : 'Wife';
    case 'engaged':          return m ? 'Fiancé' : 'Fiancée';
    case 'partner':          return 'Partner';
    case 'ex_spouse':        return m ? 'Ex-husband' : 'Ex-wife';
    case 'ex_fiance':        return m ? 'Ex-fiancé' : 'Ex-fiancée';
    case 'ex_partner':       return 'Ex-partner';
    case 'child':            return m ? 'Son' : 'Daughter';
    case 'step-child':       return m ? 'Stepson' : 'Stepdaughter';
    case 'grandparent':      return m ? 'Grandfather' : 'Grandmother';
    case 'great-grandparent':return m ? 'Great-grandfather' : 'Great-grandmother';
    case 'aunt-uncle':       return m ? 'Uncle' : 'Aunt';
    case 'grand-aunt-uncle': return m ? 'Great-uncle' : 'Great-aunt';
    case 'grandchild':       return m ? 'Grandson' : 'Granddaughter';
    case 'great-grandchild': return m ? 'Great-grandson' : 'Great-granddaughter';
    case 'child-in-law':     return m ? 'Son-in-law' : 'Daughter-in-law';
  }
}

export function SimAvatar({ sim, size = 'card', emphasized = false, photoUrl }: {
  sim: Sim;
  size?: 'card' | 'panel' | 'mini';
  emphasized?: boolean;   // focus card / panel header — solid gender fill, white text
  photoUrl?: string | null;   // assigned portrait; falls back to the monogram
}) {
  const dead = cardState(sim) === 'dead';
  const male = sim.gender === 'male';
  const bg = dead ? '#e0dacd' : emphasized ? (male ? '#16a34a' : '#7c5cbf') : (male ? '#ecfdf3' : '#f3eefb');
  const color = dead ? '#8a8170' : emphasized ? '#fff' : (male ? '#15803d' : '#7c5cbf');
  const cls = size === 'panel'
    ? 'w-24 h-24 text-2xl'
    : size === 'mini'
      ? 'w-11 h-11 text-sm'
      : 'w-16 h-16 text-[17px]';
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${sim.firstName} ${sim.lastName}`.trim()}
        className={`${cls} mx-auto rounded-full object-cover ${dead ? 'grayscale opacity-90' : ''}`}
        style={{ boxShadow: `0 0 0 2px ${male ? '#16a34a' : '#7c5cbf'}` }}
      />
    );
  }
  return (
    <div className={`${cls} mx-auto rounded-full grid place-items-center font-extrabold`} style={{ background: bg, color }}>
      {initials(sim.firstName, sim.lastName)}
    </div>
  );
}

interface SimCardProps {
  sim: Sim;
  isFocus: boolean;
  /** Kinship to the focused sim — replaces the lifestage chip when present. */
  relation?: FocusRelation;
  onClick: () => void;
  photoUrl?: string | null;
}

export function SimCard({ sim, isFocus, relation, onClick, photoUrl }: SimCardProps) {
  const state = cardState(sim);

  if (state === 'stub') {
    return (
      <button
        onClick={onClick}
        title="Add ancestor"
        className="relative w-full h-full rounded-2xl border-2 border-dashed border-c-faint bg-white/50 hover:border-c-accent hover:bg-c-accent-soft grid place-items-center text-center p-3"
      >
        <div>
          <PersonIcon />
          <div className="mt-1.5 text-[13px] font-semibold text-c-dim">Unknown</div>
          <div className="text-[10px] font-semibold text-c-accent">+ add</div>
        </div>
      </button>
    );
  }

  const dead = state === 'dead';
  const shell = isFocus
    ? 'border-2 border-c-accent bg-white'
    : dead
      ? 'bg-[#ede7db] border border-[#d8d0c1]'
      : 'bg-white border border-c-border shadow';

  return (
    <div className="relative w-full h-full">
      {isFocus && (
        <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-[38px] h-2 rounded-md bg-c-accent z-10" />
      )}
      <button
        onClick={onClick}
        className={`relative w-full h-full ${shell} rounded-2xl p-3 text-center transition-all duration-100 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_-12px_rgba(0,0,0,0.2)]`}
        style={isFocus ? { boxShadow: '0 0 0 4px rgba(22,163,74,.12), 0 16px 34px -14px rgba(22,163,74,.5)' } : undefined}
      >
        {state === 'ghost' && <span className="absolute top-2 right-2"><GhostIcon /></span>}
        {dead && <span className="absolute top-2 right-2"><TombIcon /></span>}
        <SimAvatar sim={sim} emphasized={isFocus} photoUrl={photoUrl} />
        <div className={`mt-2 text-[15px] font-extrabold leading-tight truncate ${dead ? 'text-c-dim' : 'text-c-text'}`}>
          {sim.firstName || '(unnamed)'}
        </div>
        <div className={`text-[13px] font-semibold leading-tight truncate ${dead ? 'text-c-faint' : 'text-c-muted'}`}>
          {sim.lastName}
        </div>
        <div className="inline-block mt-1.5 text-[10px] leading-none text-c-dim bg-c-panel rounded-full px-2.5 py-1">
          {relation ? relationLabel(relation, sim.gender) : (LIFESTAGE_LABEL[sim.lifestage] ?? sim.lifestage)}
        </div>
      </button>
    </div>
  );
}
