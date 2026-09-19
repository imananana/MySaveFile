import { ArrowSquareOut } from '@phosphor-icons/react';
import { PACKS } from '../../data/packs';
import type { AdminStats, PackTally, ShowcaseViews } from '../../lib/adminApi';
import { dateLabel, pct } from './adminFormat';

const PACK_NAMES = new Map(PACKS.map((p) => [p.id, p.name]));

/**
 * Below the fold — what people actually use, and what they own.
 *
 * This is the roadmap half of the page: adoption answers "which parsers earned
 * their keep", pack popularity answers "which pack should the next gate cover".
 */
export function AdminStatsPanel({ stats }: { stats: AdminStats }) {
  const { adoption, usage, packs, photos, trash, showcaseViews } = stats;

  return (
    <section className="mb-10">
      <h2 className="text-base font-bold text-c-text tracking-headline m-0 mb-4">Features and content</h2>

      {/* Two columns, not two rows: the save-contents card has four rows and
          the usage card has ten, so side by side they left a card-height void.
          Packs stack under the short one and take up the slack. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3 items-start">
        <div className="flex flex-col gap-3">
          {/* ★ TWO cards, because these answer two different questions and one
              list made them look comparable. "Clubs 92%" is about the SAVE —
              the game gave us clubs to read — and says nothing about whether
              anyone opened the clubs page. "Uploaded inspo photos 27%" is
              about the PERSON. Different subject, different denominator. */}
          <MeterCard
            title="What their saves had in them"
            denominator={`of ${adoption.importedSaves} imported saves`}
            rows={adoption.features}
            total={adoption.importedSaves}
            tone="green"
          />

          <div className="rounded-2xl border border-c-border bg-c-card px-[18px] py-[18px]">
            <p className="text-3xs font-bold uppercase tracking-label-lg text-c-dim m-0 mb-4">Pack popularity</p>
            {/* ★ Two rankings, never one. Ownership is what a person installed;
                detection is what a save actually used. A pack can be owned by
                everyone and used by nobody, and that difference is the whole
                signal — adding the two together produces a ranking of neither. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <PackColumn title={`Installed by ${packs.users} users`} tally={packs.ownedBy} total={packs.users} tone="green" />
              <PackColumn title={`Used in ${packs.saves} saves`} tally={packs.detectedIn} total={packs.saves} tone="plum" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <MeterCard
            title="What people do in the planner"
            denominator={`of ${usage.usersWithSaves} people with a save`}
            rows={usage.features}
            total={usage.usersWithSaves}
            tone="plum"
            loggedSince={usage.loggedSince}
          />

          {/* ★ The moment after an import. The import drops people on the
              overview and goes quiet; this says where they went next — and the
              last row is the ones who went nowhere, which is the number the
              card exists for. Hidden until the first event ever lands, same
              reasoning as the imports tile. */}
          {stats.firstStop && (
            <MeterCard
              title="First stop after importing"
              denominator={`of ${stats.firstStop.imported} importers since ${dateLabel(stats.firstStop.since)}`}
              rows={firstStopRows(stats.firstStop)}
              total={stats.firstStop.imported}
              tone="plum"
            />
          )}
        </div>
      </div>

      <ShowcaseViewsCard rows={showcaseViews} />

      <div className="rounded-2xl border border-c-border bg-c-card px-[18px] py-[18px] mt-3">
        {/* ★ A list, not a sentence. Seven unrelated numbers strung into prose
            ("444 inspo and 116 showcase photos uploaded by 5 people, largest
            library 276 photos. Separately, 822 household portraits…") makes
            you parse grammar to find a figure. Every other number on this page
            sits on its own line against its label; these had no reason not to. */}
        <p className="text-3xs font-bold uppercase tracking-label-lg text-c-dim m-0 mb-3">Photos and trash</p>
        <FactList
          rows={[
            { label: 'Inspo photos', n: photos.inspo },
            { label: 'Showcase photos', n: photos.built },
            { label: 'People who have uploaded', n: photos.uploaders },
            { label: 'Largest single library', n: photos.largestLibrary },
            { label: 'Portraits synced from the game', n: photos.portraits },
            { label: 'Saves in the trash', n: trash.deleted },
            { label: 'Auto-backups still held', n: trash.autoBackups },
          ]}
        />
      </div>
    </section>
  );
}

/**
 * The first_stop_* tally as meter rows, in a fixed order (people, not size —
 * a stable card is scannable across visits), with the residue row last.
 *
 * "Stayed on the overview" = importers minus people who logged ANY stop.
 * `moved` is distinct people across all destinations, so someone whose two
 * imports went two different ways can't push the residue negative — and the
 * max(0, …) guards the one other way it could go under: an import from before
 * an event of theirs, straddling the day logging began.
 */
const FIRST_STOP_LABELS: Array<{ key: string; label: string }> = [
  { key: 'first_stop_world',      label: 'Opened a world map' },
  { key: 'first_stop_sims',       label: 'Opened the sim roster' },
  { key: 'first_stop_households', label: 'Opened their households' },
  { key: 'first_stop_family',     label: 'Opened the family tree' },
  { key: 'first_stop_photos',     label: 'Opened photos' },
  { key: 'first_stop_other',      label: 'Went somewhere else' },
];

function firstStopRows(fs: NonNullable<AdminStats['firstStop']>) {
  const byKey = new Map(fs.stops.map((s) => [s.key, s.people]));
  return [
    ...FIRST_STOP_LABELS.map((l) => ({ key: l.key, label: l.label, count: byKey.get(l.key) ?? 0 })),
    {
      key: 'stayed',
      label: 'Stayed on the overview',
      count: Math.max(0, fs.imported - fs.moved),
      note: 'Imported, then never opened another page',
    },
  ];
}

function MeterCard({ title, denominator, rows, total, tone, loggedSince }: {
  title: string;
  denominator: string;
  rows: Array<{ key: string; label: string; note?: string; count: number; loggedOnly?: boolean; thisWeek?: number | null }>;
  total: number;
  tone: 'green' | 'plum';
  /** Present only on the usage card; dates its logging-only rows. */
  loggedSince?: string | null;
}) {
  const bar = tone === 'green' ? 'bg-c-accent' : 'bg-c-secondary';
  const rail = tone === 'green' ? 'bg-c-accent-soft' : 'bg-c-secondary-soft';
  return (
    <div className="rounded-2xl border border-c-border bg-c-card px-[18px] py-[18px]">
      {/* The denominator is a FACT on the header line, not a sentence
          underneath explaining the arithmetic. */}
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <p className="text-3xs font-bold uppercase tracking-label-lg text-c-dim m-0">{title}</p>
        <p className="text-3xs font-bold uppercase tracking-label-lg text-c-faint m-0 tabular-nums shrink-0">
          {denominator}
        </p>
      </div>
      {rows.map((f) => (
        <div key={f.key} className="mb-4 last:mb-0">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-[13px] text-c-muted leading-tight">{f.label}</span>
            <span className="shrink-0 text-[13px] tabular-nums">
              <b className="font-bold text-c-text">{pct(f.count, total)}%</b>
              <span className="text-c-dim ml-1.5">{f.count}</span>
            </span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${rail}`}>
            <span className={`block h-full rounded-full ${bar}`} style={{ width: `${pct(f.count, total)}%` }} />
          </div>
          {/* One line under the bar, whatever it has to say. The caveat where
              the number means less than it looks, the window where the row is
              counted from logging alone, and the this-week figure — which only
              appears where something actually logs it, so a row with nothing
              to add never prints "0 this week" as though it did. */}
          {(f.note || (f.loggedOnly && loggedSince) || (f.thisWeek ?? 0) > 0) && (
            <p className="text-2xs text-c-faint m-0 mt-1">
              {[
                f.note,
                f.loggedOnly && loggedSince ? `Counted from ${dateLabel(loggedSince)}` : null,
                (f.thisWeek ?? 0) > 0 ? `${f.thisWeek} this week` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Label left, number right, one per line — the page's rhythm everywhere else. */
function FactList({ rows }: { rows: Array<{ label: string; n: number }> }) {
  return (
    <ul className="list-none m-0 p-0">
      {rows.map((r) => (
        <li
          key={r.label}
          className="flex items-baseline justify-between gap-4 py-1.5 border-b border-c-border last:border-b-0"
        >
          <span className="text-[13px] text-c-muted leading-tight">{r.label}</span>
          {/* A zero is real information, but it shouldn't shout. */}
          <span className={`shrink-0 text-[13px] font-bold tabular-nums ${r.n > 0 ? 'text-c-text' : 'text-c-faint'}`}>
            {r.n}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Top packs by count. A pack nobody has is simply absent — a list of zeroes
 *  down to SP17 is thirty rows saying the same nothing. */
function PackColumn({ title, tally, total, tone }: {
  title: string;
  tally: PackTally[];
  total: number;
  tone: 'green' | 'plum';
}) {
  const bar = tone === 'green' ? 'bg-c-accent' : 'bg-c-secondary';
  const rail = tone === 'green' ? 'bg-c-accent-soft' : 'bg-c-secondary-soft';
  const top = tally.slice(0, 12);

  return (
    <div>
      <p className="text-2xs font-semibold text-c-muted m-0 mb-2.5">{title}</p>
      {top.length === 0 && <p className="text-2xs text-c-dim m-0">Nothing recorded yet.</p>}
      {top.map((p) => (
        <div key={p.id} className="mb-2 last:mb-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-2xs text-c-muted truncate">{PACK_NAMES.get(p.id) ?? p.id}</span>
            <span className="text-2xs text-c-dim tabular-nums shrink-0">{p.count}</span>
          </div>
          <div className={`h-1.5 rounded-full overflow-hidden ${rail}`}>
            <span className={`block h-full rounded-full ${bar}`} style={{ width: `${pct(p.count, total)}%` }} />
          </div>
        </div>
      ))}
      {tally.length > top.length && (
        <p className="text-2xs text-c-faint m-0 mt-2">+{tally.length - top.length} more</p>
      )}
    </div>
  );
}

/**
 * Views per live showcase.
 *
 * ★ Counted, never surfaced to the creator — that's a deliberate later
 * decision, not an oversight. The tally holds no visitor identity at all
 * (see showcase_views in schema.sql): it counts views, not people.
 *
 * A save's older slugs are folded in, so a rename doesn't reset the number.
 */
function ShowcaseViewsCard({ rows }: { rows: ShowcaseViews[] }) {
  return (
    <div className="rounded-2xl border border-c-border bg-c-card px-[18px] py-[18px]">
      {/* "Not shown to creators" stays: it's a policy you could otherwise
          assume the wrong way round. "Owners viewing their own page don't
          count" went — that's how the number is built, not what it means. */}
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <p className="text-3xs font-bold uppercase tracking-label-lg text-c-dim m-0">Showcase views</p>
        <p className="text-3xs font-bold uppercase tracking-label-lg text-c-faint m-0 shrink-0">Not shown to creators</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-c-dim m-0">No live showcases yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="text-3xs font-bold uppercase tracking-label-lg text-c-dim text-left pb-2 pr-4">Showcase</th>
                <th className="text-3xs font-bold uppercase tracking-label-lg text-c-dim text-right pb-2 pl-4">7 days</th>
                <th className="text-3xs font-bold uppercase tracking-label-lg text-c-dim text-right pb-2 pl-4">30 days</th>
                <th className="text-3xs font-bold uppercase tracking-label-lg text-c-dim text-right pb-2 pl-4">All time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug} className="border-t border-c-border">
                  <td className="py-2 pr-4">
                    <a
                      href={`/s/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-c-text hover:text-c-secondary no-underline"
                    >
                      {r.saveName}
                      <ArrowSquareOut size={11} weight="bold" className="text-c-faint" />
                    </a>
                    <span className="text-c-dim ml-2">{r.creator}</span>
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums text-c-text">{r.last7}</td>
                  <td className="py-2 pl-4 text-right tabular-nums text-c-muted">{r.last30}</td>
                  <td className="py-2 pl-4 text-right tabular-nums text-c-muted">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
