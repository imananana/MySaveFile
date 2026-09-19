/**
 * Single-line text input with a leading @ glyph, for a username that is NOT a
 * link — gallery creators on photo uploads, and your own Sims Gallery ID.
 *
 * The @ is doing real work: the profile's Gallery field used to be a plain box
 * sitting directly under a column of URL fields, so it read as one, and people
 * pasted URLs into it. This says "name, not address" before anyone types.
 */
export function AtInput({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  tone = 'base',
}: {
  value: string;
  onChange: (v: string) => void;
  /** Fires when focus leaves — where any tidying of pasted input belongs, so
   *  cleanup never fights someone mid-keystroke. */
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  /**
   * A control is always the opposite tone from the surface behind it: `base`
   * (tinted) on a white card, `card` (white) on a tinted body. Left at the
   * default on a tinted modal body, this field sinks into it while every
   * sibling field stays white.
   */
  tone?: 'base' | 'card';
}) {
  return (
    <div className={`flex items-center border border-c-border rounded-lg overflow-hidden focus-within:border-c-accent ${tone === 'card' ? 'bg-c-card' : 'bg-c-base'} ${className ?? ''}`}>
      <span className="px-2 text-sm text-c-dim select-none">@</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="flex-1 py-2 pr-3 text-sm text-c-text bg-transparent focus:outline-none placeholder:text-c-faint"
      />
    </div>
  );
}
