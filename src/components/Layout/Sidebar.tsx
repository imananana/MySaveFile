import { NavLink, useParams } from 'react-router-dom';
import { useMemo, useState, ReactNode } from 'react';
import {
  SquaresFour,
  ImageSquare,
  Lightbulb,
  House,
  Users,
  UsersThree,
  CalendarDots,
  Crown,
  Storefront,
  MapPinArea,
  PencilSimple,
  Shuffle,
  ChartBar,
  Tree,
  CaretDown,
  EyeSlash,
  Lock,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '../common/Tooltip';
import { useSaveFile } from '../../store/useSaveFile';
import { usePackOwnership } from '../../store/usePackOwnership';
import { PACKS_BY_ID, RELEASE_TO_PACK } from '../../data/packs';
import { WORLDS_SORTED_BY_RELEASE, WORLDS_DATA, WORLD_LOT_COUNTS } from '../../data/worlds';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { saveFileId } = useParams<{ saveFileId: string }>();
  const base = `/saves/${saveFileId}`;
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  // Subscribe to the underlying state slices so the sidebar re-renders when
  // pack ownership flips — selecting the isOwned function alone wouldn't
  // trigger re-renders (the reference never changes).
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  const isOwned = usePackOwnership((s) => s.isOwned);

  // Split worlds into two buckets:
  //   - activeAndDisabledWorlds: pack owned (manually-disabled worlds still
  //     listed in the main Worlds section, just rendered greyed so the user
  //     sees what they opted out of)
  //   - lockedWorlds: pack not owned (separate collapsed "Locked" section)
  const { activeAndDisabledWorlds, lockedWorlds } = useMemo(() => {
    const active: string[] = [];
    const locked: { world: string; packId: string; packName: string }[] = [];
    for (const w of WORLDS_SORTED_BY_RELEASE) {
      const release = WORLDS_DATA[w as keyof typeof WORLDS_DATA].release;
      const packId = RELEASE_TO_PACK[release];
      // Worlds whose pack isn't recognized fall through as base (always shown).
      if (packId && !isOwned(packId)) {
        locked.push({ world: w, packId, packName: PACKS_BY_ID[packId]?.name ?? packId });
      } else {
        active.push(w);
      }
    }
    // A world you switched off sinks to the bottom, exactly as it sinks to the
    // end of Home's grid. One state, one order, wherever you meet it.
    active.sort((a, b) => Number(disabledWorlds.includes(a)) - Number(disabledWorlds.includes(b)));
    return { activeAndDisabledWorlds: active, lockedWorlds: locked };
  }, [isOwned, manualOverrides, autoDetected, disabledWorlds]);

  const [manageOpen, setManageOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [worldsOpen, setWorldsOpen] = useState(true);
  const [lockedOpen, setLockedOpen] = useState(false);

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-[99]" onClick={onClose} />
      )}
      <aside
        className={`sidebar ${mobileOpen ? 'sidebar--open' : ''} w-60 bg-c-card border-r border-c-border shadow-sm flex flex-col h-screen fixed top-0 overflow-y-auto z-[100] shrink-0`}
      >
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 border-b border-c-border flex items-center gap-3">
          <img
            src="/3d-clay-plumbob.svg"
            alt=""
            className="h-11 w-auto shrink-0 select-none"
            draggable={false}
          />
          <div className="leading-tight">
            <div className="text-sm font-bold text-c-text tracking-headline">
              MySaveFile
            </div>
            <div className="text-3xs font-bold tracking-label-lg uppercase text-c-dim mt-0.5">
              The Sims 4 Planner
            </div>
          </div>
        </div>

        {/* Primary nav */}
        <nav className="px-2 pt-3">
          <NavItem to={base} end onClose={onClose} icon={SquaresFour} label="Home" />
          <NavItem to={`${base}/showcase`} onClose={onClose} icon={ImageSquare} label="Showcase" />
          <NavItem to={`${base}/photos`} onClose={onClose} icon={Lightbulb} label="Inspo" />
        </nav>

        <Divider />

        {/* Manage — CRUD-style data pages */}
        <div className="px-2">
          <button
            onClick={() => setManageOpen((o) => !o)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-transparent border-none cursor-pointer group rounded-md hover:bg-c-panel transition-colors"
          >
            <span className="text-2xs font-bold tracking-label-lg text-c-dim group-hover:text-c-text uppercase transition-colors">
              Manage
            </span>
            <CaretDown
              size={10}
              weight="bold"
              className={`text-c-faint group-hover:text-c-dim transition-all ${manageOpen ? '' : '-rotate-90'}`}
            />
          </button>
          {manageOpen && (
            <div className="mb-1">
              <NavItem to={`${base}/households`} onClose={onClose} icon={House} label="Households" small />
              <NavItem to={`${base}/sims`} onClose={onClose} icon={Users} label="Sims" small />
              <NavItem to={`${base}/clubs`} onClose={onClose} icon={UsersThree} label="Clubs" small packId="EP02" />
              <NavItem to={`${base}/holidays`} onClose={onClose} icon={CalendarDots} label="Holidays" small packId="EP05" />
              <NavItem to={`${base}/small-businesses`} onClose={onClose} icon={Storefront} label="Small Businesses" small packId="EP18" />
              <NavItem to={`${base}/custom-venues`} onClose={onClose} icon={MapPinArea} label="Custom Venues" small packId="EP20" />
              <NavItem to={`${base}/dynasties`} onClose={onClose} icon={Crown} label="Dynasties" small packId="EP21" />
              <NavItem to={`${base}/mods`} onClose={onClose} icon={PencilSimple} label="Mods" small />
            </div>
          )}
        </div>

        {/* Tools — analytical + generative cross-save tools */}
        <div className="px-2">
          <button
            onClick={() => setToolsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-transparent border-none cursor-pointer group rounded-md hover:bg-c-panel transition-colors"
          >
            <span className="text-2xs font-bold tracking-label-lg text-c-dim group-hover:text-c-text uppercase transition-colors">
              Tools
            </span>
            <CaretDown
              size={10}
              weight="bold"
              className={`text-c-faint group-hover:text-c-dim transition-all ${toolsOpen ? '' : '-rotate-90'}`}
            />
          </button>
          {toolsOpen && (
            <div className="mb-1">
              <NavItem to={`${base}/diversity`} onClose={onClose} icon={ChartBar} label="Diversity" small />
              <NavItem to={`${base}/family`} onClose={onClose} icon={Tree} label="Family Tree" small />
              <NavItem to={`${base}/randomizer`} onClose={onClose} icon={Shuffle} label="Randomizer" small />
            </div>
          )}
        </div>

        <Divider />

        {/* Worlds — owned packs only. Manually-disabled worlds stay in this
            list but render greyed so the user sees what they opted out of. */}
        <div className="px-2 flex-1">
          <button
            onClick={() => setWorldsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-transparent border-none cursor-pointer group rounded-md hover:bg-c-panel transition-colors"
          >
            <span className="text-2xs font-bold tracking-label-lg text-c-dim group-hover:text-c-text uppercase transition-colors">
              Worlds
            </span>
            <CaretDown
              size={10}
              weight="bold"
              className={`text-c-faint group-hover:text-c-dim transition-all ${worldsOpen ? '' : '-rotate-90'}`}
            />
          </button>
          {worldsOpen && (<>
          {activeAndDisabledWorlds.map((worldName) => {
            const isManuallyDisabled = disabledWorlds.includes(worldName);
            return (
              <Tooltip
                key={worldName}
                text={isManuallyDisabled ? `${worldName} — disabled in this save` : undefined}
                display="block"
              >
              <NavLink
                to={`${base}/world/${encodeURIComponent(worldName)}`}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center px-2.5 py-1.5 rounded-md no-underline text-xs mb-px transition-colors ${
                    isActive
                      ? 'text-c-accent bg-c-accent-soft font-semibold'
                      : isManuallyDisabled
                        ? 'text-c-faint hover:text-c-dim hover:bg-c-panel'
                        : 'text-c-dim hover:text-c-text hover:bg-c-panel'
                  }`
                }
              >
                {isManuallyDisabled && (
                  <EyeSlash size={11} weight="duotone" className="mr-1.5 shrink-0 text-c-faint" />
                )}
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {worldName}
                </span>
                {/* The count the world PAGE shows — not every seeded lot. */}
                <span className="text-2xs text-c-faint ml-1 tabular-nums">
                  {WORLD_LOT_COUNTS[worldName as keyof typeof WORLDS_DATA]}
                </span>
              </NavLink>
              </Tooltip>
            );
          })}

          {/* Locked behind packs you don't own — collapsed by default. */}
          {lockedWorlds.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setLockedOpen((o) => !o)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-transparent border-none cursor-pointer group rounded-md hover:bg-c-panel transition-colors"
              >
                <span className="flex items-center gap-1.5 text-2xs font-bold tracking-label-lg text-c-faint group-hover:text-c-dim uppercase transition-colors">
                  <Lock size={10} weight="duotone" />
                  Locked
                  <span className="text-c-faint normal-case tracking-normal font-medium">({lockedWorlds.length})</span>
                </span>
                <CaretDown
                  size={10}
                  weight="bold"
                  className={`text-c-faint group-hover:text-c-dim transition-all ${lockedOpen ? '' : '-rotate-90'}`}
                />
              </button>
              {lockedOpen && (
                <div className="mb-1">
                  {lockedWorlds.map(({ world, packName }) => (
                    <Tooltip key={world} text={`Requires ${packName}`} display="block">
                    <NavLink
                      to={`${base}/world/${encodeURIComponent(world)}`}
                      onClick={onClose}
                      className="flex items-center px-2.5 py-1.5 rounded-md no-underline text-xs mb-px transition-colors text-c-faint hover:text-c-dim hover:bg-c-panel"
                    >
                      <Lock size={10} weight="duotone" className="mr-1.5 shrink-0 text-c-faint" />
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {world}
                      </span>
                      <span className="text-2xs text-c-faint ml-1 tabular-nums">
                        {WORLD_LOT_COUNTS[world as keyof typeof WORLDS_DATA]}
                      </span>
                    </NavLink>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          )}
          </>)}
        </div>

        {/* Legal + trademark */}
        <div className="px-4 pb-4 pt-2 space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-3xs text-c-faint">
            <a href="/about" target="_blank" rel="noopener noreferrer" className="hover:text-c-dim no-underline">About</a>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-c-dim no-underline">Privacy</a>
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-c-dim no-underline">Terms</a>
          </div>
          <p className="text-3xs text-c-faint leading-relaxed">
            The Sims™ is a trademark of Electronic Arts Inc. This is an unofficial, non-commercial fan project, not affiliated with or endorsed by EA.
          </p>
        </div>
      </aside>
    </>
  );
}

function NavItem({
  to,
  end,
  onClose,
  icon: Icon,
  label,
  small,
  packId,
}: {
  to: string;
  end?: boolean;
  onClose: () => void;
  icon: PhosphorIcon;
  label: ReactNode;
  small?: boolean;
  /** Pack required for this section. When the pack isn't owned, the row stays
   *  clickable but renders muted with a hover tooltip explaining which pack
   *  unlocks it. We don't hide gated entries — the user should see what's
   *  available if they pick up the pack later. */
  packId?: string;
}) {
  const isOwned = usePackOwnership((s) => packId ? s.isOwned(packId) : true);
  const requiresPack = packId && !isOwned;
  const requiresPackName = requiresPack ? PACKS_BY_ID[packId]?.name : null;

  const sizing = small
    ? 'text-xs py-1.5 gap-2'
    : 'text-sm py-2 gap-2';
  return (
    <Tooltip text={requiresPackName ? `Requires ${requiresPackName}` : undefined} display="block">
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center px-2.5 rounded-md no-underline mb-px transition-colors ${sizing} ${
          isActive
            ? 'text-c-accent bg-c-accent-soft font-semibold'
            : requiresPack
              ? 'text-c-faint hover:text-c-dim hover:bg-c-panel font-medium'
              : 'text-c-dim hover:text-c-text hover:bg-c-panel font-medium'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={small ? 14 : 16} weight={isActive ? 'fill' : 'regular'} />
          {label}
        </>
      )}
    </NavLink>
    </Tooltip>
  );
}

function Divider() {
  return <div className="mx-4 my-3 border-t border-c-border" />;
}
