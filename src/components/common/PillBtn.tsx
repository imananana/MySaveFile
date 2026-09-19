import type { ReactNode } from 'react';
import { Plus, ArrowsLeftRight, ArrowCounterClockwise, ArrowsClockwise } from '@phosphor-icons/react';
import { Tooltip } from './Tooltip';

/**
 * The inline-action chassis: every add / swap / revert in the app is this pill.
 * You read the role from icon + colour:
 *
 *   green (accent)     = authoring → Add (+) · Swap (⇄)
 *   purple (secondary) = reverting → (↺), the same axis as the edited-field
 *                        marker; amber stays warnings-only
 *
 * Icon-only for cohesion, so the meaning — and any saved value worth showing —
 * rides in the tooltip.
 *
 * ★ Which is exactly why this lives in common/ now. It was written inside
 * SimPanel, imported by nobody, while notes described it as "the PillBtn
 * control family" — a family of one. Worse, an icon-only control whose ONLY
 * label was a native `title` meant the meaning appeared after a browser delay,
 * in an OS bubble nothing else in the app looks like. The real Tooltip is built
 * in here so no call site can forget it, and `aria-label` stays for anyone not
 * hovering at all.
 */
const ADD_ICON = <Plus size={13} weight="bold" />;
const SWAP_ICON = <ArrowsLeftRight size={13} weight="bold" />;
/** Exported for the few bespoke revert controls that carry their own count. */
export const REVERT_ICON = <ArrowCounterClockwise size={12} weight="bold" />;

export function PillBtn({ icon, role, title, onClick, count, disabled }: {
  icon: ReactNode;
  role: 'author' | 'revert';
  /** Names the action. Shown on hover and read out as the accessible name. */
  title: string;
  onClick: () => void;
  count?: number;
  disabled?: boolean;
}) {
  const tone = role === 'revert'
    ? 'text-c-secondary bg-c-secondary-soft hover:border-c-secondary'
    : 'text-c-accent bg-c-accent-soft hover:border-c-accent';
  return (
    <Tooltip text={title}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={title}
        className={`shrink-0 inline-flex items-center justify-center gap-1 h-7 rounded-full border border-c-border text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default ${count != null ? 'px-2.5' : 'w-7'} ${tone}`}
      >
        {icon}
        {count != null && <span>{count}</span>}
      </button>
    </Tooltip>
  );
}

/**
 * Action pills for one row, glued so line-wrap can NEVER separate them — the
 * add/swap and revert pair always land on the same line together.
 */
export const PillGroup = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 shrink-0">{children}</span>
);

/** Shorthands, so call sites read as intent rather than props. */
export const AddBtn = ({ title, onClick, disabled }: { title: string; onClick: () => void; disabled?: boolean }) =>
  <PillBtn icon={ADD_ICON} role="author" title={title} onClick={onClick} disabled={disabled} />;

export const SwapBtn = ({ title, onClick, disabled }: { title: string; onClick: () => void; disabled?: boolean }) =>
  <PillBtn icon={SWAP_ICON} role="author" title={title} onClick={onClick} disabled={disabled} />;

/**
 * Randomize (⟳). Authoring, so it's green like Add and Swap — the creation
 * modal had built its own byte-identical copy of this pill next to its own
 * copy of Add, both with native tooltips.
 */
export const RerollBtn = ({ title, onClick, disabled }: { title: string; onClick: () => void; disabled?: boolean }) =>
  <PillBtn icon={<ArrowsClockwise size={13} weight="bold" />} role="author" title={title} onClick={onClick} disabled={disabled} />;

export const RevertBtn = ({ savedDisplay, title, onClick, disabled }: {
  savedDisplay?: string | null; title?: string; onClick: () => void; disabled?: boolean;
}) => (
  <PillBtn
    icon={REVERT_ICON}
    role="revert"
    title={title ?? (savedDisplay != null ? `Revert to save · ${savedDisplay}` : 'Revert to save')}
    onClick={onClick}
    disabled={disabled}
  />
);
