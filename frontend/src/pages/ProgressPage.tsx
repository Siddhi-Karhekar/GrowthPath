import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import type { ProgressSummaryOut, SubjectOut } from "../types/api";

const severityColor: Record<string, string> = {
  high: "border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  medium: "border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
  low: "border-slate-200 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
};

// Same 0.45 / 0.7 thresholds the backend uses for risk flags (analytics_service.py),
// so this chart's colors agree with what "Needs attention" means elsewhere on the page.
function masteryBarColor(masteryPct: number): string {
  if (masteryPct < 45) return "#fb7185"; // rose-400
  if (masteryPct < 70) return "#fbbf24"; // amber-400
  return "#2dd4bf"; // teal-400
}

function isoWeekLabel(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr);
  const monday = new Date(d);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  monday.setDate(d.getDate() - day);
  const key = monday.toISOString().slice(0, 10);
  const label = monday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { key, label };
}

export default function ProgressPage() {
  const [summary, setSummary] = useState<ProgressSummaryOut | null>(null);
  const [subjects, setSubjects] = useState<SubjectOut[]>([]);
  const [activeSubject, setActiveSubject] = useState<string>(""); // "" = all subjects
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listSubjects().then(setSubjects).catch(() => {});
  }, []);

  useEffect(() => {
    setSummary(null);
    api.getProgress(activeSubject || undefined).then(setSummary).catch((e) => setError((e as Error).message));
  }, [activeSubject]);

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!summary) return <p className="text-slate-500">Loading your progress...</p>;

  const chartData = summary.history.map((h) => ({
    date: new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    percentage: h.percentage,
  }));

  const masteryChartData = [...summary.topic_mastery]
    .sort((a, b) => a.mastery - b.mastery)
    .map((t) => ({ topic: t.topic, masteryPct: Math.round(t.mastery * 100) }));

  // Study activity: how many tests were taken per week - a lightweight,
  // already-collected proxy for study consistency, without needing a
  // separate behavioral-tracking pipeline.
  const activityBuckets = new Map<string, { label: string; count: number }>();
  for (const h of summary.history) {
    const { key, label } = isoWeekLabel(h.date);
    const existing = activityBuckets.get(key);
    if (existing) existing.count += 1;
    else activityBuckets.set(key, { label, count: 1 });
  }
  const activityData = [...activityBuckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-1">My Growth</h1>
          <p className="text-sm text-slate-500">
            A running picture of how you're doing over time - not a grade, a trajectory.
          </p>
        </div>
        {subjects.length > 0 && (
          <select
            value={activeSubject}
            onChange={(e) => setActiveSubject(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {summary.history.length === 0 ? (
        <p className="text-slate-400 text-sm">Take your first test to start seeing progress here.</p>
      ) : (
        <>
          <div className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-2xl p-5 shadow-sm shadow-teal-500/5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Score over time</h2>
              {summary.forecast_next_score !== null && (
                <span className="text-xs text-slate-500">
                  Projected next score: <span className="font-semibold text-teal-600">{summary.forecast_next_score}%</span>
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis domain={[0, 100]} fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="percentage" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {activityData.length > 1 && (
            <div className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-2xl p-5 shadow-sm shadow-teal-500/5">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Study activity (tests per week)</h2>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {summary.risk_flags.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Needs attention</h2>
              <div className="space-y-2">
                {summary.risk_flags.map((r) => (
                  <div key={r.topic} className={`rounded-xl border px-4 py-2.5 text-sm ${severityColor[r.severity]}`}>
                    <span className="font-medium">{r.topic}</span> - {r.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {masteryChartData.length > 0 && (
            <div className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-2xl p-5 shadow-sm shadow-teal-500/5">
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Mastery by topic</h2>
              <ResponsiveContainer width="100%" height={Math.max(160, masteryChartData.length * 34)}>
                <BarChart data={masteryChartData} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200 dark:stroke-slate-800" />
                  <XAxis type="number" domain={[0, 100]} fontSize={12} />
                  <YAxis type="category" dataKey="topic" width={140} fontSize={12} />
                  <Tooltip formatter={(value) => [`${value}%`, "Mastery"]} />
                  <Bar dataKey="masteryPct" radius={[0, 4, 4, 0]}>
                    {masteryChartData.map((entry, i) => (
                      <Cell key={i} fill={masteryBarColor(entry.masteryPct)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {summary.revision_reminders.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Upcoming revision</h2>
              <div className="space-y-2">
                {summary.revision_reminders.map((r) => (
                  <div key={r.topic} className="flex justify-between bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-xl px-4 py-2.5 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{r.topic}</span>
                    <span className="text-slate-400">{new Date(r.due_date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
