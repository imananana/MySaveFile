import { useState, useMemo, useEffect, useRef } from 'react';
import { useDismissOnOutside } from '../../hooks/useDismissOnOutside';
import { useNavigate } from 'react-router-dom';
import { Crown, Star, ShieldCheck, MagnifyingGlass, X, Plus, Trash, PencilSimple, Shuffle, UsersThree, CaretDown, CheckSquare, Square, Handshake } from '@phosphor-icons/react';
import { useSaveFile } from '../../store/useSaveFile';
import { api } from '../../lib/api';
import { useConfirm } from '../common/ConfirmDialog';
import { PackNotOwnedBanner } from '../common/PackNotOwnedBanner';
import { MasterDetail } from '../common/MasterDetail';
import { DynastyCrest } from '../Dynasty/DynastyCrest';
import { SimAvatar } from '../familyTree/SimCard';
import {
  resolveCrest, resolveDynastyValues, STOCK_DYNASTY_PERKS, STOCK_DYNASTY_CRESTS,
  STOCK_DYNASTY_IDEALS, STOCK_DYNASTY_SKILLS,
} from '../../data/stockDynasties';
import { prestigeLevel, unityRank, MAX_PRESTIGE_LEVEL } from '../../data/dynastyProgression';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import { Notes, MirroredDescription } from '../common/EntityText';
import { OverviewLanding, HeroSplit, StatTile } from '../common/OverviewTiles';
import type { Dynasty, DynastyMember, Sim } from '../../types';
import { useEscapeToClose } from '../common/useEscapeToClose';
import { btn } from '../common/btn';
import { Tooltip } from '../common/Tooltip';
import { PlannerPill } from '../common/PlannerPill';

// Crest catalog derived from the hash map: the creator picks (shape, color, symbol)
// and we look the composed pieces back up to the instance hashes we persist.
const CREST_BG = Object.entries(STOCK_DYNASTY_CRESTS)
  .filter(([, p]) => p.kind === 'bg')
  .map(([hash, p]) => ({ hash, style: p.style ?? 0, color: p.color ?? '', asset: p.asset }));
const CREST_FG = Object.entries(STOCK_DYNASTY_CRESTS)
  .filter(([, p]) => p.kind === 'fg')
  .map(([hash, p]) => ({ hash, symbol: p.symbol ?? '', asset: p.asset }));
const CREST_STYLES = [...new Set(CREST_BG.map((b) => b.style))].sort((a, b) => a - b);
const CREST_COLORS = ['blue', 'crimson', 'green', 'orange', 'red', 'tan'];
const bgHashFor = (style: number, color: string) => CREST_BG.find((b) => b.style === style && b.color === color)?.hash ?? null;
const fgHashFor = (symbol: string) => CREST_FG.find((f) => f.symbol === symbol)?.hash ?? null;
const bgPieceOf = (hash: string | null) => (hash ? CREST_BG.find((b) => b.hash === hash.toLowerCase().padStart(16, '0')) : undefined);
const fgPieceOf = (hash: string | null) => (hash ? CREST_FG.find((f) => f.hash === hash.toLowerCase().padStart(16, '0')) : undefined);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
function randomCrest(): { bg: string; fg: string } {
  return { bg: pick(CREST_BG).hash, fg: pick(CREST_FG).hash };
}

const UNITY_TONE: Record<string, string> = {
  Crisis: 'text-c-warn',
  Neutral: 'text-c-muted',
  Stability: 'text-c-accent',
};

type PortraitMap = Map<string, string>; // simId → portrait URL

/** 10-star prestige rating, filled to the dynasty's level. */
function StarRating({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: MAX_PRESTIGE_LEVEL }, (_, i) => (
        <Star key={i} size={18} weight={i < level ? 'fill' : 'regular'} className={i < level ? 'text-c-accent' : 'text-c-faint'} />
      ))}
    </div>
  );
}

/** A member tile: avatar (portrait or gender-tinted monogram fallback) + name + role. */
// Display order for the flat member list.
function roleRank(role: string | null): number {
  if (role === 'Head') return 0;
  if (role === 'Heir') return 1;
  if (role === 'Founder') return 2;
  if (role?.startsWith('Black Sheep')) return 3;
  return 4; // Member / unknown
}
function roleTone(role: string | null): string {
  if (role === 'Head') return 'bg-c-accent-soft text-c-green';
  if (role === 'Heir') return 'bg-c-secondary-soft text-c-secondary';
  if (role?.startsWith('Black Sheep')) return 'bg-c-warn-bg text-c-warn';
  return 'bg-c-panel text-c-dim';
}

/** One member: avatar + name + role designation, in a single row. Clicking the
 *  avatar/name opens that sim's detail. */
function MemberRow({ sim, role, portrait, onClick }: { sim: Sim; role: string | null; portrait: string | null; onClick?: () => void }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Tooltip text="Open sim">
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-3 min-w-0 flex-1 bg-transparent border-none p-0 cursor-pointer text-left group" aria-label="Open sim">
          <div className="shrink-0">
            <SimAvatar sim={sim} size="mini" emphasized={role === 'Head'} photoUrl={portrait} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-c-text truncate group-hover:text-c-green transition-colors">{sim.firstName} {sim.lastName}</div>
          </div>
        </button>
      </Tooltip>
      {role && (
        <span className={`text-2xs font-bold uppercase tracking-label px-2.5 py-1 rounded-full shrink-0 ${roleTone(role)}`}>
          {role.startsWith('Black Sheep') ? 'Black Sheep' : role}
        </span>
      )}
    </div>
  );
}

// Icon files are the catalog name lowercased with non-alphanumerics stripped
// ("Nature Loving" → natureloving). A handful of skill icons use a different
// internal asset name, so map those explicitly.
const iconKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const SKILL_ICON_OVERRIDE: Record<string, string> = {
  'Cross-Stitch': 'crossstitching', 'DJ Mixing': 'dj', 'Gourmet Cooking': 'cookinggourmet',
  'Herbalism': 'herbalismskill', 'Horse Riding': 'equestrian', 'Medium': 'mediumskill',
  'Pipe Organ': 'organ', 'Snowboarding': 'snowboard', 'Swordsmanship': 'swordsmanshipskill',
  'Thanatology': 'deathhistorian', 'Vampire Lore': 'vampireresearch',
};
const idealIcon = (name: string) => `/ideal-icons/${iconKey(name)}.png`;
const skillIcon = (name: string) => `/skill-icons/${SKILL_ICON_OVERRIDE[name] ?? iconKey(name)}.png`;

function ValueChips({ items, tone, onRemove, emptyText = 'None' }: {
  items: { id?: string; label: string; icon: string }[];
  tone: string;
  onRemove?: (id: string) => void;
  emptyText?: string;
}) {
  if (!items.length) return <span className="text-sm text-c-faint">{emptyText}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ id, label, icon }) => (
        <span key={label} className={`group inline-flex items-center gap-1.5 text-sm font-semibold pl-3 pr-3 py-2 rounded-lg ${tone}`}>
          <img src={icon} alt="" className="w-4 h-4 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          {label}
          {onRemove && id && (
            <button type="button" onClick={() => onRemove(id)} aria-label={`Remove ${label}`} className="ml-0.5 -mr-1 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-transparent border-none cursor-pointer p-0.5 flex items-center hover:text-c-red transition-opacity">
              <X size={12} weight="bold" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

// A related dynasty (ally or rival): its crest + name. Resolved-but-not-imported
// dynasties fall back to a neutral shield + "Unknown dynasty" so the count never
// silently drops a relationship.
function DynastyRefChips({ items, tone, emptyText, onRemove }: {
  items: { key: string; name: string; crestBgHash: string | null; crestFgHash: string | null }[];
  tone: string;
  emptyText: string;
  onRemove?: (key: string) => void;
}) {
  if (!items.length) return <span className="text-sm text-c-faint">{emptyText}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ key, name, crestBgHash, crestFgHash }) => {
        const crest = resolveCrest(crestBgHash, crestFgHash);
        return (
          <span key={key} className={`group inline-flex items-center gap-2 text-sm font-semibold pl-1.5 pr-3 py-1.5 rounded-lg ${tone}`}>
            <DynastyCrest bg={crest.bg?.asset} fg={crest.fg?.asset} size={24} />
            {name}
            {onRemove && (
              <button type="button" onClick={() => onRemove(key)} aria-label={`Remove ${name}`} className="ml-0.5 -mr-1 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-transparent border-none cursor-pointer p-0.5 flex items-center hover:text-c-red transition-opacity">
                <X size={12} weight="bold" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

// Picker for adding allies/rivals — any other dynasty (imported included). Shows a
// badge when a candidate is currently in the opposite relationship (picking moves it).
function DynastyRelationPickerModal({ title, candidates, selectedIds, conflictIds, conflictLabel, onApply, onClose }: {
  title: string;
  candidates: Dynasty[];
  selectedIds: string[];
  conflictIds: Set<string>;
  conflictLabel: string;
  onApply: (ids: string[]) => void;
  onClose: () => void;
}) {
  useEscapeToClose(onClose);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedIds));
  const q = search.toLowerCase();
  const shown = useMemo(
    () => [...candidates].sort((a, b) => (a.name || 'Unnamed').localeCompare(b.name || 'Unnamed')).filter((d) => !q || (d.name || '').toLowerCase().includes(q)),
    [candidates, q],
  );
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[82vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input placeholder="Search dynasties…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {shown.map((d) => {
            const crest = resolveCrest(d.crestBgHash, d.crestFgHash);
            const on = picked.has(d.id);
            const conflict = conflictIds.has(d.id);
            return (
              <button key={d.id} type="button" onClick={() => toggle(d.id)} className="flex w-full px-4 py-2 bg-transparent border-none border-b border-c-panel cursor-pointer text-left items-center gap-3 hover:bg-c-accent-soft transition-colors">
                {on ? <CheckSquare size={18} weight="fill" className="text-c-accent shrink-0" /> : <Square size={18} weight="regular" className="text-c-faint shrink-0" />}
                <DynastyCrest bg={crest.bg?.asset} fg={crest.fg?.asset} size={28} />
                <span className="text-sm font-medium text-c-text truncate flex-1">{d.name || 'Unnamed Dynasty'}</span>
                {conflict && <span className="text-2xs font-semibold uppercase tracking-label text-c-warn shrink-0">{conflictLabel}</span>}
              </button>
            );
          })}
          {shown.length === 0 && <div className="px-4 py-10 text-center text-xs text-c-faint">No other dynasties.</div>}
        </div>
        <div className="px-5 py-4 border-t border-c-border flex justify-end gap-2">
          <button onClick={onClose} className={btn('ghost')}>Cancel</button>
          <button onClick={() => onApply([...picked])} className={btn('primary')}>Done</button>
        </div>
      </div>
    </div>
  );
}

const SECTION_LABEL = 'text-xs uppercase tracking-label text-c-faint font-bold';

// Crest creator — symbol (foreground) + shape & color (background), composed live.
// Shapes have no reliable names, so they're picked visually (swatch in the chosen
// color); symbols and colors carry hover labels.
function CrestCreatorModal({ bgHash, fgHash, onApply, onClose }: {
  bgHash: string | null;
  fgHash: string | null;
  onApply: (bg: string, fg: string) => void;
  onClose: () => void;
}) {
  useEscapeToClose(onClose);
  const init = bgPieceOf(bgHash);
  const [style, setStyle] = useState<number>(init?.style ?? CREST_STYLES[0]);
  const [color, setColor] = useState<string>(init?.color ?? CREST_COLORS[0]);
  const [symbol, setSymbol] = useState<string>(fgPieceOf(fgHash)?.symbol ?? CREST_FG[0].symbol);

  const curBg = bgHashFor(style, color);
  const curFg = fgHashFor(symbol);
  const previewBg = curBg ? STOCK_DYNASTY_CRESTS[curBg]?.asset : null;
  const previewFg = curFg ? STOCK_DYNASTY_CRESTS[curFg]?.asset : null;

  const randomize = () => {
    setStyle(pick(CREST_STYLES));
    setColor(pick(CREST_COLORS));
    setSymbol(pick(CREST_FG).symbol);
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Design crest</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 flex flex-col gap-5 bg-c-base">
          {/* Live preview + randomize */}
          <div className="flex items-center gap-4">
            <DynastyCrest bg={previewBg} fg={previewFg} size={88} />
            <button type="button" onClick={randomize} className={btn('secondary')}>
              <Shuffle size={15} weight="bold" /> Randomize
            </button>
          </div>

          {/* Color */}
          <div>
            <div className="text-2xs font-bold uppercase tracking-label text-c-faint mb-2">Color</div>
            <div className="flex gap-2.5">
              {CREST_COLORS.map((c) => (
                <Tooltip text={c} key={c}>
                  <button
                 
                    type="button"
                    onClick={() => setColor(c)}
                 
                    className={`w-10 h-10 rounded-full overflow-hidden cursor-pointer transition-all border-2 ${color === c ? 'border-c-accent' : 'border-c-border hover:border-c-accent'}`} aria-label={c}>
                    {/* zoom into the shield's center so we read just the color, not the shape */}
                    <img src={`/dynasty-crests/crest_bg_style${style}_${c}.png`} alt={c} className="w-full h-full object-cover scale-[2.4]" />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Shape */}
          <div>
            <div className="text-2xs font-bold uppercase tracking-label text-c-faint mb-2">Shape</div>
            <div className="grid grid-cols-10 gap-1.5">
              {CREST_STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`aspect-square rounded-lg border p-0.5 cursor-pointer transition-colors ${style === s ? 'border-c-accent bg-c-accent-soft' : 'border-c-border bg-c-base hover:border-c-accent'}`}
                >
                  <img src={`/dynasty-crests/crest_bg_style${s}_${color}.png`} alt="" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>

          {/* Symbol */}
          <div>
            <div className="text-2xs font-bold uppercase tracking-label text-c-faint mb-2">Symbol</div>
            <div className="grid grid-cols-7 gap-1.5">
              {CREST_FG.map((f) => (
                <Tooltip text={f.symbol} key={f.symbol}>
                  <button
                 
                    type="button"
                    onClick={() => setSymbol(f.symbol)}
                 
                    className={`aspect-square rounded-lg border p-0.5 flex items-center justify-center cursor-pointer transition-colors ${symbol === f.symbol ? 'border-c-accent bg-c-accent-soft' : 'border-c-border bg-c-base hover:border-c-accent'}`} aria-label={f.symbol}>
                    <img src={`/dynasty-crests/${f.asset}.png`} alt={f.symbol} className="w-full h-full object-contain" />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-c-border flex justify-end gap-2">
          <button onClick={onClose} className={btn('ghost')}>Cancel</button>
          <button
            onClick={() => { if (curBg && curFg) onApply(curBg, curFg); }}
            disabled={!curBg || !curFg}
            className={btn('primary')}
          >
            Apply crest
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_OPTIONS = ['Head', 'Heir', 'Founder', 'Black Sheep', 'Member'];

// Always-visible role chip that opens a small picker (Head is mandatory, so this
// is never hidden behind hover). Head/Heir/Founder are singletons — the caller
// auto-demotes the prior holder.
function RoleChipMenu({ role, onPick }: { role: string | null; onPick: (role: string) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuRef, () => setOpen(false), open);
  const current = role || 'Member';
  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-label px-2.5 py-1 rounded-full cursor-pointer border-none transition-colors ${roleTone(role)}`}
      >
        {current.startsWith('Black Sheep') ? 'Black Sheep' : current}
        <CaretDown size={10} weight="bold" />
      </button>
      {open && (
        <>
          <div className="absolute right-0 top-full mt-1 z-20 bg-c-card border border-c-border rounded-lg shadow-xl py-1 min-w-[150px]">
            {ROLE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { onPick(r); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm cursor-pointer bg-transparent border-none hover:bg-c-panel transition-colors ${current === r ? 'text-c-text font-semibold' : 'text-c-dim'}`}
              >
                {r}
                {current === r && <span className="w-1.5 h-1.5 rounded-full bg-c-accent shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// One editable roster row: avatar + name (→ sim) + role chip + hover-reveal remove.
function EditableMemberRow({ sim, role, portrait, onPickRole, onRemove, onOpenSim }: {
  sim: Sim; role: string | null; portrait: string | null;
  onPickRole: (role: string) => void; onRemove: () => void; onOpenSim: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 py-2">
      <Tooltip text="Open sim">
        <button type="button" onClick={onOpenSim} className="flex items-center gap-3 min-w-0 flex-1 bg-transparent border-none p-0 cursor-pointer text-left" aria-label="Open sim">
          <div className="shrink-0"><SimAvatar sim={sim} size="mini" emphasized={role === 'Head'} photoUrl={portrait} /></div>
          <div className="text-[15px] font-semibold text-c-text truncate hover:text-c-green transition-colors">{sim.firstName} {sim.lastName}</div>
        </button>
      </Tooltip>
      <RoleChipMenu role={role} onPick={onPickRole} />
      <button type="button" onClick={onRemove} aria-label="Remove member" className="shrink-0 text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer p-1 flex items-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

// Multi-select sim picker for adding members. Sims already in ANY dynasty are
// shown disabled (one sim → one dynasty), labeled with where they belong.
function DynastyMemberPickerModal({ existingIds, simDynastyName, onAdd, onClose }: {
  existingIds: Set<string>;              // sims already in THIS dynasty (hidden)
  simDynastyName: Map<string, string>;   // simId → dynasty name (any dynasty)
  onAdd: (simIds: string[]) => void;
  onClose: () => void;
}) {
  useEscapeToClose(onClose);
  const sims = useSaveFile((s) => s.sims);
  const households = useSaveFile((s) => s.households);
  const lots = useSaveFile((s) => s.lots);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Grouped by household; each group carries its world (household → assigned lot
  // → world) so search matches on sim name, household, OR world.
  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const map = new Map<string, { world: string; sims: Sim[] }>();
    for (const sim of Object.values(sims)) {
      if ((sim.recordStatus ?? 'active') !== 'active') continue;  // roster sims only
      if (existingIds.has(sim.id)) continue;                      // already in this dynasty
      const hh = sim.householdId ? households[sim.householdId] : undefined;
      const lot = hh?.assignedLotKey ? lots[hh.assignedLotKey] : undefined;
      const world = lot?.worldName ?? '';
      const hhName = hh?.name ?? 'Unknown';
      const full = `${sim.firstName} ${sim.lastName}`.trim().toLowerCase();
      if (q && !full.includes(q) && !world.toLowerCase().includes(q) && !hhName.toLowerCase().includes(q)) continue;
      const entry = map.get(hhName) ?? { world, sims: [] };
      entry.sims.push(sim);
      map.set(hhName, entry);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, world: v.world, sims: v.sims.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sims, households, lots, search, existingIds]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">Add members</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input placeholder="Search by sim, household, or world…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {grouped.map((g) => (
            <div key={g.name}>
              <div className="px-4 pt-3 pb-1 text-2xs text-c-faint tracking-label uppercase font-semibold">
                {g.name}{g.world ? <span className="text-c-faint normal-case tracking-normal font-medium"> · {g.world}</span> : ''}
              </div>
              {g.sims.map((sim) => {
                const inDynasty = simDynastyName.get(sim.id);
                const checked = picked.has(sim.id);
                return (
                  <button
                    key={sim.id}
                    type="button"
                    disabled={!!inDynasty}
                    onClick={() => toggle(sim.id)}
                    className={`flex w-full px-4 py-2 bg-transparent border-none border-b border-c-panel text-left justify-between items-center gap-3 transition-colors ${inDynasty ? 'opacity-45 cursor-default' : 'cursor-pointer hover:bg-c-accent-soft'}`}
                  >
                    <span className="inline-flex items-center gap-2.5 min-w-0">
                      {inDynasty
                        ? <Square size={18} weight="regular" className="text-c-faint shrink-0" />
                        : checked
                          ? <CheckSquare size={18} weight="fill" className="text-c-accent shrink-0" />
                          : <Square size={18} weight="regular" className="text-c-faint shrink-0" />}
                      <span className="text-sm font-medium text-c-text truncate">{sim.firstName} {sim.lastName}</span>
                    </span>
                    {inDynasty && <span className="text-2xs text-c-faint shrink-0">in {inDynasty}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="px-4 py-10 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-c-secondary-soft text-c-secondary mb-2"><MagnifyingGlass size={18} weight="duotone" /></div>
              <p className="text-xs font-semibold text-c-text">No sims to add</p>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-c-border flex justify-end gap-2">
          <button onClick={onClose} className={btn('ghost')}>Cancel</button>
          <button
            onClick={() => onAdd([...picked])}
            disabled={picked.size === 0}
            className={btn('primary')}
          >
            Add{picked.size ? ` ${picked.size}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// Multi-select toggle grid for a dynasty's ideals or skills, drawn from the
// dynasty value catalog (already the adult-only in-game set).
function DynastyValuePickerModal({ title, catalog, iconFor, selectedIds, max, onApply, onClose }: {
  title: string;
  catalog: Record<string, string>;   // value id (hex) → display name
  iconFor: (name: string) => string;
  selectedIds: string[];
  max?: number;
  onApply: (ids: string[]) => void;
  onClose: () => void;
}) {
  useEscapeToClose(onClose);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedIds));
  const entries = useMemo(
    () => Object.entries(catalog).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [catalog],
  );
  const q = search.toLowerCase();
  const shown = entries.filter((e) => !q || e.name.toLowerCase().includes(q));
  const atMax = max != null && picked.size >= max;
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else { if (max != null && n.size >= max) return p; n.add(id); }
    return n;
  });

  return (
    <div className="fixed inset-0 bg-black/75 z-[300] flex items-center justify-center p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-c-card border border-c-border shadow-2xl rounded-xl w-full max-w-[520px] max-h-[82vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-c-border flex justify-between items-center">
          <h3 className="text-base font-bold text-c-text tracking-headline m-0">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-c-dim hover:text-c-text hover:bg-c-panel rounded-lg cursor-pointer w-8 h-8 flex items-center justify-center transition-colors"><X size={16} weight="bold" /></button>
        </div>
        <div className="px-4 py-3 border-b border-c-border">
          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="w-full bg-c-base border border-c-border rounded-md pl-9 pr-3 py-[7px] text-c-text text-xs outline-none focus:border-c-accent" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-3 grid grid-cols-2 gap-1.5">
          {shown.map(({ id, name }) => {
            const on = picked.has(id);
            const disabled = !on && atMax;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors ${on ? 'border-c-accent bg-c-accent-soft cursor-pointer' : disabled ? 'border-c-border bg-c-base opacity-40 cursor-default' : 'border-c-border bg-c-base hover:border-c-accent cursor-pointer'}`}
              >
                <img src={iconFor(name)} alt="" className="w-5 h-5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className="text-sm font-medium text-c-text truncate flex-1">{name}</span>
                {on ? <CheckSquare size={16} weight="fill" className="text-c-accent shrink-0" /> : <Square size={16} weight="regular" className="text-c-faint shrink-0" />}
              </button>
            );
          })}
          {shown.length === 0 && <div className="col-span-2 px-4 py-10 text-center text-xs text-c-faint">No matches.</div>}
        </div>
        <div className="px-5 py-4 border-t border-c-border flex justify-between items-center">
          <span className="text-xs text-c-faint">{picked.size}{max != null ? ` / ${max}` : ''} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btn('ghost')}>Cancel</button>
            <button onClick={() => onApply([...picked])} className={btn('primary')}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DynastyListItem({ dynasty, active, onClick }: { dynasty: Dynasty; active: boolean; onClick: () => void }) {
  const crest = resolveCrest(dynasty.crestBgHash, dynasty.crestFgHash);
  return (
    <button
      onClick={onClick}
      data-listnav-id={dynasty.id}
      className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-left border-b border-c-panel border-l-[3px] transition-colors ${
        active ? 'border-l-c-accent bg-c-accent-soft' : 'border-l-transparent hover:bg-c-panel'
      }`}
    >
      <DynastyCrest bg={crest.bg?.asset} fg={crest.fg?.asset} size={40} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-c-text truncate tracking-headline">{dynasty.name || 'Unnamed Dynasty'}</div>
      </div>
      {!dynasty.sourceId && <PlannerPill />}
    </button>
  );
}

function DynastyDetail({ dynasty, sims, portraits, bySourceId, byId, allDynasties, simDynastyName, editable, onRename, onSetCrest, onMembersChange, onValuesChange, onSetRelations, onDelete, onSaveNotes }: {
  dynasty: Dynasty;
  sims: Record<string, Sim>;
  portraits: PortraitMap;
  bySourceId: Map<string, Dynasty>;   // game id (hex) → dynasty, for resolving imported allies/rivals
  byId: Map<string, Dynasty>;         // planner id → dynasty, for resolving authored allies/rivals
  allDynasties: Dynasty[];            // every dynasty, for the relation picker
  simDynastyName: Map<string, string>; // simId → dynasty name, to gate the member picker
  editable: boolean;                  // planner-created (vs imported = read-only)
  onRename: (name: string) => void;
  onSetCrest: (bgHash: string, fgHash: string) => void;
  onMembersChange: (members: DynastyMember[], headSimId: string | null) => void;
  onValuesChange: (valueIds: string[]) => void;
  onSetRelations: (allianceIds: string[], rivalryIds: string[]) => void;
  onDelete: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  const navigate = useNavigate();
  const saveFileId = useSaveFile((s) => s.saveFileId);
  const crest = resolveCrest(dynasty.crestBgHash, dynasty.crestFgHash);
  const { ideals, skills } = resolveDynastyValues(dynasty.valueIds);

  // Resolve allied/rival dynasty ids → crest + name (fall back to a neutral chip
  // when the related dynasty wasn't imported, so a relationship is never dropped).
  const resolveRefs = (refs: string[]) =>
    refs.map((ref) => {
      const d = byId.get(ref) ?? bySourceId.get(ref);   // planner-authored ids first, then imported game ids
      return {
        key: ref,
        name: d ? (d.name || 'Unnamed Dynasty') : 'Unknown dynasty',
        crestBgHash: d?.crestBgHash ?? null,
        crestFgHash: d?.crestFgHash ?? null,
      };
    });
  const allies = resolveRefs(dynasty.allianceSourceIds);
  const rivals = resolveRefs(dynasty.rivalrySourceIds);
  const lvl = prestigeLevel(dynasty.prestige);
  const rank = unityRank(dynasty.unity);
  const perkCount = dynasty.perkIds.filter((id) => STOCK_DYNASTY_PERKS['0x' + id.toString(16)]).length;

  // Flat member list, ordered Head → Heir → Founder → Black Sheep → Members,
  // then by succession order within each role.
  const orderedMembers = useMemo(() => {
    return [...dynasty.members]
      .map((m) => ({ sim: sims[m.simId], role: m.role, order: m.order }))
      .filter((x): x is { sim: Sim; role: string | null; order: number } => !!x.sim)
      .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.order - b.order);
  }, [dynasty.members, sims]);

  const portraitFor = (sim: Sim) => portraits.get(sim.id) ?? null;

  const COLLAPSE_AT = 8;
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [notes, setNotes] = useState(dynasty.notes);
  const [editingName, setEditingName] = useState(dynasty.name);
  const [crestOpen, setCrestOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [valuePicker, setValuePicker] = useState<'ideal' | 'skill' | null>(null);
  const [relationPicker, setRelationPicker] = useState<'ally' | 'rival' | null>(null);
  const [roleNote, setRoleNote] = useState<string | null>(null);
  useEffect(() => {
    setNotes(dynasty.notes);
    setEditingName(dynasty.name);
    setShowAllMembers(false);
    setCrestOpen(false);
    setPickerOpen(false);
    setValuePicker(null);
    setRelationPicker(null);
    setRoleNote(null);
  }, [dynasty.id]);

  // Ideals + skills live together in valueIds; split by which catalog matches.
  const idealIds = dynasty.valueIds.filter((id) => STOCK_DYNASTY_IDEALS[id]);
  const skillIds = dynasty.valueIds.filter((id) => STOCK_DYNASTY_SKILLS[id]);
  const allyIds = dynasty.allianceSourceIds;
  const rivalIds = dynasty.rivalrySourceIds;
  const relationCandidates = allDynasties.filter((d) => d.id !== dynasty.id);

  // Member edits — order is auto (sort by role, then add sequence), headSimId
  // follows whoever is Head, and Head/Heir/Founder are singletons.
  const commitMembers = (members: DynastyMember[]) => {
    onMembersChange(members, members.find((m) => m.role === 'Head')?.simId ?? null);
  };
  const flashNote = (msg: string) => { setRoleNote(msg); window.setTimeout(() => setRoleNote((n) => (n === msg ? null : n)), 3500); };
  const addMembers = (simIds: string[]) => {
    let order = dynasty.members.reduce((m, x) => Math.max(m, x.order), 0);
    let hasHead = dynasty.members.some((m) => m.role === 'Head');
    const additions: DynastyMember[] = simIds.map((simId) => {
      order += 1;
      const role = hasHead ? 'Member' : 'Head';
      hasHead = true;
      return { simId, order, role };
    });
    commitMembers([...dynasty.members, ...additions]);
  };
  const pickRole = (simId: string, role: string) => {
    const SINGLE = new Set(['Head', 'Heir', 'Founder']);
    let demoted: string | null = null;
    let next = dynasty.members.map((m) => ({ ...m }));
    if (SINGLE.has(role)) {
      for (const m of next) {
        if (m.role === role && m.simId !== simId) { m.role = 'Member'; demoted = sims[m.simId] ? sims[m.simId].firstName : 'Someone'; }
      }
    }
    next = next.map((m) => (m.simId === simId ? { ...m, role } : m));
    commitMembers(next);
    if (demoted) flashNote(`${demoted} is no longer ${role}.`);
  };
  const removeMember = (simId: string) => commitMembers(dynasty.members.filter((m) => m.simId !== simId));
  const visibleMembers = showAllMembers ? orderedMembers : orderedMembers.slice(0, COLLAPSE_AT);

  return (
    <div className="max-w-[760px] px-8 py-8 flex flex-col gap-8">
      {/* Header — sweep pattern: crest + eyebrow + name + member meta + Remove */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-5">
          {editable ? (
            <Tooltip text="Design crest">
              <button type="button" onClick={() => setCrestOpen(true)} className="shrink-0 bg-transparent border-none p-0 cursor-pointer group relative" aria-label="Design crest">
                <DynastyCrest bg={crest.bg?.asset} fg={crest.fg?.asset} size={96} />
                <span className="absolute inset-0 rounded-md flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 bg-black/45 transition-opacity">
                  <PencilSimple size={18} weight="bold" className="text-white" />
                  <span className="text-[10px] font-semibold uppercase tracking-label text-white">Edit</span>
                </span>
              </button>
            </Tooltip>
          ) : (
            <DynastyCrest bg={crest.bg?.asset} fg={crest.fg?.asset} size={96} className="shrink-0" />
          )}

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="text-2xs font-bold uppercase tracking-label text-c-secondary mb-1">Dynasty</div>
            {editable ? (
              <div className="group/name flex items-center gap-1.5 border-b border-dashed border-c-border focus-within:border-solid focus-within:border-c-accent transition-colors">
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => { const t = editingName.trim(); if (t && t !== dynasty.name) onRename(t); else if (!t) setEditingName(dynasty.name); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder="Name this dynasty…"
                  className="flex-1 min-w-0 bg-transparent border-none text-3xl font-extrabold text-c-text tracking-headline outline-none placeholder:text-c-faint py-0.5"
                />
                <PencilSimple size={16} weight="bold" className="shrink-0 text-c-faint group-focus-within/name:text-c-accent transition-colors" />
              </div>
            ) : (
              <h2 className="text-3xl font-extrabold text-c-text tracking-headline m-0 leading-tight break-words">{dynasty.name || 'Unnamed Dynasty'}</h2>
            )}
            <div className="flex items-center gap-3 mt-2 text-sm text-c-dim flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <UsersThree size={16} weight="duotone" className="text-c-secondary" />
                {orderedMembers.length} member{orderedMembers.length === 1 ? '' : 's'}
              </span>
              <button onClick={onDelete} className="ml-auto shrink-0 inline-flex items-center gap-1 text-c-faint hover:text-c-red cursor-pointer text-xs bg-transparent border-none transition-colors">
                <Trash size={13} weight="bold" /> Remove
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Description — always a read-only game-mirror (hides itself when empty) */}
      <MirroredDescription value={dynasty.description} />

      {/* Members — planner editor: add-only flow, click a role chip to designate */}
      {editable && (
        <section>
          <div className={`${SECTION_LABEL} mb-1`}>Members ({orderedMembers.length})</div>
          {orderedMembers.length === 0 ? (
            <p className="text-sm text-c-faint italic m-0 py-2">No members yet — add sims to build the dynasty.</p>
          ) : (
            <div className="divide-y divide-c-border">
              {visibleMembers.map(({ sim, role }) => (
                <EditableMemberRow
                  key={sim.id}
                  sim={sim}
                  role={role}
                  portrait={portraitFor(sim)}
                  onPickRole={(r) => pickRole(sim.id, r)}
                  onRemove={() => removeMember(sim.id)}
                  onOpenSim={() => navigate(`/saves/${saveFileId}/sims?sim=${sim.id}`)}
                />
              ))}
            </div>
          )}
          {roleNote && <div className="mt-2 text-xs text-c-dim">{roleNote}</div>}
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className={btn('secondary')}
            >
              <Plus size={14} weight="bold" /> Add members
            </button>
            {orderedMembers.length > COLLAPSE_AT && (
              <button
                onClick={() => setShowAllMembers((v) => !v)}
                className="shrink-0 text-xs font-semibold text-c-accent hover:underline bg-transparent border-none cursor-pointer p-0"
              >
                {showAllMembers ? 'Show fewer' : `Show all ${orderedMembers.length} members`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Ideals + Skills — planner editor */}
      {editable && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-c-card border border-c-border rounded-xl p-5">
            <div className={`${SECTION_LABEL} mb-3`}>Ideals</div>
            {idealIds.length > 0 && (
              <ValueChips
                items={idealIds.map((id) => ({ id, label: STOCK_DYNASTY_IDEALS[id], icon: idealIcon(STOCK_DYNASTY_IDEALS[id]) }))}
                tone="bg-c-secondary-soft text-c-secondary"
                onRemove={(id) => onValuesChange(dynasty.valueIds.filter((v) => v !== id))}
              />
            )}
            {idealIds.length >= 3 ? (
              <button type="button" onClick={() => setValuePicker('ideal')} className="mt-3 inline-flex items-center text-xs font-medium text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer p-0 transition-colors">
                Edit ideals
              </button>
            ) : (
              <button type="button" onClick={() => setValuePicker('ideal')} className={`inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-c-border bg-c-base px-3.5 py-2 cursor-pointer transition-colors text-c-accent hover:border-c-accent ${idealIds.length > 0 ? 'mt-3' : ''}`}>
                <Plus size={14} weight="bold" /> Choose ideals
              </button>
            )}
          </div>
          <div className="bg-c-card border border-c-border rounded-xl p-5">
            <div className={`${SECTION_LABEL} mb-3`}>Skills</div>
            {skillIds.length > 0 && (
              <ValueChips
                items={skillIds.map((id) => ({ id, label: STOCK_DYNASTY_SKILLS[id], icon: skillIcon(STOCK_DYNASTY_SKILLS[id]) }))}
                tone="bg-c-accent-soft text-c-green"
                onRemove={(id) => onValuesChange(dynasty.valueIds.filter((v) => v !== id))}
              />
            )}
            {skillIds.length >= 3 ? (
              <button type="button" onClick={() => setValuePicker('skill')} className="mt-3 inline-flex items-center text-xs font-medium text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer p-0 transition-colors">
                Edit skills
              </button>
            ) : (
              <button type="button" onClick={() => setValuePicker('skill')} className={`inline-flex items-center gap-1.5 text-sm font-medium rounded-lg border border-c-border bg-c-base px-3.5 py-2 cursor-pointer transition-colors text-c-accent hover:border-c-accent ${skillIds.length > 0 ? 'mt-3' : ''}`}>
                <Plus size={14} weight="bold" /> Choose skills
              </button>
            )}
          </div>
        </div>
      )}

      {/* Alliances + Rivalries — planner editor. Stored as partner planner ids;
          a pair is allies XOR rivals, and planner↔planner is reciprocal. */}
      {editable && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-c-card border border-c-border rounded-xl p-5">
            <div className={`${SECTION_LABEL} mb-3`}>Alliances</div>
            {allies.length > 0 && (
              <DynastyRefChips items={allies} tone="bg-c-accent-soft text-c-green" emptyText="" onRemove={(key) => onSetRelations(allyIds.filter((id) => id !== key), rivalIds)} />
            )}
            {allies.length > 0 ? (
              <button type="button" onClick={() => setRelationPicker('ally')} className="mt-3 inline-flex items-center text-xs font-medium text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer p-0 transition-colors">
                Edit alliances
              </button>
            ) : (
              <button type="button" onClick={() => setRelationPicker('ally')} className={btn('secondary')}>
                <Plus size={14} weight="bold" /> Add allies
              </button>
            )}
          </div>
          <div className="bg-c-card border border-c-border rounded-xl p-5">
            <div className={`${SECTION_LABEL} mb-3`}>Rivalries</div>
            {rivals.length > 0 && (
              <DynastyRefChips items={rivals} tone="bg-c-secondary-soft text-c-secondary" emptyText="" onRemove={(key) => onSetRelations(allyIds, rivalIds.filter((id) => id !== key))} />
            )}
            {rivals.length > 0 ? (
              <button type="button" onClick={() => setRelationPicker('rival')} className="mt-3 inline-flex items-center text-xs font-medium text-c-dim hover:text-c-text bg-transparent border-none cursor-pointer p-0 transition-colors">
                Edit rivalries
              </button>
            ) : (
              <button type="button" onClick={() => setRelationPicker('rival')} className={btn('secondary')}>
                <Plus size={14} weight="bold" /> Add rivals
              </button>
            )}
          </div>
        </div>
      )}

      {/* Prestige + Unity — game progression, imported only */}
      {!editable && (
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-c-card border border-c-border rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-3">
            <span className={SECTION_LABEL}>Prestige</span>
            <span className="text-lg font-extrabold text-c-text tracking-display">Level {lvl}</span>
          </div>
          <StarRating level={lvl} />
          {dynasty.prestige != null && <div className="text-xs text-c-faint mt-3">{Math.round(dynasty.prestige).toLocaleString()} points</div>}
        </div>
        <div className="bg-c-card border border-c-border rounded-xl p-5 flex flex-col">
          <span className={SECTION_LABEL}>Unity</span>
          <div className="flex items-center gap-2 mt-3">
            <ShieldCheck size={28} weight="fill" className={UNITY_TONE[rank]} />
            <span className={`text-2xl font-extrabold tracking-display ${UNITY_TONE[rank]}`}>{rank}</span>
          </div>
          {dynasty.unity != null && <div className="text-xs text-c-faint mt-auto pt-3">{Math.round(dynasty.unity)} / 130</div>}
        </div>
      </div>
      )}

      {/* Members — single flat list, ordered by role (read-only; planner editor comes next) */}
      {!editable && (
      <section>
        <div className={`${SECTION_LABEL} mb-1`}>Members ({orderedMembers.length})</div>
        <div className="divide-y divide-c-border">
          {visibleMembers.map(({ sim, role }) => (
            <MemberRow key={sim.id} sim={sim} role={role} portrait={portraitFor(sim)} onClick={() => navigate(`/saves/${saveFileId}/sims?sim=${sim.id}`)} />
          ))}
        </div>
        {orderedMembers.length > COLLAPSE_AT && (
          <button
            onClick={() => setShowAllMembers((v) => !v)}
            className="mt-2 text-xs font-semibold text-c-accent hover:underline bg-transparent border-none cursor-pointer p-0"
          >
            {showAllMembers ? 'Show fewer' : `Show all ${orderedMembers.length} members`}
          </button>
        )}
      </section>
      )}

      {/* Ideals + Skills — imported only for now */}
      {!editable && (
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-c-card border border-c-border rounded-xl p-5">
          <div className={`${SECTION_LABEL} mb-3`}>Ideals</div>
          <ValueChips items={ideals.map((name) => ({ label: name, icon: idealIcon(name) }))} tone="bg-c-secondary-soft text-c-secondary" />
        </div>
        <div className="bg-c-card border border-c-border rounded-xl p-5">
          <div className={`${SECTION_LABEL} mb-3`}>Skills</div>
          <ValueChips items={skills.map((name) => ({ label: name, icon: skillIcon(name) }))} tone="bg-c-accent-soft text-c-green" />
        </div>
      </div>
      )}

      {/* Alliances + Rivalries — imported only for now */}
      {!editable && (
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-c-card border border-c-border rounded-xl p-5">
          <div className={`${SECTION_LABEL} mb-3`}>Alliances</div>
          <DynastyRefChips items={allies} tone="bg-c-accent-soft text-c-green" emptyText="No alliances" />
        </div>
        <div className="bg-c-card border border-c-border rounded-xl p-5">
          <div className={`${SECTION_LABEL} mb-3`}>Rivalries</div>
          <DynastyRefChips items={rivals} tone="bg-c-secondary-soft text-c-secondary" emptyText="No rivalries" />
        </div>
      </div>
      )}

      {!editable && perkCount > 0 && (
        <div className="text-sm text-c-dim">{perkCount} dynasty perk{perkCount === 1 ? '' : 's'} unlocked</div>
      )}

      {/* Notes — private, shared clean-card component (matches households/clubs) */}
      <Notes
        value={notes}
        onChange={setNotes}
        onBlur={() => { if (notes !== dynasty.notes) onSaveNotes(notes); }}
      />

      {crestOpen && (
        <CrestCreatorModal
          bgHash={dynasty.crestBgHash}
          fgHash={dynasty.crestFgHash}
          onApply={(bg, fg) => { onSetCrest(bg, fg); setCrestOpen(false); }}
          onClose={() => setCrestOpen(false)}
        />
      )}
      {pickerOpen && (
        <DynastyMemberPickerModal
          existingIds={new Set(dynasty.members.map((m) => m.simId))}
          simDynastyName={simDynastyName}
          onAdd={(ids) => { addMembers(ids); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {valuePicker === 'ideal' && (
        <DynastyValuePickerModal
          title="Choose ideals"
          catalog={STOCK_DYNASTY_IDEALS}
          iconFor={idealIcon}
          selectedIds={idealIds}
          max={3}
          onApply={(ids) => { onValuesChange([...ids, ...skillIds]); setValuePicker(null); }}
          onClose={() => setValuePicker(null)}
        />
      )}
      {valuePicker === 'skill' && (
        <DynastyValuePickerModal
          title="Choose skills"
          catalog={STOCK_DYNASTY_SKILLS}
          iconFor={skillIcon}
          selectedIds={skillIds}
          max={3}
          onApply={(ids) => { onValuesChange([...idealIds, ...ids]); setValuePicker(null); }}
          onClose={() => setValuePicker(null)}
        />
      )}
      {relationPicker === 'ally' && (
        <DynastyRelationPickerModal
          title="Add allies"
          candidates={relationCandidates}
          selectedIds={allyIds}
          conflictIds={new Set(rivalIds)}
          conflictLabel="rival"
          onApply={(ids) => { onSetRelations(ids, rivalIds.filter((id) => !ids.includes(id))); setRelationPicker(null); }}
          onClose={() => setRelationPicker(null)}
        />
      )}
      {relationPicker === 'rival' && (
        <DynastyRelationPickerModal
          title="Add rivals"
          candidates={relationCandidates}
          selectedIds={rivalIds}
          conflictIds={new Set(allyIds)}
          conflictLabel="ally"
          onApply={(ids) => { onSetRelations(allyIds.filter((id) => !ids.includes(id)), ids); setRelationPicker(null); }}
          onClose={() => setRelationPicker(null)}
        />
      )}
    </div>
  );
}

export function DynastyManager() {
  const saveFileId = useSaveFile((s) => s.saveFileId);
  const dynasties = useSaveFile((s) => s.dynasties);
  const sims = useSaveFile((s) => s.sims);
  const updateDynasty = useSaveFile((s) => s.updateDynasty);
  const addDynasty = useSaveFile((s) => s.addDynasty);
  const deleteDynasty = useSaveFile((s) => s.deleteDynasty);
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [portraits, setPortraits] = useState<PortraitMap>(new Map());

  async function handleCreate() {
    const { bg, fg } = randomCrest();
    const id = await addDynasty({
      name: 'New dynasty', description: '', notes: '', headSimId: null, members: [],
      valueIds: [], crestBgHash: bg, crestFgHash: fg, prestige: null, unity: null,
      perkIds: [], allianceSourceIds: [], rivalrySourceIds: [], sourceId: null,
    });
    setSearch('');
    setSelectedId(id);
  }

  async function handleDelete(d: Dynasty) {
    if (!await confirm({ message: `Delete "${d.name || 'this dynasty'}"?`, confirmLabel: 'Delete', danger: true })) return;
    await deleteDynasty(d.id);
    setSelectedId(null);
  }

  // Portraits are a bonus layer — the gallery already looks complete with the
  // gender-tinted monogram fallback, so a failed/empty fetch is harmless.
  useEffect(() => {
    if (!saveFileId) return;
    let live = true;
    api.listSimPortraits(saveFileId)
      .then((rows) => { if (live) setPortraits(new Map(rows.map((r) => [r.simId, api.photoUrl(r.filename, 96)]))); })
      .catch(() => {});
    return () => { live = false; };
  }, [saveFileId]);

  const list = useMemo(
    () => Object.values(dynasties).sort((a, b) => (a.name || 'Unnamed Dynasty').localeCompare(b.name || 'Unnamed Dynasty')),
    [dynasties],
  );
  // game id (hex) → dynasty, so allies/rivals (stored as the other dynasty's id) resolve to a crest + name.
  const bySourceId = useMemo(() => {
    const m = new Map<string, Dynasty>();
    for (const d of Object.values(dynasties)) if (d.sourceId) m.set(d.sourceId, d);
    return m;
  }, [dynasties]);
  // planner id → dynasty, so authored allies/rivals (stored as the partner's
  // planner id) resolve to a crest + name.
  const byId = useMemo(() => {
    const m = new Map<string, Dynasty>();
    for (const d of Object.values(dynasties)) m.set(d.id, d);
    return m;
  }, [dynasties]);
  // simId → dynasty name, across every dynasty — one sim belongs to one dynasty,
  // so the member picker greys out anyone already placed.
  const simDynastyName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of Object.values(dynasties)) for (const mem of d.members) m.set(mem.simId, d.name || 'a dynasty');
    return m;
  }, [dynasties]);

  // Set a planner dynasty's full ally/rival sets, then reciprocate to any partner
  // that's also planner-created (imported partners are read-only → one-sided).
  // Reads live store state so a multi-partner change applies without stale closures.
  function setSelfRelations(selfId: string, nextAlly: string[], nextRival: string[]) {
    const all = useSaveFile.getState().dynasties;
    const self = all[selfId];
    if (!self) return;
    updateDynasty(selfId, { allianceSourceIds: nextAlly, rivalrySourceIds: nextRival });
    const nextAllySet = new Set(nextAlly);
    const nextRivalSet = new Set(nextRival);
    const touched = new Set([...self.allianceSourceIds, ...self.rivalrySourceIds, ...nextAlly, ...nextRival]);
    for (const pid of touched) {
      const p = all[pid];
      if (!p || p.sourceId) continue;  // only planner partners reciprocate
      const pAlly = p.allianceSourceIds.filter((x) => x !== selfId);
      const pRival = p.rivalrySourceIds.filter((x) => x !== selfId);
      if (nextAllySet.has(pid)) pAlly.push(selfId);
      else if (nextRivalSet.has(pid)) pRival.push(selfId);
      updateDynasty(pid, { allianceSourceIds: pAlly, rivalrySourceIds: pRival });
    }
  }
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? list.filter((d) => d.name.toLowerCase().includes(q)) : list;
  }, [list, search]);

  // Land on the overview, not a forced selection — auto-opening the first
  // dynasty on mount was overwhelming. Only clear a stale id (deleted dynasty).
  useEffect(() => {
    if (selectedId && !dynasties[selectedId]) setSelectedId(null);
  }, [selectedId, dynasties]);

  useListKeyboardNav({ items: filtered, selectedId, onSelect: setSelectedId });

  const selected = selectedId ? dynasties[selectedId] : null;

  const dynStats = useMemo(() => {
    const total = list.length;
    const fromSave = list.filter((d) => d.sourceId).length;
    let members = 0;
    let largest: { name: string; count: number } | null = null;
    const allySet = new Set<string>();
    for (const d of list) {
      members += d.members.length;
      if (!largest || d.members.length > largest.count) largest = { name: d.name || 'Unnamed Dynasty', count: d.members.length };
      for (const ref of d.allianceSourceIds) {
        const partner = bySourceId.get(ref) ?? byId.get(ref);
        allySet.add([d.id, partner?.id ?? ref].sort().join('|'));
      }
    }
    return { total, fromSave, planned: total - fromSave, members, largest, alliances: allySet.size };
  }, [list, bySourceId, byId]);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-w-[1600px] w-full">
      <PackNotOwnedBanner packId="EP21" feature="Dynasties" />
      <MasterDetail>
        {/* Left panel — dynasty list */}
        <MasterDetail.Rail width="w-64">
          <div className="px-4 py-4 border-b border-c-border flex flex-col gap-3">
            <h1 className="text-xl font-bold text-c-text m-0 tracking-headline">Dynasties</h1>
            <button
              onClick={handleCreate}
              className={btn('primary', { block: true, elevated: true })}
            >
              <Plus size={14} weight="bold" />
              <span className="text-2xs font-semibold uppercase tracking-label">New dynasty</span>
            </button>
            {list.length > 0 && (
              <div className="relative">
                <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
                <input
                  placeholder="Search dynasties..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-c-base border border-c-border rounded-md pl-9 pr-9 py-[6px] text-c-text text-xs w-full outline-none focus:border-c-accent"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-c-faint hover:text-c-text p-1" aria-label="Clear search">
                    <X size={11} weight="bold" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.map((d) => (
              <DynastyListItem key={d.id} dynasty={d} active={d.id === selectedId} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </MasterDetail.Rail>

        {/* Right panel — detail */}
        <MasterDetail.Detail label="Dynasties">
        <div className="flex-1 min-w-0 overflow-y-auto bg-c-base">
          {selected ? (
            <DynastyDetail
              dynasty={selected}
              sims={sims}
              portraits={portraits}
              bySourceId={bySourceId}
              byId={byId}
              allDynasties={list}
              simDynastyName={simDynastyName}
              editable={!selected.sourceId}
              onRename={(name) => { updateDynasty(selected.id, { name }); }}
              onSetCrest={(crestBgHash, crestFgHash) => { updateDynasty(selected.id, { crestBgHash, crestFgHash }); }}
              onMembersChange={(members, headSimId) => { updateDynasty(selected.id, { members, headSimId }); }}
              onValuesChange={(valueIds) => { updateDynasty(selected.id, { valueIds }); }}
              onSetRelations={(allianceIds, rivalryIds) => { setSelfRelations(selected.id, allianceIds, rivalryIds); }}
              onDelete={() => { handleDelete(selected); }}
              onSaveNotes={(notes) => { updateDynasty(selected.id, { notes }); }}
            />
          ) : list.length === 0 ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-sm">
                <Crown size={36} weight="duotone" className="text-c-faint mx-auto mb-3" />
                <div className="text-base font-semibold text-c-text">No dynasties yet</div>
                <p className="text-sm text-c-dim mt-1.5">
                  Imported dynasties come from the Royalty &amp; Legacy pack — found one in-game, then re-sync. Or build your own from scratch.
                </p>
                <button onClick={handleCreate} className={btn('primary', { className: 'mt-4' })}>
                  <Plus size={15} weight="bold" /> New dynasty
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 md:p-8">
              <OverviewLanding title="Dynasties at a glance" columns={3}>
                <HeroSplit
                  total={dynStats.total}
                  label={dynStats.total === 1 ? 'Dynasty' : 'Dynasties'}
                  segments={[
                    { value: dynStats.fromSave, label: 'from save', tone: 'green' },
                    { value: dynStats.planned, label: 'planned', tone: 'plum' },
                  ]}
                />
                <StatTile tone="green" label="Members" value={dynStats.members} sub="sims in a dynasty"
                  icon={<UsersThree size={20} weight="duotone" />} />
                <StatTile tone="plum" label="Largest" value={dynStats.largest ? dynStats.largest.count : 0}
                  sub={dynStats.largest ? dynStats.largest.name : '—'} icon={<Crown size={20} weight="duotone" />} />
                <StatTile tone="plum" label="Alliances" value={dynStats.alliances} sub="between dynasties"
                  icon={<Handshake size={20} weight="duotone" />} />
              </OverviewLanding>
            </div>
          )}
        </div>
        </MasterDetail.Detail>
      </MasterDetail>
    </div>
  );
}
