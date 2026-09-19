import { useMemo, useState } from 'react';
import { CaretDown, CaretRight, CaretUp, CheckCircle, ArrowSquareOut } from '@phosphor-icons/react';
import { Pill } from '../../components/common/Pill';
import type { AdminUser, AdminUserSave } from '../../lib/adminApi';
import { dateLabel, timeAgo } from './adminFormat';

/**
 * Zone 4 — everyone, newest first, with their saves one click away.
 *
 * ★ Sorting is the drill-down. Sorted by last seen this is "who's still here";
 * by sims it's "who's most invested"; by saves it's "who's stress-testing it".
 * That's why there's no separate most-active-saves widget — it would be this
 * table with one column pre-sorted.
 *
 * Everything here is read-only. Nothing on this page can change a user's row.
 */

type SortKey = 'createdAt' | 'lastSeen' | 'name' | 'saveCount' | 'simCount'
  | 'inspoCount' | 'builtCount' | 'portraitCount';

interface Column {
  key: SortKey;
  label: string;
  /** Numbers and dates read right-aligned; names read left. */
  numeric?: boolean;
}

// ★ Three photo columns, not one. photos.type is only 'inspo' or 'built', and
// household portraits live outside that table entirely (thumbnail_filename,
// written by the localthumbcache sync). A single "Photos" total added three
// unrelated behaviours together and answered none of them.
const COLUMNS: Column[] = [
  { key: 'name',          label: 'User' },
  { key: 'createdAt',     label: 'Signed up', numeric: true },
  { key: 'lastSeen',      label: 'Last seen', numeric: true },
  { key: 'saveCount',     label: 'Saves',     numeric: true },
  { key: 'simCount',      label: 'Sims',      numeric: true },
  { key: 'inspoCount',    label: 'Inspo',     numeric: true },
  { key: 'builtCount',    label: 'Showcase',  numeric: true },
  { key: 'portraitCount', label: 'Portraits', numeric: true },
];

function sortValue(u: AdminUser, key: SortKey): number | string {
  switch (key) {
    case 'name':      return (u.name || u.email).toLowerCase();
    case 'createdAt': return new Date(u.createdAt).getTime();
    // Never seen sorts last under "most recent first", which is where someone
    // who signed up and never came back belongs.
    case 'lastSeen':  return u.lastSeen ? new Date(u.lastSeen).getTime() : 0;
    default:          return u[key];
  }
}

export function AdminUsers({ users }: { users: AdminUser[] }) {
  const [sort, setSort] = useState<SortKey>('createdAt');
  const [asc, setAsc] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Two counts, because they answer two questions and only one of them is the
  // number the rest of the page uses. The heading count has to agree with the
  // Accounts tile — both are real users — so ours are counted apart rather
  // than folded in and silently disagreeing by two.
  const oursCount = useMemo(() => users.filter((u) => u.internal).length, [users]);

  const rows = useMemo(() => {
    const copy = [...users];
    copy.sort((a, b) => {
      const va = sortValue(a, sort);
      const vb = sortValue(b, sort);
      const cmp = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb);
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [users, sort, asc]);

  function toggleSort(key: SortKey) {
    if (key === sort) { setAsc((v) => !v); return; }
    setSort(key);
    // A new column starts on the reading you'd want from it: newest date,
    // biggest number, A–Z name.
    setAsc(key === 'name');
  }

  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-base font-bold text-c-text tracking-headline m-0">Users</h2>
        <Pill tone="neutral" tabular>{users.length - oursCount}</Pill>
        {oursCount > 0 && (
          <Pill tone="purple" caps title="Your own accounts. Listed here, and left out of every number on this page.">
            +{oursCount} ours
          </Pill>
        )}
      </div>

      <div className="rounded-2xl border border-c-border bg-c-card overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`text-3xs font-bold uppercase tracking-label-lg text-c-dim px-4 py-3 border-b border-c-border whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={`inline-flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer uppercase tracking-label-lg text-3xs font-bold transition-colors ${sort === c.key ? 'text-c-secondary' : 'text-c-dim hover:text-c-text'}`}
                  >
                    {c.label}
                    {sort === c.key && (asc ? <CaretUp size={9} weight="bold" /> : <CaretDown size={9} weight="bold" />)}
                  </button>
                </th>
              ))}
              {/* "Live page", not "Showcase" — the photo column two along is
                  already called Showcase, and two columns of the same name in
                  one header row means neither one names anything. */}
              <th className="text-3xs font-bold uppercase tracking-label-lg text-c-dim text-left px-4 py-3 border-b border-c-border whitespace-nowrap">
                Live page
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const expanded = open === u.id;
              return (
                <UserRows
                  key={u.id}
                  user={u}
                  expanded={expanded}
                  onToggle={() => setOpen(expanded ? null : u.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserRows({ user, expanded, onToggle }: {
  user: AdminUser;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-c-panel border-b border-c-border"
      >
        <td className="px-4 py-3 align-top">
          <div className="flex items-start gap-2">
            {expanded
              ? <CaretDown size={11} weight="bold" className="text-c-faint mt-1 shrink-0" />
              : <CaretRight size={11} weight="bold" className="text-c-faint mt-1 shrink-0" />}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-c-text">{user.name || 'Unnamed'}</span>
                {user.emailVerified && (
                  <CheckCircle size={13} weight="fill" className="text-c-accent shrink-0" aria-label="Email verified" />
                )}
                {/* Kept in the table so its saves stay one click away, but it
                    counts toward nothing else on the page. */}
                {user.internal && <Pill tone="purple" caps>Ours</Pill>}
              </div>
              <span className="text-c-dim break-all">{user.email || '—'}</span>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right align-top text-c-muted whitespace-nowrap">{dateLabel(user.createdAt)}</td>
        <td className="px-4 py-3 text-right align-top whitespace-nowrap">
          <span className={user.lastSeen ? 'text-c-muted' : 'text-c-faint'}>{timeAgo(user.lastSeen)}</span>
        </td>
        <td className="px-4 py-3 text-right align-top tabular-nums whitespace-nowrap">
          <b className="text-c-text font-semibold">{user.saveCount}</b>
          <span className="text-c-dim ml-1.5">{user.importedCount} imported</span>
        </td>
        <td className="px-4 py-3 text-right align-top tabular-nums text-c-text">{user.simCount}</td>
        <Count n={user.inspoCount} />
        <Count n={user.builtCount} />
        <Count n={user.portraitCount} />
        <td className="px-4 py-3 align-top whitespace-nowrap">
          {user.showcaseSlug ? (
            <a
              href={`/s/${user.showcaseSlug}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-c-secondary hover:underline no-underline"
            >
              /s/{user.showcaseSlug}
              <ArrowSquareOut size={11} weight="bold" />
            </a>
          ) : (
            <span className="text-c-faint">—</span>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-c-border">
          {/* Indented to start under the user's name, not at the table's
              edge — flush left, the save list read as a row of its own rather
              than as the expansion of the one above it. */}
          <td colSpan={COLUMNS.length + 1} className="bg-c-panel pl-[42px] pr-4 py-3">
            {user.saves.length === 0
              ? <p className="text-c-dim m-0">No saves — signed up and left.</p>
              : <SaveList saves={user.saves} />}
          </td>
        </tr>
      )}
    </>
  );
}

/** A zero is real information here, but it shouldn't shout — dim it. */
function Count({ n }: { n: number }) {
  return (
    <td className={`px-4 py-3 text-right align-top tabular-nums ${n > 0 ? 'text-c-text' : 'text-c-faint'}`}>
      {n}
    </td>
  );
}

function SaveList({ saves }: { saves: AdminUserSave[] }) {
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-2">
      {saves.map((s) => (
        <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`font-semibold ${s.trash ? 'text-c-dim line-through' : 'text-c-text'}`}>{s.name}</span>
          {s.imported && <Pill tone="green" caps>Imported</Pill>}
          {s.showcaseLive && <Pill tone="purple" caps>Live</Pill>}
          {s.trash && (
            <Pill tone="neutral" caps>
              {s.trash.autoBackup ? 'Auto-backup' : 'Deleted'} {timeAgo(s.trash.deletedAt)}
            </Pill>
          )}
          <span className="text-c-dim tabular-nums">
            {s.simCount} sims · {s.householdCount} households · {s.lotCount} lots planned
          </span>
          <span className="text-c-faint">
            made {dateLabel(s.createdAt)} · synced {s.lastSyncedAt ? timeAgo(s.lastSyncedAt) : 'never'}
          </span>
        </li>
      ))}
    </ul>
  );
}
