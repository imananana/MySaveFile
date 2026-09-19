import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { Plus, Trash, Warning, ArrowLeft, CalendarBlank, CheckSquare, Square, X, ImageSquare, PencilSimple, MagnifyingGlass, Info } from '@phosphor-icons/react';
import { Tooltip } from '../common/Tooltip';
import { Notes } from '../common/EntityText';
import { useSaveFile } from '../../store/useSaveFile';
import type { Holiday, Season, SeasonLength } from '../../types';
import { IconPickerModal } from '../common/IconPicker';
import { Dropdown } from '../common/Dropdown';
import { MasterDetail } from '../common/MasterDetail';
import { useConfirm } from '../common/ConfirmDialog';
import { PackNotOwnedBanner } from '../common/PackNotOwnedBanner';
import { STOCK_TRADITIONS } from '../../data/stockTraditions';
import { HOLIDAY_DECORATION_NAMES, holidayDecorationName } from '../../data/stockHolidayDefaults';
import { useListKeyboardNav } from '../../hooks/useListKeyboardNav';
import { CatalogPickerModal } from '../common/RequirementEditor';
import type { Choice } from '../../data/criteriaCatalogs';
import { Pill } from '../common/Pill';
import { btn } from '../common/btn';
import { PlannerPill } from '../common/PlannerPill';

// Decoration-theme options for the hand-created picker (None + catalogued themes).
const DECORATION_OPTIONS = [{ id: '', name: 'None' }, ...Object.entries(HOLIDAY_DECORATION_NAMES).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))];

const MAX_HOLIDAY_TRADITIONS = 5; // in-game cap of 5 traditions per holiday

// A holiday's traditions are hex tuning ids (no 0x prefix); resolve name via the
// catalog, icon by uid.
function resolveTraditionDisplay(uid: string): { name: string; icon: string } {
  return { name: STOCK_TRADITIONS['0x' + uid.toLowerCase()] ?? `Tradition 0x${uid}`, icon: `/tradition-icons/${uid}.png` };
}

// Full tradition catalog (for the hand-created-holiday picker), name-sorted.
const ALL_TRADITIONS = Object.entries(STOCK_TRADITIONS)
  .map(([k, name]) => ({ uid: k.replace(/^0x/, ''), name }))
  .sort((a, b) => a.name.localeCompare(b.name));
// Same catalog as CatalogPickerModal Choices (shared multi-select add picker).
const TRADITION_CHOICES: Choice[] = ALL_TRADITIONS.map((t) => ({ id: t.uid, name: t.name, icon: `/tradition-icons/${t.uid}.png` }));

const SEASONS: Season[] = ['Spring', 'Summer', 'Fall', 'Winter'];

// Off the calendar by choice — which only a holiday you wrote can be. A holiday
// from your save takes its date from the save, so it always has a place on the
// grid; it has no day editor at all, so a parked one could never be put back.
function isParked(h: Holiday): boolean {
  return h.unassigned && !h.sourceId;
}

const SEASON_COLORS: Record<Season, string> = {
  Spring: 'text-[#be185d]',
  Summer: 'text-[#a16207]',
  Fall: 'text-[#c2410c]',
  Winter: 'text-[#0e7490]',
};

const SEASON_BG: Record<Season, string> = {
  Spring: 'bg-[#fce7f3] border-[#db2777]/40',
  Summer: 'bg-[#fef3c7] border-[#ca8a04]/40',
  Fall:   'bg-[#fed7aa] border-[#ea580c]/40',
  Winter: 'bg-[#cffafe] border-[#0891b2]/40',
};

// Strong vivid backdrops for the season card itself (gradient feel).
const SEASON_CARD: Record<Season, { from: string; via: string; border: string }> = {
  Spring: { from: '#fce7f3', via: '#fbcfe8', border: '#f9a8d4' },
  Summer: { from: '#fef9c3', via: '#fef3c7', border: '#fde047' },
  Fall:   { from: '#ffedd5', via: '#fed7aa', border: '#fdba74' },
  Winter: { from: '#cffafe', via: '#a5f3fc', border: '#67e8f9' },
};

// Soft tint used on empty day tiles + filled tile accents.
const SEASON_TILE_EMPTY: Record<Season, string> = {
  Spring: 'bg-white/60 border-[#f9a8d4]/60 hover:bg-[#fce7f3] hover:border-[#db2777]',
  Summer: 'bg-white/60 border-[#fde047]/60 hover:bg-[#fef9c3] hover:border-[#ca8a04]',
  Fall:   'bg-white/60 border-[#fdba74]/60 hover:bg-[#ffedd5] hover:border-[#ea580c]',
  Winter: 'bg-white/60 border-[#67e8f9]/60 hover:bg-[#cffafe] hover:border-[#0891b2]',
};

const SEASON_PLUS: Record<Season, string> = {
  Spring: 'text-[#db2777]/40 group-hover:text-[#db2777]',
  Summer: 'text-[#ca8a04]/40 group-hover:text-[#a16207]',
  Fall:   'text-[#ea580c]/40 group-hover:text-[#c2410c]',
  Winter: 'text-[#0891b2]/40 group-hover:text-[#0e7490]',
};

const SEASON_LENGTH_OPTIONS: { value: SeasonLength; label: string }[] = [
  { value: 1, label: '1 wk' },
  { value: 2, label: '2 wks' },
  { value: 4, label: '4 wks' },
];

// One labeled field — keeps every control in the editor on the same typographic
// rhythm (uppercase micro-label above, control below).
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-2xs font-semibold text-c-dim uppercase tracking-label mb-2">{label}</div>
      {children}
    </div>
  );
}

function DayChip({ day, seasonLength, warn }: { day: number; seasonLength: SeasonLength; warn: boolean }) {
  const isOutOfRange = day > seasonLength * 7;
  if (isOutOfRange || warn) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-c-warn">
        <Warning size={10} weight="fill" />
        Day {day}
      </span>
    );
  }
  return <span className="text-[11px] font-medium text-c-faint">Day {day}</span>;
}

function HolidayCard({
  holiday,
  selected,
  seasonLength,
  reason,
  onClick,
}: {
  holiday: Holiday;
  selected: boolean;
  seasonLength: SeasonLength;
  reason?: string;            // set-aside reason ("Conflict with …" / "Doesn't fit …"); shown instead of the day
  onClick: () => void;
}) {
  const isOutOfRange = holiday.day > seasonLength * 7;

  return (
    <button
      onClick={onClick}
      data-listnav-id={holiday.id}
      className={`w-full flex items-center gap-2 px-3.5 py-2.5 border-b border-c-panel border-l-[3px] cursor-pointer text-left transition-colors ${
        selected
          ? 'bg-c-accent-soft border-l-c-accent'
          : 'bg-transparent border-l-transparent hover:bg-c-panel'
      }`}
    >
      {holiday.icon ? (
        <img
          src={`/holiday-icons/${holiday.icon}.png`}
          alt=""
          className="w-10 h-10 object-contain shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <span className="w-10 h-10 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-c-text tracking-headline truncate">{holiday.name}</span>
        {reason ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-c-secondary truncate">
            <Info size={10} weight="fill" className="shrink-0" />
            {reason}
          </span>
        ) : (
          <DayChip day={holiday.day} seasonLength={seasonLength} warn={isOutOfRange} />
        )}
      </div>
      {!holiday.sourceId && <PlannerPill />}
    </button>
  );
}

function DayPicker({
  selectedDay,
  seasonLength,
  takenDays,
  onChange,
}: {
  selectedDay: number;
  seasonLength: SeasonLength;
  takenDays: Set<number>;
  onChange: (day: number) => void;
}) {
  const totalDays = seasonLength * 7;

  return (
    <div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: totalDays }, (_, i) => {
          const day = i + 1;
          const isTaken = takenDays.has(day);
          const isSelected = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              disabled={isTaken}
              onClick={() => onChange(day)}
              className={`h-12 rounded-lg text-sm font-semibold cursor-pointer border transition-colors ${
                isSelected
                  ? 'bg-c-accent border-c-accent text-white shadow-sm'
                  : isTaken
                  ? 'bg-c-panel border-c-panel text-c-faint cursor-not-allowed line-through'
                  : 'bg-c-base border-c-border text-c-dim hover:border-c-accent hover:text-c-accent'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="text-2xs text-c-faint mt-2">{totalDays} days per season</div>
    </div>
  );
}

function SeasonCalendar({
  holidays,
  seasonLength,
  selectedId,
  setAsideReasons,
  onSelectHoliday,
  onCreateHoliday,
}: {
  holidays: Record<string, Holiday>;
  seasonLength: SeasonLength;
  selectedId: string | null;
  setAsideReasons: Map<string, string>;  // holiday id → why it's off the calendar (collision / doesn't fit)
  onSelectHoliday: (id: string) => void;
  onCreateHoliday: (season: Season, day: number) => void;
}) {
  const totalDays = seasonLength * 7;
  const weeks = seasonLength;

  const bySeasonAndDay = useMemo(() => {
    const map: Record<Season, Record<number, Holiday>> = {
      Spring: {}, Summer: {}, Fall: {}, Winter: {},
    };
    for (const h of Object.values(holidays)) {
      // Off-calendar holidays (parked or set aside) live in the bucket, not on
      // a day. Imported holidays are never set aside, so on a collision the
      // imported holiday keeps its tile and the hand-made one drops out.
      if (isParked(h) || setAsideReasons.has(h.id)) continue;
      map[h.season][h.day] = h;
    }
    return map;
  }, [holidays, setAsideReasons]);

  const offCalendar = useMemo(
    () => Object.values(holidays)
      .filter((h) => isParked(h) || setAsideReasons.has(h.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [holidays, setAsideReasons],
  );

  return (
    <div className="flex flex-col gap-3">
      {SEASONS.map((season) => {
        const card = SEASON_CARD[season];
        const holidayCount = Object.values(bySeasonAndDay[season]).length;
        return (
          <div
            key={season}
            className="rounded-2xl border-2 p-4 shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${card.from} 0%, ${card.via} 100%)`,
              borderColor: card.border,
            }}
          >
            {/* Season header */}
            <div className="flex items-center gap-3 mb-3">
              <img
                src={`/season-icons/${season.toLowerCase()}-season.png`}
                alt={season}
                className="w-11 h-11 object-contain shrink-0 drop-shadow-sm"
              />
              <div className="flex-1 min-w-0">
                <h3 className={`text-xl font-bold m-0 leading-none tracking-headline ${SEASON_COLORS[season]}`}>
                  {season}
                </h3>
                <p className="text-xs text-c-dim mt-1 font-medium">
                  {holidayCount} holiday{holidayCount !== 1 ? 's' : ''} <span className="text-c-faint">· {totalDays} days</span>
                </p>
              </div>
              <span
                className={`text-2xs font-bold uppercase tracking-label rounded-full px-2.5 py-1 bg-white/60 border ${SEASON_COLORS[season]}`}
                style={{ borderColor: card.border }}
              >
                {holidayCount}/{totalDays}
              </span>
            </div>

            {/* Day grid */}
            <div className="flex flex-col gap-2">
              {Array.from({ length: weeks }, (_, weekIdx) => (
                <div key={weekIdx} className="grid gap-2" style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}>
                  {Array.from({ length: 7 }, (_, dayIdx) => {
                    const day = weekIdx * 7 + dayIdx + 1;
                    const holiday = bySeasonAndDay[season][day];
                    const isSelected = holiday?.id === selectedId;
                    if (holiday) {
                      return (
                        <div
                          key={day}
                          onClick={() => onSelectHoliday(holiday.id)}
                          className={`group relative rounded-lg border-2 bg-c-card min-h-[96px] p-2 flex flex-col items-center transition-all cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                            isSelected
                              ? 'ring-2 ring-c-accent'
                              : ''
                          }`}
                          style={{ borderColor: isSelected ? 'var(--c-accent)' : card.border }}
                        >
                          <span className={`text-2xs font-bold leading-none self-start ${SEASON_COLORS[season]} opacity-70`}>
                            {day}
                          </span>
                          <div className="flex flex-col items-center justify-center flex-1 gap-1.5">
                            {holiday.icon ? (
                              <img
                                src={`/holiday-icons/${holiday.icon}.png`}
                                alt=""
                                className="w-10 h-10 object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-10 h-10" />
                            )}
                            <span className="text-2xs text-c-text font-semibold text-center leading-tight line-clamp-2">
                              {holiday.name}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={day}
                        onClick={() => onCreateHoliday(season, day)}
                        className={`group relative rounded-lg border-2 min-h-[96px] p-2 flex flex-col items-center transition-all cursor-pointer ${SEASON_TILE_EMPTY[season]}`}
                      >
                        <span className={`text-2xs font-semibold leading-none self-start ${SEASON_COLORS[season]} opacity-50 group-hover:opacity-100 transition-opacity`}>
                          {day}
                        </span>
                        <div className="flex-1 flex items-center justify-center">
                          <Plus
                            size={20}
                            weight="bold"
                            className={`transition-colors ${SEASON_PLUS[season]}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Set-aside bucket — holidays not on the calendar right now: either the
          user removed the date, or the day doesn't exist at this length / an
          imported holiday owns the slot. Auto ones return the moment they fit. */}
      {offCalendar.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-c-border bg-c-panel p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarBlank size={18} weight="duotone" className="text-c-faint" />
            <h3 className="text-base font-bold text-c-dim m-0 tracking-headline">Unassigned</h3>
            <Pill tone="neutral" caps>
              {offCalendar.length}
            </Pill>
            <span className="text-xs text-c-faint ml-1">not on the calendar — open one to pick a day</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {offCalendar.map((h) => {
              const reason = setAsideReasons.get(h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onSelectHoliday(h.id)}
                  className={`flex items-center gap-2.5 rounded-xl border bg-c-card px-3 py-2 text-left cursor-pointer transition-all hover:shadow-sm hover:-translate-y-0.5 ${h.id === selectedId ? 'ring-2 ring-c-accent border-c-accent' : 'border-c-border'}`}
                >
                  {h.icon ? (
                    <img src={`/holiday-icons/${h.icon}.png`} alt="" className="w-9 h-9 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <CalendarBlank size={22} weight="duotone" className="text-c-faint shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-c-text truncate">{h.name}</span>
                    {reason ? (
                      <span className="inline-flex items-center gap-1 text-2xs font-medium text-c-secondary truncate">
                        <Info size={10} weight="fill" className="shrink-0" />
                        {reason}
                      </span>
                    ) : (
                      <span className={`block text-2xs font-medium ${SEASON_COLORS[h.season]}`}>{h.season} · Day {h.day}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function HolidayManager() {
  const holidays = useSaveFile((s) => s.holidays);
  const seasonLength = useSaveFile((s) => s.seasonLength);
  const importedSeasonLength = useSaveFile((s) => s.importedSeasonLength);
  const addHoliday = useSaveFile((s) => s.addHoliday);
  const updateHoliday = useSaveFile((s) => s.updateHoliday);
  const deleteHoliday = useSaveFile((s) => s.deleteHoliday);
  const updateSeasonLength = useSaveFile((s) => s.updateSeasonLength);
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [isNameDirty, setIsNameDirty] = useState(false);
  const [isNotesDirty, setIsNotesDirty] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showTraditionPicker, setShowTraditionPicker] = useState(false);

  const selected = selectedId ? holidays[selectedId] : null;

  function toggleTradition(uid: string) {
    if (!selected) return;
    const has = selected.traditions.includes(uid);
    if (!has && selected.traditions.length >= MAX_HOLIDAY_TRADITIONS) return; // in-game cap of 5
    const next = has ? selected.traditions.filter((t) => t !== uid) : [...selected.traditions, uid];
    updateHoliday(selected.id, { traditions: next });
  }

  // Edit-set from the shared picker: the picked set IS the new tradition list
  // (planner holidays only — no locked/game-truth traditions). Inline chip ✕
  // still works for quick single removes.
  function setTraditions(picked: Choice[]) {
    if (!selected) return;
    updateHoliday(selected.id, { traditions: picked.map((p) => p.id).slice(0, MAX_HOLIDAY_TRADITIONS) });
  }

  // Filter by name first (case-insensitive) so the season grouping below works
  // on the matching set.
  const filteredHolidays = useMemo(() => {
    const q = search.toLowerCase();
    return Object.values(holidays).filter((h) => !q || h.name.toLowerCase().includes(q));
  }, [holidays, search]);

  // A holiday is "set aside" (off the calendar without the user removing it)
  // when its day doesn't exist at the current length, or an imported holiday —
  // which owns its canonical date — sits on the same slot. Computed, not stored:
  // it clears itself the moment the day fits/frees up. Imported holidays always
  // fit (they re-scale) so are never set aside. Keyed by holiday id → reason.
  const setAsideReasons = useMemo(() => {
    const totalDays = seasonLength * 7;
    const owners = new Map<string, string>();  // `${season}:${day}` → imported name
    for (const h of Object.values(holidays)) {
      if (h.sourceId && h.day <= totalDays) owners.set(`${h.season}:${h.day}`, h.name);
    }
    const reasons = new Map<string, string>();
    for (const h of Object.values(holidays)) {
      if (isParked(h)) continue;
      if (h.day > totalDays) {
        // Out of range. Imported holidays normally re-scale into range; one that's
        // still out here is legacy data (no scaledDates yet) — flag it so it isn't
        // lost, rather than let it vanish off the grid. Heals on next re-sync.
        reasons.set(h.id, `Doesn't fit ${totalDays}-day seasons`);
      } else if (!h.sourceId) {
        // Hand-made on an imported holiday's day → imported wins the slot.
        const owner = owners.get(`${h.season}:${h.day}`);
        if (owner) reasons.set(h.id, `Conflict with ${owner}`);
      }
    }
    return reasons;
  }, [holidays, seasonLength]);

  const holidaysBySeasonOrdered = useMemo(() => {
    const grouped: Record<Season, Holiday[]> = { Spring: [], Summer: [], Fall: [], Winter: [] };
    for (const h of filteredHolidays) {
      if (isParked(h) || setAsideReasons.has(h.id)) continue;  // off-calendar holidays get their own section
      grouped[h.season].push(h);
    }
    for (const season of SEASONS) {
      grouped[season].sort((a, b) => a.day - b.day);
    }
    return grouped;
  }, [filteredHolidays, setAsideReasons]);

  // Everything off the calendar: parked by you (no reason) + auto set-aside (reason).
  const offCalendarList = useMemo(
    () => filteredHolidays
      .filter((h) => isParked(h) || setAsideReasons.has(h.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [filteredHolidays, setAsideReasons],
  );

  // Repair a holiday from your save that was left off the calendar by an older
  // version of this page. It has no day editor, so nothing here could put it
  // back; the save's date is the answer, so restore it and move on. Re-sync
  // does the same (holidayRefreshPatch), for plans nobody opens this page in.
  // Ref-guarded rather than mount-only: the store may still be loading when
  // this mounts, and one PATCH per holiday is enough forever.
  const healed = useRef(new Set<string>());
  useEffect(() => {
    for (const h of Object.values(holidays)) {
      if (!h.sourceId || !h.unassigned || healed.current.has(h.id)) continue;
      healed.current.add(h.id);
      updateHoliday(h.id, { unassigned: false });
    }
  }, [holidays, updateHoliday]);

  function selectHoliday(id: string) {
    setSelectedId(id);
    setShowIconPicker(false);
    setShowTraditionPicker(false);
  }

  // Nav order matches the rendered list: each season in order, then unassigned.
  const navHolidays = useMemo(
    () => [...SEASONS.flatMap((s) => holidaysBySeasonOrdered[s]), ...offCalendarList],
    [holidaysBySeasonOrdered, offCalendarList],
  );
  useListKeyboardNav({ items: navHolidays, selectedId, onSelect: selectHoliday });

  // Sync the editable fields from the selected holiday AFTER render — reading
  // `holidays[id]` synchronously inside selectHoliday would miss a just-created
  // holiday (its store write lands during the await, but the closure's map is
  // render-stale), which is why a new holiday used to inherit the prior name.
  useEffect(() => {
    if (!selected) return;
    setEditingName(selected.name);
    setEditingNotes(selected.notes);
    setIsNameDirty(false);
    setIsNotesDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // The first day nothing sits on, or null when the season is full. Null is the
  // whole point: falling back to day 1 put two holidays on one tile, and the
  // calendar can only draw one of them — the other vanished off the grid while
  // still sitting in the list.
  function findFirstFreeDay(season: Season): number | null {
    const taken = new Set(
      Object.values(holidays)
        .filter((h) => h.season === season && !isParked(h))
        .map((h) => h.day),
    );
    const maxDay = seasonLength * 7;
    for (let d = 1; d <= maxDay; d++) {
      if (!taken.has(d)) return d;
    }
    return null;
  }

  async function handleCreate() {
    // Spring first, then whichever season still has room. A full year leaves it
    // with no day at all — it opens in the editor saying so, rather than
    // landing on top of something.
    const season = SEASONS.find((s) => findFirstFreeDay(s) !== null) ?? 'Spring';
    const day = findFirstFreeDay(season);
    const id = await addHoliday({
      name: 'New holiday',
      icon: '',
      season,
      day: day ?? 1,
      notes: '',
      traditions: [],
      unassigned: day === null,
      timeOff: false,
      decorationPreset: null,
      sourceId: null,
      scaledDates: null,
    });
    selectHoliday(id);
  }

  async function handleCreateOnDay(season: Season, day: number) {
    const id = await addHoliday({
      name: 'New holiday',
      icon: '',
      season,
      day,
      notes: '',
      traditions: [],
      unassigned: false,
      timeOff: false,
      decorationPreset: null,
      sourceId: null,
      scaledDates: null,
    });
    selectHoliday(id);
  }

  function handleNameBlur() {
    if (!selected || !isNameDirty) return;
    updateHoliday(selected.id, { name: editingName || 'New holiday' });
    setIsNameDirty(false);
  }

  function handleNotesBlur() {
    if (!selected || !isNotesDirty) return;
    updateHoliday(selected.id, { notes: editingNotes });
    setIsNotesDirty(false);
  }

  async function handleDelete() {
    if (!selected) return;
    if (!await confirm({ message: `Delete "${selected.name}"?`, confirmLabel: 'Delete', danger: true })) return;
    setSelectedId(null);
    await deleteHoliday(selected.id);
  }

  function handleSeasonChange(newSeason: Season) {
    if (!selected) return;
    const taken = new Set(
      Object.values(holidays)
        .filter((h) => h.season === newSeason && h.id !== selected.id && !isParked(h))
        .map((h) => h.day),
    );
    if (!taken.has(selected.day)) {
      // Its day is free in the new season — carry it across. Assigning a
      // season/day also un-parks a holiday you'd set aside.
      updateHoliday(selected.id, { season: newSeason, day: selected.day, unassigned: false });
      return;
    }
    // Day taken: move it to the first free one, or park it when the season is
    // full — the day grid then shows every day struck through, which is the
    // honest answer.
    const free = findFirstFreeDay(newSeason);
    updateHoliday(selected.id, { season: newSeason, day: free ?? selected.day, unassigned: free === null });
  }

  function handleDayChange(day: number) {
    if (!selected) return;
    updateHoliday(selected.id, { day, unassigned: false });
  }

  function handleUnassign() {
    if (!selected) return;
    updateHoliday(selected.id, { unassigned: true });
  }

  // Changing the plan length re-scales imported holidays to their exact day for
  // that length (the game pre-computes a calendar per length; we stored all
  // three). Hand-made holidays keep their day — if it no longer fits, the view
  // surfaces them as "set aside" (no data is parked). Nothing lands in Unassigned.
  async function handleSeasonLengthChange(weeks: SeasonLength) {
    await updateSeasonLength(weeks);
    for (const h of Object.values(holidays)) {
      if (!h.scaledDates) continue;  // only a holiday from your save has per-length dates
      const sd = h.scaledDates[String(weeks)] ?? Object.values(h.scaledDates)[0];
      if (sd && (h.day !== sd.day || h.season !== sd.season)) {
        updateHoliday(h.id, { day: sd.day, season: sd.season });
      }
    }
  }

  const takenDaysForSelected = useMemo(() => {
    if (!selected) return new Set<number>();
    return new Set(
      Object.values(holidays)
        .filter((h) => h.season === selected.season && h.id !== selected.id && !isParked(h))
        .map((h) => h.day),
    );
  }, [holidays, selected?.id, selected?.season]);

  const selectedReason = selected ? setAsideReasons.get(selected.id) : undefined;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-w-[1600px] w-full">
      <PackNotOwnedBanner packId="EP05" feature="Holidays" />
      <MasterDetail>
      {/* Left panel */}
      <MasterDetail.Rail width="w-64">
        <div className="px-4 py-4 border-b border-c-border flex flex-col gap-3">
          <h1 className="text-xl font-bold text-c-text m-0 tracking-headline">Holidays</h1>

          {/* Season length — quiet, save-wide setting that reshapes the calendar */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-2xs font-semibold text-c-faint uppercase tracking-label">
              Seasons
              {importedSeasonLength != null && importedSeasonLength !== seasonLength && (
                <Tooltip
                  wrap
                  text={`Your plan (${seasonLength * 7} days) is different to your save (${importedSeasonLength * 7} days).`}
                >
                  <Info size={13} weight="fill" className="text-c-secondary cursor-help" />
                </Tooltip>
              )}
            </span>
            <div className="flex rounded-md border border-c-border overflow-hidden">
              {SEASON_LENGTH_OPTIONS.map(({ value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleSeasonLengthChange(value)}
                  className={`text-[10px] font-semibold px-2 py-[3px] cursor-pointer border-none transition-colors ${
                    seasonLength === value
                      ? 'bg-c-accent text-white'
                      : 'bg-c-base text-c-dim hover:text-c-text'
                  }`}
                >
                  {value * 7}d
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            className={btn('primary', { block: true, elevated: true })}
          >
            <Plus size={14} weight="bold" />
            <span className="text-2xs font-semibold uppercase tracking-label">New holiday</span>
          </button>

          <div className="relative">
            <MagnifyingGlass size={13} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-c-faint pointer-events-none" />
            <input
              placeholder="Search holidays..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-c-base border border-c-border rounded-md pl-9 pr-9 py-[6px] text-c-text text-xs w-full outline-none focus:border-c-accent"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-c-faint hover:text-c-text p-1"
                aria-label="Clear search"
              >
                <X size={11} weight="bold" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {Object.values(holidays).length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-c-faint">
              No holidays yet. Create one to get started.
            </div>
          )}
          {SEASONS.map((season) => {
            const seasonHolidays = holidaysBySeasonOrdered[season];
            if (seasonHolidays.length === 0) return null;
            return (
              <div key={season}>
                <div className={`mx-2 mt-3 mb-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-label ${SEASON_BG[season]} ${SEASON_COLORS[season]}`}>
                  {season}
                </div>
                {seasonHolidays.map((h) => (
                  <HolidayCard
                    key={h.id}
                    holiday={h}
                    selected={h.id === selectedId}
                    seasonLength={seasonLength}
                    onClick={() => selectHoliday(h.id)}
                  />
                ))}
              </div>
            );
          })}

          {offCalendarList.length > 0 && (
            <div>
              <div className="mx-2 mt-3 mb-1.5 px-3 py-1.5 rounded-lg border border-c-border bg-c-panel text-[11px] font-bold uppercase tracking-label text-c-dim flex items-center gap-1.5">
                <CalendarBlank size={12} weight="duotone" className="text-c-faint" />
                Unassigned
              </div>
              {offCalendarList.map((h) => (
                <HolidayCard
                  key={h.id}
                  holiday={h}
                  selected={h.id === selectedId}
                  seasonLength={seasonLength}
                  reason={setAsideReasons.get(h.id)}
                  onClick={() => selectHoliday(h.id)}
                />
              ))}
            </div>
          )}
        </div>
      </MasterDetail.Rail>

      {/* Right panel */}
      <MasterDetail.Detail label="Holidays">
      <div className="flex-1 overflow-y-auto p-8 bg-c-base">
        {!selected ? (
          <SeasonCalendar
            holidays={holidays}
            seasonLength={seasonLength}
            selectedId={selectedId}
            setAsideReasons={setAsideReasons}
            onSelectHoliday={selectHoliday}
            onCreateHoliday={handleCreateOnDay}
          />
        ) : (
          <div className="max-w-3xl flex flex-col gap-7">
            <button
              onClick={() => setSelectedId(null)}
              className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-c-green bg-c-accent-soft hover:bg-c-accent-soft border border-c-accent-border rounded-full px-3.5 py-1.5 cursor-pointer transition-colors"
            >
              <ArrowLeft size={13} weight="bold" />
              Back to calendar
            </button>

            {/* Hero — bare icon (obvious add affordance) + name + season/day line */}
            <div className="flex items-start gap-5">
              {selected.sourceId ? (
                selected.icon ? (
                  <img src={`/holiday-icons/${selected.icon}.png`} alt="" className="w-[72px] h-[72px] object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <CalendarBlank size={64} weight="duotone" className="text-c-faint shrink-0" />
                )
              ) : (
                <Tooltip text={selected.icon ? 'Change icon' : 'Add an icon'}>
                  <button
                    type="button"
                    onClick={() => setShowIconPicker((v) => !v)}
                 
                    className="shrink-0 bg-transparent border-none p-0 cursor-pointer group" aria-label={selected.icon ? 'Change icon' : 'Add an icon'}>
                    {selected.icon ? (
                      <span className="relative block w-[72px] h-[72px]">
                        <img src={`/holiday-icons/${selected.icon}.png`} alt="" className="w-[72px] h-[72px] object-contain transition-opacity group-hover:opacity-40" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ImageSquare size={20} weight="duotone" className="text-c-accent" />
                          <span className="text-[10px] font-semibold uppercase tracking-label text-c-accent">Change</span>
                        </span>
                      </span>
                    ) : (
                      <span className={`w-[72px] h-[72px] rounded-xl border-2 border-dashed bg-c-card flex flex-col items-center justify-center gap-1 transition-colors ${showIconPicker ? 'border-c-accent' : 'border-c-border group-hover:border-c-accent'}`}>
                        <ImageSquare size={22} weight="duotone" className="text-c-accent" />
                        <span className="text-[10px] font-semibold uppercase tracking-label text-c-accent">Add icon</span>
                      </span>
                    )}
                  </button>
                </Tooltip>
              )}

              <div className="flex-1 min-w-0 pt-0.5">
                <div className="text-2xs font-bold uppercase tracking-label text-c-secondary mb-1">Holiday</div>
                {selected.sourceId ? (
                  <h2 className="text-3xl font-extrabold text-c-text tracking-headline m-0 leading-tight break-words">{selected.name}</h2>
                ) : (
                  <div className="group/name flex items-center gap-1.5 border-b border-dashed border-c-border focus-within:border-solid focus-within:border-c-accent transition-colors">
                    <input
                      value={editingName}
                      onChange={(e) => { setEditingName(e.target.value); setIsNameDirty(true); }}
                      onBlur={handleNameBlur}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      placeholder="Name this holiday…"
                      className="flex-1 min-w-0 bg-transparent border-none text-3xl font-extrabold text-c-text tracking-headline outline-none placeholder:text-c-faint py-0.5"
                    />
                    <PencilSimple size={16} weight="bold" className="shrink-0 text-c-faint group-focus-within/name:text-c-accent transition-colors" />
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-sm text-c-dim flex-wrap">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarBlank size={16} weight="duotone" className="text-c-secondary" />
                    {selected.season}, Day {selected.day}
                  </span>
                  <button onClick={handleDelete} className="ml-auto shrink-0 inline-flex items-center gap-1 text-c-faint hover:text-c-red cursor-pointer text-xs bg-transparent border-none transition-colors">
                    <Trash size={13} weight="bold" /> Remove
                  </button>
                </div>
              </div>
            </div>

            {/* Off-calendar note — parked or auto set-aside (calm, never a warning) */}
            {isParked(selected) ? (
              <div className="px-3 py-2.5 bg-c-panel border border-c-border rounded-md text-xs text-c-dim flex items-start gap-2">
                <CalendarBlank size={14} weight="duotone" className="shrink-0 mt-px text-c-faint" />
                <span>Not placed on the calendar yet. Pick a day in the editor below to schedule it.</span>
              </div>
            ) : selectedReason && (
              <div className="px-3 py-2.5 bg-c-panel border border-c-border rounded-md text-xs text-c-dim flex items-start gap-2">
                <Info size={14} weight="fill" className="shrink-0 mt-px text-c-secondary" />
                <span>{selectedReason}. {selected.sourceId ? 'Re-sync or extend the season length to place it.' : 'Pick a different day below, or extend the season length.'}</span>
              </div>
            )}

            {/* Icon picker — pops out when the header icon is clicked */}
            {!selected.sourceId && showIconPicker && (
              <IconPickerModal iconSet="holiday" value={selected.icon} onChange={(icon) => updateHoliday(selected.id, { icon })} onClose={() => setShowIconPicker(false)} />
            )}

            {/* One editor surface — full-width, grouped, consistent sizing.
                Hand-created = editable controls; imported = read-only display. */}
            <div className="rounded-xl border border-c-border bg-c-card shadow-sm px-6 flex flex-col divide-y divide-c-border">
              {!selected.sourceId && (
                <div className="py-6 flex flex-col gap-6">
                  {/* Season — full-width 4-up */}
                  <Field label="Season">
                    <div className="grid grid-cols-4 gap-2.5">
                      {SEASONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSeasonChange(s)}
                          className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold cursor-pointer transition-colors ${
                            selected.season === s ? `${SEASON_BG[s]} ${SEASON_COLORS[s]}` : 'bg-c-base border-c-border text-c-dim hover:border-c-accent hover:text-c-text'
                          }`}
                        >
                          <img src={`/season-icons/${s.toLowerCase()}-season.png`} alt="" className="w-5 h-5 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          {s}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {/* Day — full-width 7-col; No-day toggle on the label row */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xs font-semibold text-c-dim uppercase tracking-label">Day</span>
                      <button
                        type="button"
                        // Taking it off the calendar always works; putting it
                        // back needs somewhere to put it, so the toggle goes
                        // dead when the season has no free day left — the grid
                        // below, every day struck through, says why.
                        disabled={selected.unassigned && findFirstFreeDay(selected.season) === null}
                        onClick={() => {
                          if (!selected.unassigned) { handleUnassign(); return; }
                          const free = findFirstFreeDay(selected.season);
                          if (free !== null) handleDayChange(free);
                        }}
                        className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md border px-2.5 py-1 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:text-c-faint ${
                          selected.unassigned ? 'bg-c-panel border-c-border text-c-text font-semibold' : 'bg-c-base border-c-border text-c-faint hover:text-c-dim hover:border-c-dim'
                        }`}
                      >
                        <CalendarBlank size={13} weight={selected.unassigned ? 'fill' : 'duotone'} />
                        No day yet
                      </button>
                    </div>
                    <DayPicker
                      selectedDay={selected.unassigned ? -1 : selected.day}
                      seasonLength={seasonLength}
                      takenDays={takenDaysForSelected}
                      onChange={handleDayChange}
                    />
                  </div>
                </div>
              )}

              {/* Observance — clean settings rows, full width */}
              <div className="py-6 flex flex-col gap-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-c-text">Day off work &amp; school</span>
                    <span className="text-2xs text-c-faint">Sims get the day off to celebrate</span>
                  </div>
                  {selected.sourceId ? (
                    selected.timeOff
                      ? <CheckSquare size={24} weight="fill" className="text-c-accent shrink-0" />
                      : <Square size={24} className="text-c-faint shrink-0" />
                  ) : (
                    <Tooltip text={selected.timeOff ? 'Day off enabled' : 'No day off'}>
                      <button
                        type="button"
                        onClick={() => updateHoliday(selected.id, { timeOff: !selected.timeOff })}
                        aria-pressed={selected.timeOff}
                     
                        className="bg-transparent border-none p-0 cursor-pointer leading-none shrink-0" aria-label={selected.timeOff ? 'Day off enabled' : 'No day off'}>
                        {selected.timeOff
                          ? <CheckSquare size={24} weight="fill" className="text-c-accent" />
                          : <Square size={24} className="text-c-faint hover:text-c-dim transition-colors" />}
                      </button>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-c-text">Decoration theme</span>
                    <span className="text-2xs text-c-faint">Seasonal décor while it's active</span>
                  </div>
                  {selected.sourceId ? (
                    <span className="text-sm text-c-text font-medium shrink-0">{holidayDecorationName(selected.decorationPreset) || 'None'}</span>
                  ) : (
                    <Dropdown
                      value={selected.decorationPreset ?? ''}
                      ariaLabel="Decoration theme"
                      className="w-52 shrink-0"
                      options={DECORATION_OPTIONS.map((o) => ({ value: o.id, label: o.name }))}
                      onChange={(v) => updateHoliday(selected.id, { decorationPreset: v || null })}
                    />
                  )}
                </div>
              </div>

              {/* Traditions — full width */}
              <div className="py-6">
                <Field label="Traditions">
                  {selected.traditions.length > 0 ? (
                    <div className="flex flex-wrap gap-2.5">
                      {selected.traditions.map((uid) => {
                        const t = resolveTraditionDisplay(uid);
                        return (
                          <span key={uid} className="inline-flex items-center gap-2.5 text-sm font-semibold text-c-text bg-c-base border border-c-border pl-2.5 pr-3.5 py-2 rounded-xl">
                            <img src={t.icon} alt="" className="w-7 h-7 object-contain shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            {t.name}
                            {!selected.sourceId && (
                              <Tooltip text="Remove">
                                <button type="button" onClick={() => toggleTradition(uid)} className="ml-0.5 text-c-faint hover:text-c-red bg-transparent border-none cursor-pointer p-0 leading-none" aria-label="Remove">
                                  <X size={13} weight="bold" />
                                </button>
                              </Tooltip>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ) : selected.sourceId ? (
                    <p className="text-sm text-c-faint italic m-0">No traditions for this holiday.</p>
                  ) : null}

                  {!selected.sourceId && (
                    <div className={`flex items-center gap-2 ${selected.traditions.length > 0 ? 'mt-3' : ''}`}>
                      <button
                        type="button"
                        onClick={() => setShowTraditionPicker(true)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium rounded-md border px-3 py-1.5 cursor-pointer transition-colors bg-c-base text-c-accent border-c-border hover:border-c-accent"
                      >
                        <Plus size={14} weight="bold" /> {selected.traditions.length >= MAX_HOLIDAY_TRADITIONS ? 'Edit traditions' : 'Add tradition'}
                      </button>
                      <span className={`text-2xs font-semibold tabular-nums ${selected.traditions.length >= MAX_HOLIDAY_TRADITIONS ? 'text-c-red' : 'text-c-faint'}`}>{selected.traditions.length} / {MAX_HOLIDAY_TRADITIONS}</span>
                    </div>
                  )}
                </Field>
              </div>
            </div>

            {/* Notes — private */}
            <Notes
              value={editingNotes}
              onChange={(v) => { setEditingNotes(v); setIsNotesDirty(true); }}
              onBlur={handleNotesBlur}
              rows={5}
            />

          </div>
        )}
      </div>
      </MasterDetail.Detail>
      </MasterDetail>

      {showTraditionPicker && selected && (
        <CatalogPickerModal
          title="Edit traditions"
          items={TRADITION_CHOICES}
          multiSelect
          preselected={new Set(selected.traditions)}
          maxSelected={MAX_HOLIDAY_TRADITIONS}
          onSelect={setTraditions}
          onClose={() => setShowTraditionPicker(false)}
        />
      )}
    </div>
  );
}
