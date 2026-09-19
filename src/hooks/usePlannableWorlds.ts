import { useMemo } from 'react';
import { usePackOwnership } from '../store/usePackOwnership';
import { useSaveFile } from '../store/useSaveFile';
import { WORLDS_DATA, WORLDS_SORTED_BY_RELEASE } from '../data/worlds';
import { RELEASE_TO_PACK } from '../data/packs';

/** The pack a world belongs to, or null for base-game worlds (always owned). */
export function worldPackId(worldName: string): string | null {
  const w = (WORLDS_DATA as Record<string, { release: number }>)[worldName];
  if (!w) return null;
  return RELEASE_TO_PACK[w.release] ?? null;
}

/**
 * Predicate: is this world available for *planning* in the current save?
 * True iff you own its pack AND haven't switched the world off. Three kinds of
 * "disablement" collapse into two signals here:
 *   #1 pack auto-detected as unowned   ─┐ both → isPackOwned(pack) === false
 *   #2 pack manually toggled off       ─┘
 *   #3 world manually switched off      → disabledWorlds includes it
 *
 * This gates lot/world CONTENT only (assignment pickers, coverage). Sims are
 * never filtered by it — a disabled world's residents still count in stats.
 */
export function useIsWorldPlannable(): (worldName: string) => boolean {
  const isPackOwned = usePackOwnership((s) => s.isOwned);
  const manualOverrides = usePackOwnership((s) => s.manualOverrides);
  const autoDetected = usePackOwnership((s) => s.autoDetected);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);

  return useMemo(() => {
    const disabled = new Set(disabledWorlds);
    return (worldName: string) => {
      if (disabled.has(worldName)) return false;
      const packId = worldPackId(worldName);
      return !packId || isPackOwned(packId);
    };
    // isOwned is a stable store fn; re-derive when the override/detection
    // slices or the world list change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPackOwned, manualOverrides, autoDetected, disabledWorlds]);
}

/** Canonical-ordered list of worlds available for planning in this save. */
export function usePlannableWorlds(): string[] {
  const isPlannable = useIsWorldPlannable();
  return useMemo(() => WORLDS_SORTED_BY_RELEASE.filter(isPlannable), [isPlannable]);
}
