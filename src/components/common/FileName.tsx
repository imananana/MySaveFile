/**
 * A filename or path, rendered in the app's own typeface.
 *
 * We had three treatments for this and all three dragged in a second font:
 * `<code>` with no font-family falls back to whatever monospace the viewer's
 * OS happens to pick, so `localthumbcache.package` and `Slot_0000000a.save`
 * arrived in a face nobody chose and that matches nothing else on screen.
 *
 * A filename in this app isn't code you'd copy — it's a thing you go and find
 * in Finder. So it stays in Plus Jakarta Sans and earns its distinction from
 * weight and a quiet chip instead. `tabular` keeps the digit-heavy save names
 * (`Slot_0000000a`) from shifting around.
 *
 * The `tone` is deliberately named for colour, not meaning: green and plum do
 * a different job on nearly every screen in this app, so the caller decides.
 */
export function FileName({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'green' | 'plum';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-c-panel border-c-border text-c-text',
    green: 'bg-c-accent-soft border-c-accent-border text-c-green',
    plum: 'bg-c-secondary-soft border-c-secondary-border text-c-secondary',
  };
  return (
    <span
      className={`inline-block rounded-md border px-1.5 py-px text-[0.94em] font-semibold tabular-nums ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A filesystem path, broken at the separators so a long one wraps at sensible
 * points instead of running off the edge. Same typeface rule as above.
 *
 *   <FilePath parts={['Documents', 'Electronic Arts', 'The Sims 4', 'saves']} />
 */
export function FilePath({ parts }: { parts: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 align-baseline">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-c-faint" aria-hidden>›</span>}
          <span className="font-semibold text-c-text">{p}</span>
        </span>
      ))}
    </span>
  );
}
