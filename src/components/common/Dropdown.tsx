import { useState, useRef, useEffect, useLayoutEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, Check } from '@phosphor-icons/react';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: ReactNode; // optional leading visual (phosphor icon, img, etc.)
}

/**
 * App-standard dropdown. Replaces native <select> so menus match our styling
 * (tokens, rounded, accent-selected) instead of the OS chrome. Keyboard:
 * Enter/Space/ArrowDown opens; Arrow keys move; Enter selects; Esc closes.
 * Closes on outside click. The menu is absolutely positioned — fine inside
 * normal flow; if a parent clips overflow, give it room or revisit with a portal.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  className = '',
  disabled = false,
  ariaLabel,
  compact = false,
  edited = false,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Quieter, smaller trigger for secondary filters (list-rail pickers). */
  compact?: boolean;
  /** Purple (secondary) border — the field-state grammar's Edited treatment (differs from the save). */
  edited?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  // The menu is PORTALED to <body> so an overflow-clipping ancestor (modals,
  // scroll panes) can't cut it off. Position it under the trigger with fixed
  // coords, flipping above when there's no room below.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 264 && r.top > spaceBelow;
    setMenuStyle({
      position: 'fixed',
      left: r.left,
      minWidth: r.width,
      ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    // A fixed menu doesn't follow scroll — close it rather than let it detach.
    // But the listener is capture-phase, so it also fires when the user scrolls
    // WITHIN the menu's own option list; that must NOT close it. Only a real
    // page/ancestor scroll or a resize closes.
    function onScrollOrResize(e: Event) {
      if (e.type === 'scroll' && e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, value, options]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      // Swallow it: an open menu inside a modal owns Escape, and letting it
      // through would close the menu AND the modal behind it in one press.
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = options[activeIdx];
      if (o) choose(o.value);
    }
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`w-full inline-flex items-center justify-between gap-2 bg-c-base border rounded-md cursor-pointer transition-colors hover:border-c-accent focus:outline-none focus:border-c-accent disabled:opacity-60 disabled:cursor-default ${edited ? 'border-c-secondary' : 'border-c-border'} ${compact ? 'px-2.5 py-1 text-[11px] text-c-dim' : 'px-3 py-1.5 text-sm text-c-text'}`}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          {selected?.icon}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <CaretDown size={13} weight="bold" className={`text-c-faint shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={menuStyle}
          className="z-[400] w-max max-w-[280px] max-h-64 overflow-y-auto bg-c-card border border-c-border rounded-lg shadow-lg py-1"
        >
          {options.map((o, i) => {
            const isSel = o.value === value;
            const isActive = i === activeIdx;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center gap-2 text-left text-sm px-3 py-1.5 cursor-pointer border-none transition-colors ${
                  isSel ? 'text-c-green font-semibold' : 'text-c-text'
                } ${isActive ? 'bg-c-panel' : 'bg-transparent'}`}
              >
                {o.icon}
                <span className="flex-1 truncate">{o.label}</span>
                {isSel && <Check size={13} weight="bold" className="text-c-green shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
