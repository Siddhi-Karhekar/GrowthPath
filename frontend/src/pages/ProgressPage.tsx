import { useEffect, useState } from "react";
import {
  CartesianGrid,
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

          <div>
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Topic mastery</h2>
            <div className="space-y-2">
              {summary.topic_mastery.map((t) => (
                <div key={t.topic} className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-xl px-4 py-3 shadow-sm shadow-teal-500/5">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{t.topic}</span>
                    <span className="text-slate-500">{Math.round(t.mastery * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-400 to-sky-500 rounded-full"
                      style={{ width: `${Math.round(t.mastery * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

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
