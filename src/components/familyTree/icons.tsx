/**
 * Line icons ported 1:1 from mockups/family/focus-v5.html — clean strokes,
 * no emoji (ghost cards especially: white card + line icon per the design).
 */

export function GhostIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 21V9a7 7 0 0 1 14 0v12l-2.3-1.8-2.4 1.8-2.3-1.8L9.7 21 7.3 19.2 5 21Z" fill="#fff" stroke="#7c5cbf" strokeWidth={1.7} />
      <circle cx={9.5} cy={10.5} r={1.1} fill="#7c5cbf" />
      <circle cx={14.5} cy={10.5} r={1.1} fill="#7c5cbf" />
    </svg>
  );
}

export function TombIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 22V11a6 6 0 0 1 12 0v11" fill="none" stroke="#8a8170" strokeWidth={1.7} />
      <path d="M4 22h16M12 8.5v5M9.5 11h5" stroke="#8a8170" strokeWidth={1.5} />
    </svg>
  );
}

export function PersonIcon({ size = 26, color = '#c2b8a6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="mx-auto">
      <circle cx={12} cy={8} r={4} fill={color} />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill={color} />
    </svg>
  );
}

export function SparkIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="shrink-0" aria-hidden="true">
      <path d="M12 2l2.4 7.1L22 12l-7.6 2.9L12 22l-2.4-7.1L2 12l7.6-2.9z" />
    </svg>
  );
}

export function StarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#d97706" className="shrink-0" aria-hidden="true">
      <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z" />
    </svg>
  );
}
