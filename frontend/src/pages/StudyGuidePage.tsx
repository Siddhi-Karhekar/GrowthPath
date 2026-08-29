import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { StudyGuideOut } from "../types/api";
import JournalCard from "../components/JournalCard";
import Chip from "../components/Chip";
import ProgressBar from "../components/ProgressBar";
import Button from "../components/Button";

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

  if (loading) return <p className="text-on-surface-variant font-body-md">Loading...</p>;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-headline-lg text-headline-lg text-on-background">Study guide</h2>
        {guide && (
          <div className="flex items-center gap-5">
            <button onClick={() => window.print()} className="font-label-md text-label-md text-on-surface-variant hover:text-primary">
              Download as PDF
            </button>
            <button onClick={handleGenerate} disabled={generating} className="font-label-md text-label-md text-primary disabled:opacity-50">
              {generating ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
        )}
      </div>
      <p className="font-body-md text-on-surface-variant mb-1">
        Topics ranked by how much of your document covers them, with a predicted format and mark range for each.
      </p>
      <p className="font-caption text-caption text-on-surface-variant mb-6">
        This is an estimate based on how your own material emphasizes each topic - not a leaked or guaranteed exam question.
      </p>

      {error && <p className="text-sm text-error mb-4">{error}</p>}

      {!guide ? (
        <Button variant="primary" onClick={handleGenerate} disabled={generating}>
          {generating ? "Analyzing document..." : "Generate study guide"}
        </Button>
      ) : (
        <div id="printable-content" className="space-y-4">
          <h1 className="hidden print:block font-headline-md text-headline-md text-on-background mb-1">Study guide</h1>
          <p className="hidden print:block font-caption text-caption text-on-surface-variant mb-4">
            GrowthPath study guide - generated {new Date(guide.created_at).toLocaleDateString()}
          </p>
          {guide.topics.map((t) => (
            <JournalCard key={t.topic} hoverable={false} className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-title-lg text-title-lg text-on-background">{t.topic}</span>
                <span className="font-caption text-caption text-on-surface-variant">{Math.round(t.importance * 100)}% of document</span>
              </div>
              <ProgressBar value={Math.round(t.importance * 100)} className="mb-3" />
              <div className="flex items-center gap-2 mb-2">
                <Chip tone="primary">{formatLabel[t.predicted_format] ?? t.predicted_format}</Chip>
                <Chip tone="neutral">{t.predicted_marks_range} marks</Chip>
              </div>
              <p className="font-body-md text-on-surface-variant">{t.rationale}</p>
            </JournalCard>
          ))}
        </div>
      )}
    </div>
  );
}
