interface WorldProgressBarProps {
  total: number;
  planned: number;
  built: number;
}

export function WorldProgressBar({ total, planned, built }: WorldProgressBarProps) {
  const unplanned = total - planned - built;
  const builtPct = total > 0 ? (built / total) * 100 : 0;
  const plannedPct = total > 0 ? (planned / total) * 100 : 0;
  const unplannedPct = total > 0 ? (unplanned / total) * 100 : 100;

  return (
    <div className="h-[6px] rounded-[3px] overflow-hidden flex bg-c-border min-w-[80px]">
      <div style={{ width: `${builtPct}%` }} className="bg-c-accent" />
      <div style={{ width: `${plannedPct}%` }} className="bg-c-secondary" />
      <div style={{ width: `${unplannedPct}%` }} className="bg-c-border-mid" />
    </div>
  );
}
