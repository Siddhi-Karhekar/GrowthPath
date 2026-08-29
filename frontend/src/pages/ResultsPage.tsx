import { Link, useLocation, useParams } from "react-router-dom";
import type { AttemptResultOut } from "../types/api";
import JournalCard from "../components/JournalCard";
import Chip from "../components/Chip";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function ResultsPage() {
  const { attemptId } = useParams();
  const location = useLocation();
  const result = location.state as AttemptResultOut | undefined;

  if (!result || result.attempt_id !== attemptId) {
    return (
      <JournalCard hoverable={false} className="max-w-xl p-8 text-center">
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          Results aren't available on refresh yet in this MVP - check your{" "}
          <Link to="/progress" className="text-primary font-semibold">
            growth dashboard
          </Link>{" "}
          for the recorded score.
        </p>
      </JournalCard>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="font-headline-lg text-headline-lg text-on-background mb-2">Results</h2>
      <p className="font-display-hero text-display-hero text-primary mb-8">
        {result.total_score} / {result.max_score}{" "}
        <span className="font-body-lg text-body-lg text-on-surface-variant">({result.percentage}%)</span>
      </p>

      <div className="space-y-4">
        {result.graded_answers.map((a) => (
          <JournalCard key={a.question_id} hoverable={false} className="p-5">
            <div className="flex justify-between items-center gap-3 mb-2">
              <span className="font-label-md text-label-md text-on-surface">
                {a.score} / {a.max_score} marks
              </span>
              {a.needs_review && <Chip tone="tertiary">Low confidence - review this one</Chip>}
            </div>
            <p className="font-body-md text-on-surface-variant">{a.feedback}</p>
            {(a.time_taken_seconds !== null || a.revisit_count > 0) && (
              <p className="font-caption text-caption text-on-surface-variant mt-3">
                {a.time_taken_seconds !== null && `Spent ${formatDuration(a.time_taken_seconds)}`}
                {a.time_taken_seconds !== null && a.revisit_count > 0 && " · "}
                {a.revisit_count > 0 && `Revisited ${a.revisit_count}x`}
              </p>
            )}
          </JournalCard>
        ))}
      </div>

      <Link to="/progress" className="inline-block mt-8 font-label-md text-label-md text-primary">
        View my growth dashboard →
      </Link>
    </div>
  );
}
