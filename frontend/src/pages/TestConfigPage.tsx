import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { DocumentOut, QuestionFormat } from "../types/api";

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

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Create a test</h1>
      <p className="text-sm text-slate-500 mb-6">
        {topicParam ? `Configure a practice test focused on "${topicParam}".` : "Configure how you want to be tested on this document."}
      </p>

      <div className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-2xl p-6 space-y-5 shadow-sm shadow-teal-500/5">
        {subjectParam && !documentParam && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Document</label>
            {loadingDocuments ? (
              <p className="text-sm text-slate-400">Loading documents...</p>
            ) : subjectDocuments.length === 0 ? (
              <p className="text-sm text-slate-400">No ready documents in this subject yet.</p>
            ) : (
              <select
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {subjectDocuments.map((d) => (
                  <option key={d.id} value={d.id}>{d.filename}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Question format</label>
          <div className="flex gap-2">
            {(["mcq", "theory", "mixed"] as QuestionFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  format === f
                    ? "bg-gradient-to-r from-teal-500 to-sky-500 border-transparent text-white shadow-sm shadow-teal-500/25"
                    : "border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-300"
                }`}
              >
                {f === "mcq" ? "MCQ" : f === "theory" ? "Theory" : "Mixed"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Total marks: {totalMarks}
          </label>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={totalMarks}
            onChange={(e) => setTotalMarks(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>10</span>
            <span>40</span>
            <span>80</span>
            <span>100</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Focus topic (optional)
          </label>
          <input
            type="text"
            value={topicFocus}
            onChange={(e) => setTopicFocus(e.target.value)}
            placeholder="e.g. a weak area from your progress page"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={adaptive} onChange={(e) => setAdaptive(e.target.checked)} className="accent-teal-500" />
          Adaptive difficulty (questions adjust to how you're doing, live)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={generating || !documentId}
          className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-400 hover:to-sky-400 disabled:opacity-60 text-white text-sm font-medium py-2.5 shadow-sm shadow-teal-500/25"
        >
          {generating ? "Generating test..." : "Generate test"}
        </button>
      </div>
    </div>
  );
}
