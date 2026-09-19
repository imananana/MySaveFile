import { WarningCircle, CheckCircle } from '@phosphor-icons/react';
import type { ImportFailure } from '../../lib/adminApi';
import { timeAgo } from './adminFormat';

/**
 * Attempts that didn't land.
 *
 * ★ This is the reason item 4 exists. A failed import was invisible: the
 * player hit an error, left, and unless Sentry happened to catch the exception
 * nobody ever knew it happened. One line each — who, which save, when, what
 * broke. The stack stays in Sentry; this is for NOTICING, not for debugging.
 *
 * "Wrong file" rows are failures too, and belong here: someone picking a
 * .package three times in a row is a picker problem, not a parser one, and
 * that's only visible if the misses are recorded next to the crashes.
 */
export function AdminFailures({ failures }: { failures: ImportFailure[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-c-text tracking-headline m-0 mb-4">Recent failures</h2>

      {failures.length === 0 ? (
        <div className="rounded-2xl border border-c-border bg-c-card px-[18px] py-5 flex items-center gap-2.5">
          <CheckCircle size={18} weight="duotone" className="text-c-accent shrink-0" />
          <p className="text-[13px] text-c-muted m-0">
            Nothing has failed since logging started.
          </p>
        </div>
      ) : (
        <ul className="list-none m-0 p-0 rounded-2xl border border-c-border bg-c-card overflow-hidden">
          {failures.map((f) => (
            <li key={f.id} className="flex items-start gap-3 px-[18px] py-3 border-b border-c-border last:border-b-0">
              <WarningCircle size={16} weight="duotone" className="text-c-warn shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[13px] font-semibold text-c-text">{f.user}</span>
                  <span className="text-[13px] text-c-dim">
                    {f.kind === 'resync' ? 'sync' : 'import'}
                    {f.saveName ? ` · ${f.saveName}` : ''}
                  </span>
                  <span className="text-2xs text-c-faint ml-auto shrink-0">{timeAgo(f.at)}</span>
                </div>
                <p className="text-xs text-c-muted m-0 mt-0.5 break-words">{f.reason}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
