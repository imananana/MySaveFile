/**
 * Renders a dynasty crest the way the game composes it: the foreground symbol
 * (transparent PNG) stacked on top of the background shield (shape + color).
 * Both assets are 128x128 in /dynasty-crests/, so a same-size overlay matches
 * the in-game crest 1:1. Pass the resolved asset names (see resolveCrest()).
 */

interface DynastyCrestProps {
  /** bg asset name, e.g. "crest_bg_style3_green" */
  bg?: string | null;
  /** fg asset name, e.g. "crest_fg_plantain" */
  fg?: string | null;
  size?: number;
  className?: string;
  title?: string;
}

export function DynastyCrest({ bg, fg, size = 40, className = '', title }: DynastyCrestProps) {
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={title}
    >
      {bg ? (
        <img src={`/dynasty-crests/${bg}.png`} alt="" className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        // Fallback shield when the background can't be resolved.
        <div className="absolute inset-0 rounded-md bg-c-panel border border-c-border" />
      )}
      {fg && (
        <img src={`/dynasty-crests/${fg}.png`} alt="" className="absolute inset-0 w-full h-full object-contain" />
      )}
    </div>
  );
}
