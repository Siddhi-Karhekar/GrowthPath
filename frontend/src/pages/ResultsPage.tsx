import { Link, useLocation, useParams } from "react-router-dom";
import type { AttemptResultOut } from "../types/api";

export default function ResultsPage() {
  const { attemptId } = useParams();
  const location = useLocation();
  const result = location.state as AttemptResultOut | undefined;

  if (!result || result.attempt_id !== attemptId) {
    return (
      <p className="text-slate-500">
        Results aren't available on refresh yet in this MVP - check your{" "}
        <Link to="/progress" className="text-teal-600 hover:text-teal-500">
          growth dashboard
        </Link>{" "}
        for the recorded score.
      </p>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Results</h1>
      <p className="text-3xl font-bold text-teal-600 mb-6">
        {result.total_score} / {result.max_score}{" "}
        <span className="text-lg text-slate-400 font-normal">({result.percentage}%)</span>
      </p>

      <div className="space-y-3">
        {result.graded_answers.map((a) => (
          <div
            key={a.question_id}
            className={`rounded-2xl border p-4 ${
              a.needs_review
                ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
                : "border-teal-100 dark:border-teal-900/40 bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm"
            }`}
          >
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {a.score} / {a.max_score} marks
              </span>
              {a.needs_review && (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Low grading confidence - review this one yourself
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">{a.feedback}</p>
          </div>
        ))}
      </div>

      <Link to="/progress" className="inline-block mt-6 text-sm text-teal-600 hover:text-teal-500 font-medium">
        View my growth dashboard →
      </Link>
    </div>
  );
}
