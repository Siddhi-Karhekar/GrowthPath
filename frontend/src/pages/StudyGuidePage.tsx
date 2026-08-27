import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { StudyGuideOut } from "../types/api";

const formatLabel: Record<string, string> = {
  mcq: "Likely MCQ",
  theory: "Likely theory",
  either: "Could be either",
};

export default function StudyGuidePage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [guide, setGuide] = useState<StudyGuideOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;
    api
      .getLatestStudyGuide(documentId)
      .then(setGuide)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [documentId]);

  async function handleGenerate() {
    if (!documentId) return;
    setGenerating(true);
    setError(null);
    try {
      setGuide(await api.generateStudyGuide(documentId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Study guide</h1>
        {guide && (
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.print()}
              className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
            >
              Download as PDF
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-sm text-teal-600 hover:text-teal-500 font-medium disabled:opacity-50"
            >
              {generating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-1">
        Topics ranked by how much of your document covers them, with a predicted format and mark range for each.
      </p>
      <p className="text-xs text-slate-400 mb-6">
        This is an estimate based on how your own material emphasizes each topic - not a leaked or guaranteed exam question.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!guide ? (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-lg bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-400 hover:to-sky-400 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 shadow-sm shadow-teal-500/25"
        >
          {generating ? "Analyzing document..." : "Generate study guide"}
        </button>
      ) : (
        <div id="printable-content" className="space-y-3">
          <h1 className="hidden print:block text-xl font-semibold text-slate-900 mb-1">Study guide</h1>
          <p className="hidden print:block text-xs text-slate-400 mb-4">
            GrowthPath study guide - generated {new Date(guide.created_at).toLocaleDateString()}
          </p>
          {guide.topics.map((t) => (
            <div key={t.topic} className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-2xl p-4 shadow-sm shadow-teal-500/5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{t.topic}</span>
                <span className="text-xs text-slate-400">{Math.round(t.importance * 100)}% of document</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-2.5">
                <div className="h-full bg-gradient-to-r from-teal-400 to-sky-500 rounded-full" style={{ width: `${Math.round(t.importance * 100)}%` }} />
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400">
                  {formatLabel[t.predicted_format] ?? t.predicted_format}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {t.predicted_marks_range} marks
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">{t.rationale}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
