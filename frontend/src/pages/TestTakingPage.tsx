import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { QuestionOut, TestOut } from "../types/api";

interface AnsweredEntry {
  question: QuestionOut;
  response: string;
}

export default function TestTakingPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();

  const [test, setTest] = useState<TestOut | null>(null);
  const [current, setCurrent] = useState<QuestionOut | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  const [answered, setAnswered] = useState<AnsweredEntry[]>([]);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionMax, setSessionMax] = useState(0);

  useEffect(() => {
    if (!testId) return;
    api
      .getTest(testId)
      .then((t) => {
        setTest(t);
        setCurrent(t.questions[0] ?? null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [testId]);

  if (loading) return <p className="text-slate-500">Loading test...</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!test) return null;

  async function goToNext() {
    if (!current) return;
    const nextAnswered = [...answered, { question: current, response }];
    setAnswered(nextAnswered);
    setResponse("");

    if (test!.adaptive) {
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
        setCurrent(next);
        if (!next) await handleSubmit(nextAnswered);
      } catch (e) {
        setError((e as Error).message);
      }
    } else {
      const nextIdx = queueIndex + 1;
      setQueueIndex(nextIdx);
      if (nextIdx < test!.questions.length) {
        setCurrent(test!.questions[nextIdx]);
      } else {
        setCurrent(null);
        await handleSubmit(nextAnswered);
      }
    }
  }

  async function handleSubmit(finalAnswered: AnsweredEntry[]) {
    setSubmitting(true);
    setError(null);
    try {
      const timeTaken = Math.round((Date.now() - startedAt) / 1000);
      const result = await api.submitAttempt(
        test!.id,
        finalAnswered.map((a) => ({ question_id: a.question.id, response: a.response })),
        timeTaken
      );
      navigate(`/attempts/${result.attempt_id}/results`, { state: result });
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  if (submitting) return <p className="text-slate-500">Grading your answers...</p>;

  if (!current) {
    return <p className="text-slate-500">No more questions.</p>;
  }

  const questionsShown = test.adaptive ? answered.length + 1 : queueIndex + 1;
  const questionsTotal = test.adaptive ? undefined : test.questions.length;

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
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={6}
            placeholder="Write your answer..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <button
          onClick={goToNext}
          disabled={!response.trim()}
          className="mt-5 rounded-lg bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-400 hover:to-sky-400 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 shadow-sm shadow-teal-500/25"
        >
          {test.adaptive
            ? "Next" /* adaptive tests don't know the final length in advance */
            : queueIndex + 1 >= test.questions.length
              ? "Submit"
              : "Next"}
        </button>
      </div>
    </div>
  );
}
