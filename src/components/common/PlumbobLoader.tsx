/**
 * Universal loader — a bobbing plumbob with optional radial glow.
 *
 * Replaces the plain "Loading…" text scattered through the app so every
 * waiting state carries the brand. The `lg` size is for full-screen route
 * loaders; `md` for section loaders inside a page; `sm` for inline contexts
 * like dropdowns and small list sections where the glow would be too noisy.
 *
 * The bob/glow keyframes live in src/index.css so any element with the
 * matching className picks them up — this component just sizes and stacks.
 */
export function PlumbobLoader({
  size = 'md',
  label,
}: {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const px = size === 'lg' ? 120 : size === 'md' ? 56 : 28;
  const glow = px + 28;
  const padding = size === 'lg' ? 'py-12' : size === 'md' ? 'py-6' : 'py-2';
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${padding}`}>
      <div className="relative flex items-center justify-center" style={{ height: px }}>
        {size !== 'sm' && (
          <div
            className="absolute plumbob-glow"
            style={{
              width: glow,
              height: glow,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(22,163,74,0.4) 0%, transparent 65%)',
            }}
          />
        )}
        <img
          src="/3d-clay-plumbob.svg"
          alt=""
          className="plumbob-bob relative block select-none"
          style={{ height: px, width: 'auto' }}
          draggable={false}
        />
      </div>
      {label && <p className="text-sm text-c-muted font-medium">{label}</p>}
    </div>
  );
}
