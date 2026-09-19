import { ArrowDown, ArrowUp, Minus } from '@phosphor-icons/react';
import type { AdminOverview, FunnelStage } from '../../lib/adminApi';
import { pct } from './adminFormat';

/**
 * Zone 2 — of everyone who signed up, how far did they get.
 *
 * ★ The two funnels sit side by side because all-time alone can't tell you
 * whether anything you changed helped: a 60% import rate over two years and a
 * 60% import rate this month are the same number describing different worlds.
 *
 * Colour has a LOCAL job here and only that job: green is the all-time cohort,
 * plum is the last-30-days one. Nothing about provenance is being said.
 *
 * ★ The stage that matters is "came back and synced again" — the planner
 * surviving contact with the real save is the whole product. It's marked, so
 * the eye lands on its drop first.
 */
const KEY_STAGE = 'resynced';

export function AdminFunnel({ funnel }: { funnel: AdminOverview['funnel'] }) {
  return (
    <section className="mb-8">
      {/* Five words, because "per person" genuinely changes how you read 13.
          The sentence that followed it — that a stage can be larger than the
          one above because verifying is a nudge not a gate — was explaining
          the data model to someone who just wants the numbers. It lives in
          docs/admin-dashboard-plan.md. */}
      <h2 className="text-base font-bold text-c-text tracking-headline m-0 mb-1">The funnel</h2>
      <p className="text-[13px] text-c-muted m-0 mb-4">Per person, not per save.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FunnelColumn title="All time" stages={funnel.allTime} tone="green" />
        <FunnelColumn title={`Signed up in the last ${funnel.recentDays} days`} stages={funnel.recent} tone="plum" />
      </div>
    </section>
  );
}

function FunnelColumn({ title, stages, tone }: {
  title: string;
  stages: FunnelStage[];
  tone: 'green' | 'plum';
}) {
  const top = stages[0]?.count ?? 0;
  const bar = tone === 'green' ? 'bg-c-accent' : 'bg-c-secondary';
  const rail = tone === 'green' ? 'bg-c-accent-soft' : 'bg-c-secondary-soft';

  return (
    <div className="rounded-2xl border border-c-border bg-c-card px-[18px] py-[18px]">
      <p className="text-3xs font-bold uppercase tracking-label-lg text-c-dim m-0 mb-4">{title}</p>

      {top === 0 && <p className="text-[13px] text-c-dim m-0">No accounts yet.</p>}

      {/* ★ The gap between stages lives on the STAGE, not on the drop marker.
          A drop can't be computed from a stage of zero (percent change from
          nothing is undefined), and when the marker carried the spacing, a
          stage's own note ended up sitting closer to the NEXT stage's label
          than to the bar it describes — reading as a caption for the wrong
          row. Same reason each note hugs its bar with mt-1 and the block
          below it clears by mb-4. */}
      {top > 0 && stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        const change = prev != null && prev > 0 ? Math.round(((s.count - prev) / prev) * 100) : null;
        const key = s.key === KEY_STAGE;
        return (
          <div key={s.key} className={i > 0 ? 'mt-4' : ''}>
            {change != null && (
              <div className="flex items-center gap-1 pl-0.5 mb-1.5 text-2xs text-c-dim tabular-nums">
                {change < 0
                  ? <ArrowDown size={10} weight="bold" />
                  : change > 0
                    ? <ArrowUp size={10} weight="bold" />
                    : <Minus size={10} weight="bold" />}
                {change > 0 ? `+${change}%` : `${change}%`}
              </div>
            )}
            <div className={key ? 'rounded-lg -mx-2 px-2 py-1.5 bg-c-panel' : ''}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className={`text-[13px] leading-tight ${key ? 'font-bold text-c-text' : 'text-c-muted'}`}>
                  {s.label}
                </span>
                <span className="shrink-0 text-[13px] tabular-nums">
                  <b className="font-bold text-c-text">{s.count}</b>
                  <span className="text-c-dim ml-1.5">{pct(s.count, top)}%</span>
                </span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${rail}`}>
                <span className={`block h-full rounded-full ${bar}`} style={{ width: `${pct(s.count, top)}%` }} />
              </div>
              {s.note && <p className="text-2xs text-c-dim m-0 mt-1">{s.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
