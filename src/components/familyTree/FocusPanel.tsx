/**
 * Right-hand detail panel for the focused sim. Portrait + state badge, traits
 * and aspiration with the real in-game icons, and clickable kin lists (parents,
 * partners, siblings, children) that re-center the tree. Notes are editable and
 * persist to the sim. Cause of death lives here, not on the card face.
 */
import { useEffect, useMemo, useState } from 'react';
import { House, Tree, CaretDown, Camera } from '@phosphor-icons/react';
import type { Sim, SimRelType } from '../../types';
import { STOCK_TRAITS, traitIconUrlById } from '../../data/stockTraits';
import { STOCK_SKILLS } from '../../data/stockSkills';
import { STOCK_ASPIRATIONS, aspirationIconUrlById } from '../../data/stockAspirations';
import { earnedDegreesFromTraits } from '../../data/stockDegrees';
import { careerIconUrlById } from '../../data/careerIcons';
import { effectiveCareer, effectiveSkillIds } from '../../lib/effective';
import { resolveCrest } from '../../data/stockDynasties';
import { useSaveFile } from '../../store/useSaveFile';
import { Notes } from '../common/EntityText';
import { DynastyCrest } from '../Dynasty/DynastyCrest';
import { GhostIcon } from './icons';
import { SimAvatar, cardState, LIFESTAGE_LABEL } from './SimCard';
import { Pill } from '../common/Pill';

const BOND_LABEL: Partial<Record<SimRelType, string>> = {
  spouse: 'Spouse', engaged: 'Engaged', partner: 'Partner',
  ex_spouse: 'Ex-spouse', ex_fiance: 'Ex-fiancé(e)', ex_partner: 'Ex-partner',
};

/** Real in-game trait/aspiration icon by tuning id, with a graceful
 *  fall-through to nothing if the texture is missing. */
function PickIcon({ kind, id }: { kind: 'trait' | 'aspiration'; id: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = kind === 'trait' ? traitIconUrlById(id) : aspirationIconUrlById(id);
  if (failed || !url) return null;
  return <img src={url} alt="" className="w-4 h-4 object-contain shrink-0" onError={() => setFailed(true)} />;
}

/** Skill icon by tuning-id (named <id>.png in /skill-icons), graceful fallback. */
function SkillIcon({ skillId }: { skillId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="w-4 h-4 shrink-0" />;
  return <img src={`/skill-icons/${skillId.replace(/^0x/, '')}.png`} alt="" className="w-4 h-4 object-contain shrink-0" onError={() => setFailed(true)} />;
}

/** Skills — collapsed by default (sims can have dozens), count in the header.
 *  Built and planned together: a planned skill is an addition, not a
 *  replacement, and carries no level (a level is progress, which only the save
 *  has). Built ones lead, deepest first; planned ones follow. */
function SkillsSection({ sim }: { sim: Sim }) {
  const [open, setOpen] = useState(false);
  const skills = useMemo(() => {
    const levelById = new Map((sim.skills ?? []).map((s) => [s.skillId, s.level]));
    return [...effectiveSkillIds(sim)]
      .filter((id) => STOCK_SKILLS[id]) // catalogued, player-facing skills only (drop hidden)
      .map((id) => ({ skillId: id, level: levelById.get(id) ?? null }))
      .sort((a, b) =>
        (b.level ?? -1) - (a.level ?? -1) ||
        STOCK_SKILLS[a.skillId].localeCompare(STOCK_SKILLS[b.skillId]));
  }, [sim]);
  if (skills.length === 0) return null;
  return (
    <div className="py-3 border-b border-c-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0 text-left"
      >
        <span className="text-[10px] leading-none uppercase tracking-wider text-c-faint font-bold">Skills · {skills.length}</span>
        <CaretDown size={12} weight="bold" className={`text-c-faint transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-1 mt-2">
          {skills.map((s) => (
            <div key={s.skillId} className="flex items-center gap-1.5 text-[13px] text-c-text">
              <SkillIcon skillId={s.skillId} />
              <span className="flex-1 truncate">{STOCK_SKILLS[s.skillId] ?? `Skill ${s.skillId}`}</span>
              {s.level === null
                ? <span className="text-c-secondary text-[11px] shrink-0">Planned</span>
                : <span className="text-c-dim text-[11px] shrink-0">Lv {s.level}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KinList({ label, items, onSelect, chip }: {
  label: string;
  items: Sim[];
  onSelect: (simId: string) => void;
  chip?: (s: Sim) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="py-3 border-b border-c-border">
      <div className="text-[10px] leading-none uppercase tracking-wider text-c-faint font-bold mb-1.5">{label} · {items.length}</div>
      <div className="flex flex-col gap-0.5 -mx-1">
        {items.map((s) => {
          const gone = cardState(s) === 'dead';
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-md hover:bg-c-panel text-left"
            >
              <span className={`text-[13px] font-semibold truncate ${gone ? 'text-c-dim' : 'text-c-text'}`}>
                {`${s.firstName} ${s.lastName}`.trim() || '(unnamed)'}
                {gone && <span className="ml-1 text-[10px] font-normal text-c-faint">deceased</span>}
              </span>
              <Pill tone="neutral" tabular>
                {chip ? chip(s) : (LIFESTAGE_LABEL[s.lifestage] ?? s.lifestage)}
              </Pill>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface FocusPanelProps {
  sim: Sim;
  parents: Sim[];
  siblings: Sim[];
  children: Sim[];
  /** Every couple bond touching this sim, current bonds first. */
  partners: Array<{ sim: Sim; relType: SimRelType }>;
  /** Re-center the tree on a clicked relative. */
  onSelect: (simId: string) => void;
  /** Persist edited notes. */
  onSaveNotes: (notes: string) => void;
  /** Assigned portrait + an opener for the set-photo modal (absent in demo). */
  photoUrl?: string | null;
  onEditPhoto?: () => void;
  /** Jump to this sim's household in the household manager (when it has one). */
  onOpenHousehold?: () => void;
  /** Jump to the family tree focused on this sim. Omitted on the tree itself. */
  onOpenFamilyTree?: () => void;
}

export function FocusPanel({ sim, parents, siblings, children, partners, onSelect, onSaveNotes, photoUrl, onEditPhoto, onOpenHousehold, onOpenFamilyTree }: FocusPanelProps) {
  const state = cardState(sim);
  const dynasties = useSaveFile((s) => s.dynasties);
  const dynMembership = useMemo(() => {
    // A sim is in one dynasty in-game, but re-sync can leave a planner dynasty
    // still listing a sim the save has since put in a different one. Show the
    // save's (imported, sourceId) membership when there's a conflict — reality
    // wins — falling back to a planner-only one otherwise.
    let plannerMatch: { dynasty: typeof dynasties[string]; role: string | null } | null = null;
    for (const d of Object.values(dynasties)) {
      const mem = d.members.find((m) => m.simId === sim.id);
      if (!mem) continue;
      if (d.sourceId) return { dynasty: d, role: mem.role };
      plannerMatch ??= { dynasty: d, role: mem.role };
    }
    return plannerMatch;
  }, [dynasties, sim.id]);
  const traits = sim.traitIds
    .map((id) => ({ id, name: STOCK_TRAITS[id]?.name }))
    .filter((x): x is { id: string; name: string } => !!x.name);
  const aspiration = sim.aspirationId ? STOCK_ASPIRATIONS[sim.aspirationId] : null;
  // "{F0.Lady}{M0.Lord} of the Knits" → pick the gendered variant
  const aspirationLabel = aspiration?.name.replace(
    /\{F\d+\.([^}]+)\}\{M\d+\.([^}]+)\}/g,
    (_, f: string, m: string) => (sim.gender === 'male' ? m : f),
  );

  // notes: local draft, flush to the server on blur
  const [notes, setNotes] = useState(sim.notes);
  useEffect(() => { setNotes(sim.notes); }, [sim.id, sim.notes]);

  return (
    <aside className="w-72 shrink-0 rounded-2xl border border-c-border bg-white p-4 overflow-auto">
      <div className="text-center pb-3 border-b border-c-border">
        {onEditPhoto ? (
          <button onClick={onEditPhoto} aria-label="Set photo" className="group relative inline-block rounded-full">
            <SimAvatar sim={sim} size="panel" emphasized={state !== 'dead'} photoUrl={photoUrl} />
            <span className="absolute inset-0 rounded-full flex flex-col items-center justify-center gap-1 bg-black/75 text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={20} weight="duotone" />
              <span className="text-[11px] font-semibold">Set photo</span>
            </span>
          </button>
        ) : (
          <SimAvatar sim={sim} size="panel" emphasized={state !== 'dead'} photoUrl={photoUrl} />
        )}
        <div className="mt-2.5 font-extrabold text-[16px] text-c-text">
          {`${sim.firstName} ${sim.lastName}`.trim() || '(unnamed)'}
        </div>
        <div className="text-[12px] text-c-dim">
          {sim.gender === 'male' ? 'Male' : 'Female'} · {LIFESTAGE_LABEL[sim.lifestage] ?? sim.lifestage}
        </div>
        <div className="mt-1 text-[12px] font-semibold flex items-center justify-center gap-1">
          {state === 'living' && <span className="text-c-accent-hover">● Living</span>}
          {state === 'ghost' && (
            <span className="text-c-secondary flex items-center gap-1"><GhostIcon /> Ghost{sim.deathCause ? ` · ${sim.deathCause}` : ''}</span>
          )}
          {state === 'dead' && (
            <span className="text-c-dim">⚰ Deceased{sim.deathCause ? ` · ${sim.deathCause}` : ''}</span>
          )}
          {state === 'stub' && <span className="text-c-dim">Unknown — not in the save</span>}
        </div>
        {sim.recordStatus === 'culled' && (
          <div className="mt-1 text-[11px] text-c-faint">Preserved — no longer in the save</div>
        )}
        {(onOpenHousehold || onOpenFamilyTree) && (
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
            {onOpenHousehold && (
              <button
                onClick={onOpenHousehold}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-c-dim border border-c-border rounded-full px-3 py-1 hover:text-c-text hover:bg-c-panel transition-colors"
              >
                <House size={14} weight="bold" className="text-c-faint" /> Household
              </button>
            )}
            {onOpenFamilyTree && (
              <button
                onClick={onOpenFamilyTree}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-c-dim border border-c-border rounded-full px-3 py-1 hover:text-c-text hover:bg-c-panel transition-colors"
              >
                <Tree size={14} weight="bold" className="text-c-faint" /> Family tree
              </button>
            )}
          </div>
        )}
      </div>

      {dynMembership && (() => {
        const crest = resolveCrest(dynMembership.dynasty.crestBgHash, dynMembership.dynasty.crestFgHash);
        const role = dynMembership.role?.startsWith('Black Sheep') ? 'Black Sheep' : dynMembership.role;
        return (
          <div className="py-3 border-b border-c-border">
            <div className="text-[10px] leading-none uppercase tracking-wider text-c-faint font-bold mb-1">Dynasty</div>
            <div className="text-[13px] font-semibold text-c-text flex items-center gap-1.5 flex-wrap">
              <DynastyCrest bg={crest.bg?.asset} fg={crest.fg?.asset} size={20} />
              {dynMembership.dynasty.name}
              {role && <span className="text-c-dim font-normal">· {role}</span>}
            </div>
          </div>
        );
      })()}

      <div className="py-3 border-b border-c-border">
        <div className="text-[10px] leading-none uppercase tracking-wider text-c-faint font-bold mb-1.5">Traits</div>
        {traits.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {traits.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 text-[11px] bg-c-accent-soft border border-c-accent-border text-c-green rounded-full pl-1 pr-2 py-0.5">
                <PickIcon kind="trait" id={t.id} />{t.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[13px] text-c-dim">—</div>
        )}
      </div>

      <div className="py-3 border-b border-c-border">
        <div className="text-[10px] leading-none uppercase tracking-wider text-c-faint font-bold mb-1">Aspiration</div>
        <div className="text-[13px] font-semibold text-c-text flex items-center gap-1.5">
          {aspirationLabel ? <><PickIcon kind="aspiration" id={sim.aspirationId} />{aspirationLabel}</> : '—'}
        </div>
      </div>

      {(() => {
        // The career in the plan — the one you authored if you did, else the
        // save's. A planned career has no level; a level is progress, and
        // progress only exists in the save.
        const career = effectiveCareer(sim);
        if (!career) return null;
        return (
          <div className="py-3 border-b border-c-border">
            <div className="text-[10px] leading-none uppercase tracking-wider text-c-faint font-bold mb-1">Career</div>
            <div className="text-[13px] font-semibold text-c-text flex items-center gap-1.5 flex-wrap">
              <img src={careerIconUrlById(career.uid) ?? '/career-icons/career-icon.png'} alt="" className="w-4 h-4 object-contain shrink-0" />
              {career.name}
              {career.level !== null && (
                <span className="text-c-dim font-normal">
                  {career.kind === 'npc' ? '· NPC' : `· Level ${career.level}`}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      <SkillsSection sim={sim} />

      {(() => {
        const degrees = earnedDegreesFromTraits(sim.traitIds);
        const enrolled = sim.enrolledDegree;
        if (degrees.length === 0 && !enrolled) return null;
        return (
          <div className="py-3 border-b border-c-border">
            <div className="text-[10px] leading-none uppercase tracking-wider text-c-faint font-bold mb-1.5">Education</div>
            <div className="flex flex-col gap-1.5">
              {enrolled && (
                <div className="flex items-center gap-1.5 text-[13px] text-c-text flex-wrap">
                  <img src={`/career-icons/${enrolled.school.toLowerCase()}-icon.png`} alt="" className="w-4 h-4 object-contain shrink-0" />
                  <span className="font-semibold">Studying {enrolled.subject}</span>
                  <span className="text-c-dim">· {enrolled.school}</span>
                </div>
              )}
              {degrees.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[13px] text-c-text flex-wrap">
                  <img src="/career-icons/graduated-icon.png" alt="" className="w-4 h-4 object-contain shrink-0" />
                  <span className="font-semibold">{d.subject}{d.honors && ' (with Honors)'}</span>
                  <span className="text-c-dim">· {d.school}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <KinList label="Parents" items={parents} onSelect={onSelect} />
      <KinList label="Partners" items={partners.map((p) => p.sim)} onSelect={onSelect}
        chip={(s) => {
          const p = partners.find((x) => x.sim.id === s.id);
          return p ? (BOND_LABEL[p.relType] ?? p.relType) : '';
        }} />
      <KinList label="Siblings" items={siblings} onSelect={onSelect} />
      <KinList label="Children" items={children} onSelect={onSelect} />

      <div className="pt-3">
        <Notes
          value={notes}
          onChange={setNotes}
          onBlur={() => { if (notes !== sim.notes) onSaveNotes(notes); }}
        />
      </div>
    </aside>
  );
}
