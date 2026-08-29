interface HeatmapCalendarProps {
  data: { date: string; count: number }[];
  /** How many trailing days to render, oldest first. */
  days?: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function intensityClass(count: number, max: number): string {
  if (count === 0) return "bg-surface-container-high";
  const ratio = count / max;
  if (ratio > 0.8) return "bg-primary";
  if (ratio > 0.5) return "bg-primary/60";
  return "bg-primary/30";
}

/** GitHub-style contribution grid, fed by real day-bucketed test-attempt
 * counts from the backend (ProgressSummaryOut.activity_heatmap). Renders
 * a flat 7-column grid of the trailing `days` days - simple chronological
 * fill rather than weekday-aligned columns, matching the mockup. */
export default function HeatmapCalendar({ data, days = 35 }: HeatmapCalendarProps) {
  const counts = new Map(data.map((d) => [d.date, d.count]));
  const max = Math.max(1, ...data.map((d) => d.count));

  const today = new Date();
  const cells: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = isoDate(d);
    cells.push({ date, count: counts.get(date) ?? 0 });
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((c) => (
          <div
            key={c.date}
            title={`${c.date}: ${c.count} test${c.count === 1 ? "" : "s"}`}
            className={`aspect-square rounded-sm ${intensityClass(c.count, max)}`}
          />
        ))}
      </div>
      <div className="flex justify-between items-center mt-4 text-caption font-caption text-on-surface-variant">
        <span>Less</span>
        <div className="flex space-x-1">
          <div className="w-3 h-3 rounded-sm bg-surface-container-high" />
          <div className="w-3 h-3 rounded-sm bg-primary/30" />
          <div className="w-3 h-3 rounded-sm bg-primary/60" />
          <div className="w-3 h-3 rounded-sm bg-primary" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
