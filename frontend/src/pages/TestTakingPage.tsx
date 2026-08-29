import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { QuestionOut, TestOut } from "../types/api";

interface AnsweredEntry {
  question: QuestionOut;
  response: string;
  time_taken_seconds: number;
}

export default function TestTakingPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();

  const [test, setTest] = useState<TestOut | null>(null);
  const [current, setCurrent] = useState<QuestionOut | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  const [answered, setAnswered] = useState<AnsweredEntry[]>([]); // adaptive mode only

  // Non-adaptive mode keeps every question's answer/visits/time by question
  // id, so a student can navigate back to a previous question, see what
  // they wrote, and edit it - not just push forward. Adaptive tests stay
  // forward-only (revisiting would retroactively invalidate the live
  // difficulty path already computed from that answer), so these maps are
  // populated there too but only actually consulted for non-adaptive
  // submission.
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [timeSpent, setTimeSpent] = useState<Record<string, number>>({});
  const [questionShownAt, setQuestionShownAt] = useState(() => Date.now());

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionMax, setSessionMax] = useState(0);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  useEffect(() => {
    if (!testId) return;
    api
      .getTest(testId)
      .then((t) => {
        setTest(t);
        const first = t.questions[0] ?? null;
        setCurrent(first);
        if (first) {
          setVisitCounts({ [first.id]: 1 });
          // Reset the per-question clock now, not at component mount -
          // otherwise the fetch itself would count as "time on question 1".
          setQuestionShownAt(Date.now());
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [testId]);

  if (loading) return <p className="text-slate-500">Loading test...</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!test) return null;

  const response = current ? responses[current.id] ?? "" : "";

  function setResponse(value: string) {
    if (!current) return;
    const questionId = current.id;
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  }

  // Adds elapsed time on whatever's currently shown into timeSpent, and
  // returns the up-to-date total so a caller that's about to submit/push an
  // AnsweredEntry can use it immediately, without waiting on the state
  // update to land on the next render.
  function flushTimeOnCurrent(): number {
    if (!current) return 0;
    const elapsed = Math.max(0, Math.round((Date.now() - questionShownAt) / 1000));
    const total = (timeSpent[current.id] ?? 0) + elapsed;
    setTimeSpent((prev) => ({ ...prev, [current.id]: total }));
    return total;
  }

  function showQuestion(question: QuestionOut, index: number) {
    setQueueIndex(index);
    setCurrent(question);
    setVisitCounts((prev) => ({ ...prev, [question.id]: (prev[question.id] ?? 0) + 1 }));
    setQuestionShownAt(Date.now());
  }

  function goToPrevious() {
    if (!current || test!.adaptive || queueIndex === 0) return;
    flushTimeOnCurrent();
    showQuestion(test!.questions[queueIndex - 1], queueIndex - 1);
  }

  async function goToNext() {
    if (!current) return;
    const timeOnThis = flushTimeOnCurrent();

    if (test!.adaptive) {
      const nextAnswered = [...answered, { question: current, response, time_taken_seconds: timeOnThis }];
      setAnswered(nextAnswered);

      // Live ability signal for adaptive routing only comes from MCQ
      // questions, which can be checked instantly - theory answers need an
      // LLM grading call, so they feed into calibration only after the
      // full attempt is submitted and graded (see calibration_service.py).
      // Use local variables (not state) for the values sent this call,
      // since setState updates aren't visible until the next render.
      let nextSessionScore = sessionScore;
      let nextSessionMax = sessionMax;
      if (current.format === "mcq") {
        try {
          const { is_correct } = await api.checkMcqAnswer(current.id, response);
          nextSessionScore += is_correct ? current.marks : 0;
          nextSessionMax += current.marks;
          setSessionScore(nextSessionScore);
          setSessionMax(nextSessionMax);
        } catch {
          // Non-fatal: adaptive selection just falls back to baseline ability.
        }
      }

      const answeredIds = nextAnswered.map((a) => a.question.id);
      try {
        const next = await api.nextAdaptiveQuestion(test!.id, answeredIds, nextSessionScore, nextSessionMax);
        if (next) {
          setCurrent(next);
          setQuestionShownAt(Date.now());
        } else {
          setCurrent(null);
          await handleSubmitAdaptive(nextAnswered);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    } else {
      const nextIdx = queueIndex + 1;
      if (nextIdx < test!.questions.length) {
        showQuestion(test!.questions[nextIdx], nextIdx);
      } else {
        setCurrent(null);
        await handleSubmitLinear();
      }
    }
  }

  async function handleSubmitAdaptive(finalAnswered: AnsweredEntry[]) {
    setSubmitting(true);
    setError(null);
    try {
      const timeTaken = Math.round((Date.now() - startedAt) / 1000);
      const result = await api.submitAttempt(
        test!.id,
        finalAnswered.map((a) => ({
          question_id: a.question.id,
          response: a.response,
          time_taken_seconds: a.time_taken_seconds,
          revisit_count: 0, // adaptive tests are forward-only - nothing to revisit
        })),
        timeTaken
      );
      navigate(`/attempts/${result.attempt_id}/results`, { state: result });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  async function handleSubmitLinear() {
    setSubmitting(true);
    setError(null);
    try {
      const timeTaken = Math.round((Date.now() - startedAt) / 1000);
      const result = await api.submitAttempt(
        test!.id,
        test!.questions.map((q) => ({
          question_id: q.id,
          response: responses[q.id] ?? "",
          time_taken_seconds: Math.round(timeSpent[q.id] ?? 0),
          revisit_count: Math.max(0, (visitCounts[q.id] ?? 1) - 1),
        })),
        timeTaken
      );
      navigate(`/attempts/${result.attempt_id}/results`, { state: result });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  async function handleHandwrittenUpload(file: File) {
    if (!current) return;
    const questionId = current.id;
    setOcrLoading(true);
    setOcrError(null);
    try {
      const { text } = await api.ocrAnswerImage(file);
      setResponses((prev) => {
        const prevText = prev[questionId] ?? "";
        return { ...prev, [questionId]: prevText.trim() ? `${prevText}\n\n${text}` : text };
      });
    } catch (e) {
      setOcrError((e as Error).message);
    } finally {
      setOcrLoading(false);
    }
  }

  if (submitting) return <p className="text-slate-500">Grading your answers...</p>;

  if (!current) {
    return <p className="text-slate-500">No more questions.</p>;
  }

  const questionsShown = test.adaptive ? answered.length + 1 : queueIndex + 1;
  const questionsTotal = test.adaptive ? undefined : test.questions.length;
  const canGoBack = !test.adaptive && queueIndex > 0;

  return (
    <div className="max-w-2xl">
      <p className="text-xs text-slate-400 mb-2">
        Question {questionsShown}
        {questionsTotal ? ` of ${questionsTotal}` : ""} · {current.marks} mark(s) · topic: {current.topic ?? "General"}
      </p>

      <div className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-sm border border-teal-100 dark:border-teal-900/40 rounded-2xl p-6 shadow-sm shadow-teal-500/5">
        <p className="text-base text-slate-800 dark:text-slate-100 mb-5 whitespace-pre-wrap">{current.prompt}</p>

        {current.format === "mcq" && current.options ? (
          <div className="space-y-2">
            {current.options.map((opt) => (
              <label
                key={opt}
                className={`block cursor-pointer rounded-lg border px-4 py-2.5 text-sm ${
                  response === opt
                    ? "border-teal-400 bg-teal-50 dark:bg-teal-950/50"
                    : "border-slate-200 dark:border-slate-700 hover:border-teal-200"
                }`}
              >
                <input
                  type="radio"
                  name="mcq"
                  value={opt}
                  checked={response === opt}
                  onChange={() => setResponse(opt)}
                  className="mr-2 accent-teal-500"
                />
                {opt}
              </label>
            ))}
          </div>
        ) : (
          <div>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={6}
              placeholder="Write your answer, or upload a photo of a handwritten answer below..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <div className="mt-2 flex items-center gap-3">
              <label className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-500 cursor-pointer">
                {ocrLoading ? "Reading photo..." : "📷 Upload a photo of a handwritten answer"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={ocrLoading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // allow re-selecting the same file
                    if (file) void handleHandwrittenUpload(file);
                  }}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              We'll read the text out with OCR and drop it in above - handwriting recognition isn't
              perfect, so check it over before submitting.
            </p>
            {ocrError && <p className="text-xs text-red-600 mt-1">{ocrError}</p>}
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          {canGoBack && (
            <button
              onClick={goToPrevious}
              className="rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-300 text-sm font-medium px-5 py-2.5"
            >
              Previous
            </button>
          )}
          <button
            onClick={goToNext}
            disabled={!response.trim()}
            className="rounded-lg bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-400 hover:to-sky-400 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 shadow-sm shadow-teal-500/25"
          >
            {test.adaptive
              ? "Next" /* adaptive tests don't know the final length in advance */
              : queueIndex + 1 >= test.questions.length
                ? "Submit"
                : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
