import { useEffect, useState } from 'react';
import { Users, UserPlus, CursorClick, Broadcast, Globe, Database, ArrowsClockwise } from '@phosphor-icons/react';
import { StatTile } from '../../components/common/OverviewTiles';
import { adminApi, type AdminOnline, type AdminOverview } from '../../lib/adminApi';
import { formatBytes, timeAgo } from './adminFormat';

const ONLINE_POLL_MS = 30_000;

/**
 * Zone 1 — this week at a glance.
 *
 * Reuses the app's StatTile so these read as the same object as the manager
 * pages' overview tiles rather than as a second, admin-only stat card.
 *
 * ★ "Online right now" is the one tile that must be CURRENT rather than
 * merely recent: its whole job is answering "is anyone in there, is it safe to
 * deploy?". It re-polls its own endpoint every 30s while the page is open, and
 * names the people rather than only counting them — three strangers and three
 * of your testers are very different answers to that question.
 */
export function AdminTiles({ tiles, initialOnline }: {
  tiles: AdminOverview['tiles'];
  initialOnline: AdminOnline;
}) {
  const [online, setOnline] = useState(initialOnline);
  const [showWho, setShowWho] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      adminApi.online().then(setOnline).catch(() => { /* keep the last good number */ });
    }, ONLINE_POLL_MS);
    return () => clearInterval(id);
  }, []);

  const weekDelta = tiles.newThisWeek - tiles.newLastWeek;

  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-c-text tracking-headline m-0 mb-4">This week</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatTile
          label="Total accounts"
          value={tiles.totalAccounts}
          tone="green"
          icon={<Users size={20} weight="duotone" />}
        />
        <StatTile
          label="New this week"
          value={tiles.newThisWeek}
          sub={`${weekDelta >= 0 ? '+' : ''}${weekDelta} vs last week`}
          tone="green"
          icon={<UserPlus size={20} weight="duotone" />}
        />
        {/* The label names the thing measured, so the sub is free to be a
            comparison instead of a definition. "Active this week" needed
            "opened a save" spelled out underneath; this doesn't. */}
        <StatTile
          label="Opened a save"
          value={tiles.activeThisWeek}
          sub={`${tiles.activeLastWeek} last week`}
          tone="green"
          icon={<CursorClick size={20} weight="duotone" />}
        />
        <StatTile
          label="Online right now"
          value={online.count}
          sub={
            online.count > 0 ? (
              <button
                type="button"
                onClick={() => setShowWho((v) => !v)}
                className="text-2xs text-c-secondary font-semibold bg-transparent border-none p-0 cursor-pointer hover:underline"
              >
                {showWho ? 'Hide names' : 'Show who'}
              </button>
            ) : (
              'nobody in the last 15 min'
            )
          }
          tone="plum"
          icon={<Broadcast size={20} weight="duotone" />}
        />
        <StatTile
          label="Live showcases"
          value={tiles.liveShowcases}
          tone="plum"
          icon={<Globe size={20} weight="duotone" />}
        />
        <StatTile
          label="Database"
          value={formatBytes(tiles.dbSizeBytes)}
          sub="Railway volume"
          tone="neutral"
          icon={<Database size={20} weight="duotone" />}
        />
        {/* Absent, not zero, until logging has ever run here. "0 imports this
            week" reads as a dead product; a missing tile reads as a feature
            that isn't deployed yet, which is what it would mean. */}
        {tiles.imports && (
          <StatTile
            label="Imports & syncs"
            value={tiles.imports.ok}
            sub={tiles.imports.failed > 0
              ? `${tiles.imports.failed} failed this week`
              : 'none failed this week'}
            tone="green"
            icon={<ArrowsClockwise size={20} weight="duotone" />}
          />
        )}
      </div>

      {showWho && online.count > 0 && (
        <div className="mt-3 rounded-2xl border border-c-border bg-c-card px-[18px] py-4">
          <p className="text-3xs font-bold uppercase tracking-label-lg text-c-dim m-0 mb-2.5">
            In the app in the last 15 minutes
          </p>
          <ul className="list-none m-0 p-0 flex flex-wrap gap-x-6 gap-y-1.5">
            {online.users.map((u) => (
              <li key={u.id} className="text-[13px] text-c-text">
                {u.name}
                <span className="text-c-dim ml-1.5">{timeAgo(u.lastSeen)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
