import { useState, useCallback } from 'react';
import {
  WORLDS_DATA,
  WORLDS_SORTED_BY_RELEASE,
  isLotVisible,
  getLotCategory,
  CATEGORY_COLORS,
  getBuildingName,
} from '../../data/worlds';
import type { WorldName } from '../../data/worlds';
import { LOT_PINS } from '../../data/lotPins';
import type { PinCoords } from '../../data/lotPins';

type AllPins = Partial<Record<WorldName, Record<string, PinCoords>>>;

function mapImagePath(worldName: string): string {
  return `/maps/${worldName.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-')}.webp`;
}

interface EditorItem {
  key: string;   // pin key used in LOT_PINS (building name for apartments, lot name otherwise)
  label: string; // display label in sidebar
  lotType: string;
}

function getEditorItems(worldName: WorldName): EditorItem[] {
  const worldData = WORLDS_DATA[worldName];
  if (!worldData) return [];
  const seenKeys = new Set<string>();
  const result: EditorItem[] = [];
  for (const lot of worldData.lots) {
    if (!isLotVisible(lot.type)) continue;
    const key = lot.type === 'Apartment' ? getBuildingName(lot.name) : lot.name;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push({ key, label: key, lotType: lot.type });
    }
  }
  return result;
}

function getLotType(worldName: WorldName, lotName: string): string {
  const lot = WORLDS_DATA[worldName]?.lots.find((l) => l.name === lotName);
  return lot?.type ?? 'Residential';
}

function generateCode(pins: AllPins): string {
  const worldEntries = (Object.keys(pins) as WorldName[])
    .filter((w) => {
      const entry = pins[w];
      return entry && Object.keys(entry).length > 0;
    })
    .map((w) => {
      const lotEntries = Object.entries(pins[w]!)
        .map(([name, { x, y }]) => `    ${JSON.stringify(name)}: { x: ${x}, y: ${y} },`)
        .join('\n');
      return `  ${JSON.stringify(w)}: {\n${lotEntries}\n  },`;
    })
    .join('\n');

  return `export const LOT_PINS: Partial<Record<WorldName, Record<string, PinCoords>>> = {\n${worldEntries}\n};`;
}

interface EditorPinProps {
  lotName: string;
  lotType: string;
  x: number;
  y: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function EditorPin({ lotName, lotType, x, y, isSelected, onSelect, onDelete }: EditorPinProps) {
  const [hovered, setHovered] = useState(false);
  const category = getLotCategory(lotType);
  const color = CATEGORY_COLORS[category];

  return (
    <div
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${isSelected || hovered ? 'z-20' : 'z-10'}`}
    >
      {/* Lot name label on hover */}
      {hovered && (
        <div className="absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 bg-white border border-c-border shadow-md rounded-[5px] px-2 py-1 whitespace-nowrap text-[11px] text-c-text pointer-events-none z-30">
          {lotName}
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: `${color}cc`,
          border: `3px solid ${isSelected ? '#16a34a' : hovered ? color : '#e5e7eb'}`,
          boxShadow: isSelected ? `0 0 0 2px ${color}` : '0 1px 4px rgba(0,0,0,0.7)',
        }}
        className="w-[26px] h-[26px] rounded-full cursor-pointer p-0 relative shrink-0"
      >
        {/* Delete button */}
        {hovered && (
          <span
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute -top-2 -right-2 w-[14px] h-[14px] bg-c-red border border-white rounded-full flex items-center justify-center text-[9px] text-white cursor-pointer leading-none z-40"
          >
            ✕
          </span>
        )}
      </button>
    </div>
  );
}

function navBtnClass(disabled: boolean): string {
  return `bg-transparent border border-c-border-mid hover:border-c-accent rounded-md px-3 py-1 text-sm transition-colors ${
    disabled ? 'text-c-border-mid cursor-default hover:border-c-border-mid' : 'text-c-green cursor-pointer'
  }`;
}

export function PinEditor() {
  const [worldIdx, setWorldIdx] = useState(0);
  const worldName = WORLDS_SORTED_BY_RELEASE[worldIdx];

  const [placedPins, setPlacedPins] = useState<AllPins>(() =>
    structuredClone(LOT_PINS) as AllPins
  );
  const [selectedLot, setSelectedLot] = useState<string | null>(null);
  const [imgError, setImgError] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const editorItems = getEditorItems(worldName);
  const worldPins = placedPins[worldName] ?? {};
  const placedCount = Object.keys(worldPins).length;

  const advanceSelection = useCallback((currentKey: string, currentPins: Record<string, PinCoords>) => {
    const keys = editorItems.map((i) => i.key);
    const idx = keys.indexOf(currentKey);
    const next = keys.slice(idx + 1).find((k) => !currentPins[k])
      ?? keys.slice(0, idx).find((k) => !currentPins[k])
      ?? null;
    setSelectedLot(next);
  }, [editorItems]);

  function handleMapClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!selectedLot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = parseFloat(((e.clientX - rect.left) / rect.width * 100).toFixed(1));
    const y = parseFloat(((e.clientY - rect.top) / rect.height * 100).toFixed(1));

    const newWorldPins = { ...worldPins, [selectedLot]: { x, y } };
    setPlacedPins((prev) => ({ ...prev, [worldName]: newWorldPins }));
    advanceSelection(selectedLot, newWorldPins);
  }

  function deletePin(lotName: string) {
    const newWorldPins = { ...worldPins };
    delete newWorldPins[lotName];
    setPlacedPins((prev) => ({ ...prev, [worldName]: newWorldPins }));
    if (selectedLot === lotName) setSelectedLot(null);
  }

  function handleCopyCode() {
    const code = generateCode(placedPins);
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const hasImgError = imgError[worldName];

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-[10px] px-4 py-2 border-b border-c-border bg-c-base shrink-0">
        <button
          onClick={() => { setWorldIdx((i) => Math.max(0, i - 1)); setSelectedLot(null); }}
          disabled={worldIdx === 0}
          className={navBtnClass(worldIdx === 0)}
        >
          ←
        </button>

        <select
          value={worldName}
          onChange={(e) => {
            setWorldIdx(WORLDS_SORTED_BY_RELEASE.indexOf(e.target.value as WorldName));
            setSelectedLot(null);
          }}
          className="bg-c-card border border-c-border-mid focus:border-c-accent rounded-md text-c-text text-sm px-3 py-1 cursor-pointer outline-none transition-colors"
        >
          {WORLDS_SORTED_BY_RELEASE.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>

        <button
          onClick={() => { setWorldIdx((i) => Math.min(WORLDS_SORTED_BY_RELEASE.length - 1, i + 1)); setSelectedLot(null); }}
          disabled={worldIdx === WORLDS_SORTED_BY_RELEASE.length - 1}
          className={navBtnClass(worldIdx === WORLDS_SORTED_BY_RELEASE.length - 1)}
        >
          →
        </button>

        <span className="text-2xs font-semibold uppercase tracking-label text-c-faint ml-1 tabular-nums">
          {placedCount} / {editorItems.length} placed
        </span>

        <div className="ml-auto">
          <button
            onClick={handleCopyCode}
            className={`rounded-md px-3.5 py-1.5 cursor-pointer text-xs font-semibold transition-all duration-150 border-none ${
              copied
                ? 'bg-c-accent text-white shadow-sm'
                : 'bg-c-accent-soft text-c-green hover:bg-c-deep'
            }`}
          >
            {copied ? 'Copied!' : 'Copy code'}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map panel */}
        <div className="flex-[3] overflow-auto bg-c-deep relative">
          {selectedLot && !hasImgError && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-c-accent-soft border border-c-accent-border rounded-md px-3 py-1 text-[11px] text-c-accent z-50 whitespace-nowrap pointer-events-none">
              Click map to place: <strong>{selectedLot}</strong>
            </div>
          )}

          {hasImgError ? (
            <div className="flex flex-col items-center justify-center h-full text-c-faint text-[13px] gap-2">
              <span>Map image not found for <span className="text-c-green">{worldName}</span></span>
              <code className="text-[11px] text-c-dim">{mapImagePath(worldName)}</code>
            </div>
          ) : (
            <div className="relative inline-block min-w-full">
              <img
                src={mapImagePath(worldName)}
                alt={`${worldName} map`}
                onError={() => setImgError((prev) => ({ ...prev, [worldName]: true }))}
                onClick={handleMapClick}
                draggable={false}
                className={`w-full block select-none ${selectedLot ? 'cursor-crosshair' : 'cursor-default'}`}
              />

              {/* Placed pins */}
              {Object.entries(worldPins).map(([lotName, { x, y }]) => (
                <EditorPin
                  key={lotName}
                  lotName={lotName}
                  lotType={getLotType(worldName, lotName)}
                  x={x}
                  y={y}
                  isSelected={selectedLot === lotName}
                  onSelect={() => setSelectedLot(lotName)}
                  onDelete={() => deletePin(lotName)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Lot list panel */}
        <div className="flex-1 border-l border-c-border overflow-auto bg-c-base flex flex-col">
          <div className="px-3 py-2.5 border-b border-c-border text-2xs font-semibold uppercase tracking-label text-c-faint">
            Click a lot, then click its location on the map.
          </div>
          {editorItems.map((item) => {
            const isPlaced = !!worldPins[item.key];
            const isSelected = selectedLot === item.key;
            const category = getLotCategory(item.lotType);
            const color = CATEGORY_COLORS[category];

            return (
              <button
                key={item.key}
                onClick={() => setSelectedLot(isSelected ? null : item.key)}
                className={`flex items-center gap-2 px-3 py-2 border-b border-c-border border-l-[3px] text-left w-full cursor-pointer transition-colors duration-100 ${
                  isSelected
                    ? 'bg-c-accent-soft border-l-c-accent'
                    : 'bg-transparent border-l-transparent hover:bg-c-panel'
                }`}
              >
                {/* Category dot */}
                <span
                  style={{ background: color }}
                  className="w-2 h-2 rounded-full shrink-0"
                />
                <span className={`text-xs flex-1 leading-snug ${isSelected ? 'text-c-text font-semibold' : 'text-c-muted'}`}>
                  {item.label}
                </span>
                <span className={`text-xs shrink-0 ${isPlaced ? 'text-c-accent' : 'text-c-border-mid'}`}>
                  {isPlaced ? '✓' : '○'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
