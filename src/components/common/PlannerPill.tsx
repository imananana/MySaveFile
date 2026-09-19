/**
 * The one marker for "you made this, your save didn't."
 *
 * Only the EXCEPTION is labelled. Most records in a plan come from the save, so
 * pilling those would put a badge on nearly every row and say nothing; the
 * planner-authored handful is what a player needs to pick out. This is the rule
 * Households already followed, now shared by every manager rail.
 */
export function PlannerPill() {
  return (
    <span className="shrink-0 inline-flex items-center rounded-full border border-c-secondary px-1.5 py-px text-[9px] font-semibold uppercase tracking-label text-c-secondary">
      Planner
    </span>
  );
}
