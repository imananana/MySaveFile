import type { TrendWeek } from '../../lib/adminApi';
import { weekLabel } from './adminFormat';

/**
 * Zone 3 — the last 12 weeks.
 *
 * Bars rather than a line: these are counts of things that happened inside a
 * week, not a value sampled at a moment, and a line drawn between weekly
 * totals invents a slope through days that had their own numbers.
 *
 * Empty weeks are real bars of height zero — the server fills the gaps with
 * generate_series precisely so a quiet fortnight reads as quiet instead of as
 * missing data.
 */
export function AdminTrends({ trends, hasImportEvents }: {
  trends: TrendWeek[];
  hasImportEvents: boolean;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-c-text tracking-headline m-0 mb-4">Last 12 weeks</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ★ The chart TITLE is the definition. "Active users per week" with
            "opened at least one save" underneath needed two lines to say what
            "Opened a save" says in three words — and the section heading
            already supplies "per week". */}
        <WeekBars
          title="New signups"
          tone="green"
          data={trends.map((t) => ({ weekStart: t.weekStart, value: t.signups }))}
        />
        <WeekBars
          title="Opened a save"
          tone="plum"
          data={trends.map((t) => ({ weekStart: t.weekStart, value: t.active }))}
        />
        {/* Both charts start the week logging shipped, so the weeks before it
            are genuinely empty rather than quiet. They only render once
            there's something to chart at all. */}
        {hasImportEvents && (
          <>
            <WeekBars
              title="Imports"
              tone="green"
              data={trends.map((t) => ({ weekStart: t.weekStart, value: t.imports }))}
            />
            <WeekBars
              title="Syncs"
              tone="plum"
              data={trends.map((t) => ({ weekStart: t.weekStart, value: t.resyncs }))}
            />
          </>
        )}
      </div>
    </section>
  );
}

export function WeekBars({ title, tone, data }: {
  title: string;
  tone: 'green' | 'plum';
  data: Array<{ weekStart: string; value: number }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fill = tone === 'green' ? 'bg-c-accent' : 'bg-c-secondary';
  const rail = tone === 'green' ? 'bg-c-accent-soft' : 'bg-c-secondary-soft';

  return (
    <div className="rounded-2xl border border-c-border bg-c-card px-[18px] py-[18px]">
      <p className="text-3xs font-bold uppercase tracking-label-lg text-c-dim m-0">{title}</p>

      <div className="flex items-end gap-1.5 mt-4 h-[110px]">
        {data.map((d) => (
          <div key={d.weekStart} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <span className="text-2xs text-c-dim tabular-nums mb-1">{d.value}</span>
            <div
              className={`w-full rounded-t-sm ${fill}`}
              style={{ height: `${Math.round((d.value / max) * 78)}%` }}
              title={`Week of ${weekLabel(d.weekStart)} · ${d.value}`}
            />
            {/* A 2px plinth under every bar, so a zero week reads as a week
                with nothing in it rather than as a week with no data. Those
                mean different things and otherwise look identical. */}
            <div className={`w-full rounded-t-sm ${rail}`} style={{ height: 2 }} />
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 mt-2">
        {data.map((d, i) => (
          <span
            key={d.weekStart}
            className="flex-1 text-center text-3xs text-c-faint tabular-nums truncate"
          >
            {/* Every other label, counted back from the end so the most
                recent week is always the one that keeps its date. Twelve dates
                in a row on a narrow card collapse into a grey smear. */}
            {(data.length - 1 - i) % 2 === 0 ? weekLabel(d.weekStart) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
