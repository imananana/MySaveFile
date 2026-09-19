import { createContext, useContext, useState, type ReactNode } from 'react';
import { List, X } from '@phosphor-icons/react';

/**
 * Shared master/detail shell for the planner's list-rail + detail editors
 * (Clubs, Small Businesses, Venues, Holidays, Dynasties, Mods, …).
 *
 * At `lg` and up the rail sits inline exactly as before. Below `lg` — where a
 * fixed rail + detail pane no longer both fit (see the responsive audit) — the
 * rail collapses into an absolutely-positioned drawer over the detail area,
 * toggled by a `≡` button, so the detail pane always keeps the full width. This
 * keeps every editor usable down to the 768px desktop gate.
 *
 * Compound API keeps the editors' inline JSX order intact:
 *   <MasterDetail>
 *     <MasterDetail.Rail width="w-64"> …existing rail contents… </MasterDetail.Rail>
 *     <MasterDetail.Detail label="Holidays"> …existing detail pane… </MasterDetail.Detail>
 *   </MasterDetail>
 * `.Rail` REPLACES the old rail's outer div (it owns the width + drawer
 * positioning); `.Detail` WRAPS the existing detail pane and adds the toggle.
 */
interface Ctx { open: boolean; setOpen: (b: boolean) => void; }
const MasterDetailCtx = createContext<Ctx>({ open: false, setOpen: () => {} });

export function MasterDetail({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MasterDetailCtx.Provider value={{ open, setOpen }}>
      <div className="flex flex-1 min-h-0 relative">{children}</div>
    </MasterDetailCtx.Provider>
  );
}

/** The list rail. Inline at lg+, off-canvas drawer below lg. */
MasterDetail.Rail = function Rail({
  children,
  width = 'w-64',
}: {
  children: ReactNode;
  /** Literal Tailwind width class so the JIT keeps it. */
  width?: 'w-64' | 'w-72' | 'w-[300px]' | 'w-[340px]';
}) {
  const { open, setOpen } = useContext(MasterDetailCtx);
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close list"
          onClick={() => setOpen(false)}
          className="lg:hidden absolute inset-0 z-30 bg-black/40 border-none cursor-pointer"
        />
      )}
      <aside
        className={`${width} shrink-0 border-r border-c-border flex flex-col bg-c-card
          absolute inset-y-0 left-0 z-40 shadow-2xl transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:z-auto lg:shadow-none lg:translate-x-0 lg:transition-none`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close list"
          className="lg:hidden absolute top-2 right-2 z-10 w-7 h-7 rounded-md flex items-center justify-center text-c-dim hover:text-c-text hover:bg-c-panel bg-transparent border-none cursor-pointer"
        >
          <X size={15} weight="bold" />
        </button>
        {children}
      </aside>
    </>
  );
};

/** The detail pane. Full width below lg, with a toggle to reveal the rail. */
MasterDetail.Detail = function Detail({
  children,
  label = 'List',
}: {
  children: ReactNode;
  label?: string;
}) {
  const { setOpen } = useContext(MasterDetailCtx);
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="lg:hidden shrink-0 px-2 pt-2 bg-c-base">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-c-border bg-c-card px-2.5 py-1.5 text-xs font-semibold text-c-dim hover:text-c-text cursor-pointer transition-colors"
        >
          <List size={14} weight="bold" /> {label}
        </button>
      </div>
      {children}
    </div>
  );
};
