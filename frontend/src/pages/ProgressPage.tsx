import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import type { ProgressSummaryOut, SubjectOut } from "../types/api";
import JournalCard from "../components/JournalCard";
import Chip from "../components/Chip";
import HeatmapCalendar from "../components/HeatmapCalendar";
import { formatDueBucket } from "../lib/format";

// Same 0.45 / 0.7 thresholds the backend uses for risk flags
// (analytics_service.py) and the Knowledge Graph page uses for node color,
// reusing the app's semantic error/tertiary/primary roles so every view
// agrees on what "needs attention" vs. "strong" means.
function masteryBarColor(masteryPct: number): string {
  if (masteryPct < 45) return "#ba1a1a"; // error
  if (masteryPct < 70) return "#6e5e0d"; // tertiary
  return "#00685f"; // primary
}

const severityTone: Record<string, "error" | "tertiary" | "neutral"> = {
  high: "error",
  medium: "tertiary",
  low: "neutral",
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

  if (error) return <p className="text-error text-sm">{error}</p>;
  if (!summary) return <p className="text-on-surface-variant font-body-md">Loading your progress...</p>;

  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const chartData = summary.history.map((h) => ({
    date: new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    percentage: h.percentage,
  }));

  const masteryChartData = [...summary.topic_mastery]
    .sort((a, b) => a.mastery - b.mastery)
    .map((t) => ({ topic: t.topic, masteryPct: Math.round(t.mastery * 100) }));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-background mb-2">Growth Dashboard</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Track your learning trajectory and consistency.
          </p>
        </div>
        {subjects.length > 0 && (
          <select
            value={activeSubject}
            onChange={(e) => setActiveSubject(e.target.value)}
            className="bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {summary.history.length === 0 ? (
        <p className="text-on-surface-variant font-body-md">Take your first test to start seeing progress here.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <JournalCard hoverable={false} className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline-md text-headline-md text-on-background">Knowledge Trajectory</h3>
                {summary.forecast_next_score !== null && (
                  <span className="font-caption text-caption text-on-surface-variant">
                    Projected next: <span className="font-semibold text-primary">{summary.forecast_next_score}%</span>
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e2de" />
                  <XAxis dataKey="date" fontSize={12} stroke="#3d4947" />
                  <YAxis domain={[0, 100]} fontSize={12} stroke="#3d4947" />
                  <Tooltip />
                  <Line type="monotone" dataKey="percentage" stroke="#00685f" strokeWidth={2.5} dot={{ r: 3, fill: "#00685f" }} />
                </LineChart>
              </ResponsiveContainer>
            </JournalCard>

            {summary.risk_flags.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-title-lg text-title-lg text-on-background mb-1">Needs attention</h3>
                {summary.risk_flags.map((r) => (
                  <div key={r.topic} className="flex items-center gap-3">
                    <Chip tone={severityTone[r.severity] ?? "neutral"}>{r.topic}</Chip>
                    <span className="font-body-md text-caption text-on-surface-variant">{r.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <JournalCard hoverable={false} className="p-6">
                <h3 className="font-title-lg text-title-lg text-on-background mb-4">Consistency</h3>
                <HeatmapCalendar data={summary.activity_heatmap} />
              </JournalCard>

              {masteryChartData.length > 0 && (
                <JournalCard hoverable={false} className="p-6">
                  <h3 className="font-title-lg text-title-lg text-on-background mb-4">Topic Mastery</h3>
                  <div className="space-y-4">
                    {masteryChartData.map((t) => (
                      <div key={t.topic}>
                        <div className="flex justify-between font-label-md text-label-md mb-1">
                          <span className="text-on-surface truncate">{t.topic}</span>
                          <span style={{ color: masteryBarColor(t.masteryPct) }}>{t.masteryPct}%</span>
                        </div>
                        <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${t.masteryPct}%`, backgroundColor: masteryBarColor(t.masteryPct) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </JournalCard>
              )}
            </div>

            {masteryChartData.length > 3 && (
              <JournalCard hoverable={false} className="p-6">
                <h3 className="font-title-lg text-title-lg text-on-background mb-4">Mastery by topic</h3>
                <ResponsiveContainer width="100%" height={Math.max(160, masteryChartData.length * 34)}>
                  <BarChart data={masteryChartData} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4e2de" />
                    <XAxis type="number" domain={[0, 100]} fontSize={12} stroke="#3d4947" />
                    <YAxis type="category" dataKey="topic" width={140} fontSize={12} stroke="#3d4947" />
                    <Tooltip formatter={(value) => [`${value}%`, "Mastery"]} />
                    <Bar dataKey="masteryPct" radius={[0, 4, 4, 0]}>
                      {masteryChartData.map((entry, i) => (
                        <Cell key={i} fill={masteryBarColor(entry.masteryPct)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </JournalCard>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <JournalCard hoverable={false} className="p-6 sticky top-10">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-outline-variant/50">
                <span className="text-tertiary">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M6 3.5H15L19 7.5V19.5C19 20.05 18.55 20.5 18 20.5H6C5.45 20.5 5 20.05 5 19.5V4.5C5 3.95 5.45 3.5 6 3.5Z" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M9 11.5H15M9 15H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
                <h3 className="font-title-lg text-title-lg text-on-background">Revision Queue</h3>
              </div>

              {summary.revision_reminders.length === 0 ? (
                <p className="font-body-md text-caption text-on-surface-variant">Nothing due for review right now.</p>
              ) : (
                <div className="space-y-4">
                  {summary.revision_reminders.map((r) => {
                    const bucket = formatDueBucket(r.due_date);
                    const subjectName = r.subject_id ? subjectNameById.get(r.subject_id) : null;
                    const href = r.subject_id
                      ? `/tests/new?subject=${r.subject_id}&topic=${encodeURIComponent(r.topic)}`
                      : `/tests/new?topic=${encodeURIComponent(r.topic)}`;
                    return (
                      <Link
                        key={`${r.topic}-${r.due_date}`}
                        to={href}
                        className="block p-4 rounded-xl bg-surface hover:bg-surface-container-low transition-colors border border-transparent hover:border-outline-variant/50"
                      >
                        <div className="flex justify-between items-start mb-2 gap-2">
                          {subjectName ? <Chip tone="secondary">{subjectName}</Chip> : <span />}
                          <span className={`font-caption text-caption shrink-0 ${bucket.overdue ? "text-error" : "text-on-surface-variant"}`}>
                            {bucket.label}
                          </span>
                        </div>
                        <h4 className="font-body-md font-semibold text-on-background">{r.topic}</h4>
                      </Link>
                    );
                  })}
                </div>
              )}
            </JournalCard>
          </div>
        </div>
      )}
    </div>
  );
}
