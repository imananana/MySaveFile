/**
 * Diversity page — analytical lens on the save's named sims and households.
 * Surfaces over-used traits / aspirations vs a uniform-random baseline plus
 * the inferred household-type distribution.
 *
 * Renders the DiversityView component with store-bound props. The view itself
 * is a pure-presentation component so it can also be embedded elsewhere later
 * (e.g. a save-level summary on the dashboard).
 */
import { useEffect, useMemo } from 'react';
import { useSaveFile } from '../store/useSaveFile';
import { DiversityView } from '../components/Sims/DiversityView';

export default function Diversity() {
  const allSims = useSaveFile((s) => s.sims);
  const households = useSaveFile((s) => s.households);
  const lots = useSaveFile((s) => s.lots);
  const disabledWorlds = useSaveFile((s) => s.disabledWorlds);
  // Family edges tell a couple from two people sharing rent. Loaded here
  // because this page can be opened directly, without passing the Sims page
  // that otherwise fetches them.
  const storeRelationships = useSaveFile((s) => s.relationships);
  const loadRelationships = useSaveFile((s) => s.loadRelationships);
  useEffect(() => { loadRelationships().catch(() => {}); }, [loadRelationships]);
  const relationships = useMemo(() => Object.values(storeRelationships), [storeRelationships]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-c-text tracking-headline">Diversity</h1>
      </header>

      <DiversityView sims={Object.values(allSims).filter((s) => (s.recordStatus ?? 'active') === 'active')} households={households} lots={lots} disabledWorlds={disabledWorlds} relationships={relationships} />
    </div>
  );
}
