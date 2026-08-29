import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { DocumentOut, QuestionFormat } from "../types/api";
import JournalCard from "../components/JournalCard";
import Button from "../components/Button";

export default function TestConfigPage() {
  const [params] = useSearchParams();
  const documentParam = params.get("document") ?? "";
  const subjectParam = params.get("subject") ?? "";
  const topicParam = params.get("topic") ?? "";
  const navigate = useNavigate();

  const [documentId, setDocumentId] = useState(documentParam);
  const [subjectDocuments, setSubjectDocuments] = useState<DocumentOut[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  const [format, setFormat] = useState<QuestionFormat>("mixed");
  const [totalMarks, setTotalMarks] = useState(40);
  const [adaptive, setAdaptive] = useState(false);
  const [topicFocus, setTopicFocus] = useState(topicParam);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming from the knowledge graph ("Practice this concept") gives a subject,
  // not a specific document - a concept can span several documents in that
  // subject, so let the student pick which one to generate the test from.
  useEffect(() => {
    if (documentParam || !subjectParam) return;
    setLoadingDocuments(true);
    api
      .listDocuments(subjectParam)
      .then((docs) => {
        const ready = docs.filter((d) => d.status === "ready");
        setSubjectDocuments(ready);
        if (ready.length > 0) setDocumentId(ready[0].id);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingDocuments(false));
  }, [documentParam, subjectParam]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const test = await api.generateTest({
        document_id: documentId,
        format,
        total_marks: totalMarks,
        adaptive,
        topic_focus: topicFocus || null,
      });
      navigate(`/tests/${test.id}/take`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const formatLabels: Record<QuestionFormat, string> = { mcq: "MCQ", theory: "Theory", mixed: "Mixed" };

  return (
    <div className="max-w-lg">
      <h2 className="font-headline-lg text-headline-lg text-on-background mb-2">Create a test</h2>
      <p className="font-body-md text-on-surface-variant mb-6">
        {topicParam ? `Configure a practice test focused on "${topicParam}".` : "Configure how you want to be tested on this document."}
      </p>

      <JournalCard hoverable={false} className="p-6 space-y-6">
        {subjectParam && !documentParam && (
          <div>
            <label className="block font-label-md text-label-md text-on-surface-variant mb-2">Document</label>
            {loadingDocuments ? (
              <p className="font-body-md text-caption text-on-surface-variant">Loading documents...</p>
            ) : subjectDocuments.length === 0 ? (
              <p className="font-body-md text-caption text-on-surface-variant">No ready documents in this subject yet.</p>
            ) : (
              <select
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none"
              >
                {subjectDocuments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.filename}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <label className="block font-label-md text-label-md text-on-surface-variant mb-2">Question format</label>
          <div className="flex gap-2">
            {(["mcq", "theory", "mixed"] as QuestionFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 rounded-full py-2 text-label-md font-label-md transition-colors border-2 ${
                  format === f
                    ? "bg-primary border-primary text-on-primary"
                    : "border-outline-variant text-on-surface-variant hover:border-primary"
                }`}
              >
                {formatLabels[f]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block font-label-md text-label-md text-on-surface-variant mb-2">Total marks: {totalMarks}</label>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={totalMarks}
            onChange={(e) => setTotalMarks(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between font-caption text-caption text-on-surface-variant mt-1">
            <span>10</span>
            <span>40</span>
            <span>80</span>
            <span>100</span>
          </div>
        </div>

        <div>
          <label className="block font-label-md text-label-md text-on-surface-variant mb-1.5">Focus topic (optional)</label>
          <input
            type="text"
            value={topicFocus}
            onChange={(e) => setTopicFocus(e.target.value)}
            placeholder="e.g. a weak area from your growth dashboard"
            className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none placeholder-on-surface-variant/60"
          />
        </div>

        <label className="flex items-center gap-2.5 font-body-md text-on-surface-variant cursor-pointer">
          <input type="checkbox" checked={adaptive} onChange={(e) => setAdaptive(e.target.checked)} className="w-4 h-4 accent-primary" />
          Adaptive difficulty (questions adjust to how you're doing, live)
        </label>

        {error && <p className="text-sm text-error">{error}</p>}

        <Button variant="primary" className="w-full" onClick={handleGenerate} disabled={generating || !documentId}>
          {generating ? "Generating test..." : "Generate test"}
        </Button>
      </JournalCard>
    </div>
  );
}
