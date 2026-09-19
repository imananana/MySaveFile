import type { ReactNode } from 'react';
import { btn } from './btn';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, cta, secondary, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center px-6 py-12 ${className}`}>
      {/* bg-c-accent-soft rendered NOTHING — the colour tokens are var() hex, so
          Tailwind's opacity modifier can't build a colour from them and the
          medallion came out invisible. c-accent-soft is the real soft green. */}
      <div className="w-14 h-14 mb-4 rounded-full bg-c-accent-soft text-c-accent flex items-center justify-center">
        {icon}
      </div>
      <p className="text-base font-semibold text-c-text mb-1.5">{title}</p>
      <p className="text-[13px] text-c-muted max-w-sm leading-snug mb-5">{description}</p>
      {(cta || secondary) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {cta && (
            <button
              onClick={cta.onClick}
              className={btn('primary', { size: 'lg' })}
            >
              {cta.label}
            </button>
          )}
          {secondary && (
            <button
              onClick={secondary.onClick}
              className={btn('secondary', { size: 'lg' })}
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
