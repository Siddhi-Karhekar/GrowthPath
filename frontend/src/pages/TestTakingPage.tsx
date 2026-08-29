import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { QuestionOut, TestOut } from "../types/api";
import JournalCard from "../components/JournalCard";
import Chip from "../components/Chip";
import ProgressBar from "../components/ProgressBar";
import Button from "../components/Button";

interface AnsweredEntry {
  question: QuestionOut;
  response: string;
  time_taken_seconds: number;
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M15 5L8 12L15 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ForwardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M9 5L16 12L9 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 7.5V12L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M7.5 12.5L10.2 15.2L16.5 8.5" stroke="var(--color-on-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
  const [nowTick, setNowTick] = useState(() => Date.now());
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

  // A visible elapsed-time badge in the header - counts up, since there's
  // no time-limit field anywhere in the data model to count down from.
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <p className="text-on-surface-variant font-body-md text-center py-16">Loading test...</p>;
  if (error) return <p className="text-error text-sm text-center py-16">{error}</p>;
  if (!test) return null;

  const response = current ? responses[current.id] ?? "" : "";
  const elapsedSeconds = Math.max(0, Math.round((nowTick - startedAt) / 1000));

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

  const questionsShown = test.adaptive ? answered.length + 1 : queueIndex + 1;
  const questionsTotal = test.adaptive ? undefined : test.questions.length;
  const canGoBack = !test.adaptive && queueIndex > 0;
  const percentComplete = questionsTotal ? Math.round(((questionsShown - 1) / questionsTotal) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-background font-body-md">
      <header className="w-full flex justify-between items-center px-margin-desktop py-4 sticky top-0 bg-background/90 backdrop-blur-md z-50">
        <button
          onClick={() => navigate("/")}
          className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-2 group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">
            <BackIcon />
          </span>
          <span className="font-label-md text-label-md">Save &amp; Exit</span>
        </button>
        <div className="font-title-lg text-title-lg text-primary font-bold">Taking a Test</div>
        <div className="flex items-center gap-2 text-on-surface-variant bg-surface-container-high px-4 py-2 rounded-full border-[1.5px] border-outline-variant">
          <ClockIcon />
          <span className="font-label-md text-label-md font-bold">{formatMMSS(elapsedSeconds)}</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-safe-area md:px-margin-desktop py-12 max-w-content-max-width mx-auto w-full">
        {submitting ? (
          <p className="text-on-surface-variant font-body-lg text-body-lg">Grading your answers...</p>
        ) : !current ? (
          <p className="text-on-surface-variant font-body-lg text-body-lg">No more questions.</p>
        ) : (
          <>
            <div className="w-full max-w-3xl mb-8">
              {questionsTotal ? (
                <>
                  <div className="flex justify-between items-center mb-2 font-caption text-caption text-on-surface-variant">
                    <span>
                      Question {questionsShown} of {questionsTotal}
                    </span>
                    <span>{percentComplete}% Completed</span>
                  </div>
                  <ProgressBar value={percentComplete} className="border-[1.5px] border-outline-variant" />
                </>
              ) : (
                <>
                  <div className="mb-2 font-caption text-caption text-on-surface-variant">Question {questionsShown}</div>
                  <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden border-[1.5px] border-outline-variant">
                    <div className="h-full w-2/5 bg-primary/60 rounded-full animate-pulse" />
                  </div>
                </>
              )}
            </div>

            <JournalCard hoverable={false} className="w-full max-w-3xl p-8 md:p-12 relative overflow-hidden">
              <div className="absolute top-0 right-12 w-24 h-4 bg-secondary-container/40 -translate-y-1/2 rotate-2 blur-[1px]" />
              <div className="space-y-8">
                <Chip tone="secondary">{current.topic ?? "General"}</Chip>

                <h2 className="font-headline-lg text-headline-lg text-on-background whitespace-pre-wrap">{current.prompt}</h2>

                {current.format === "mcq" && current.options ? (
                  <div className="grid grid-cols-1 gap-4 mt-8">
                    {current.options.map((opt) => {
                      const selected = response === opt;
                      return (
                        <label
                          key={opt}
                          className={`relative flex items-start p-6 cursor-pointer border-[1.5px] rounded-xl transition-all group ${
                            selected
                              ? "border-primary bg-surface-container-low shadow-[0_2px_12px_rgba(0,104,95,0.08)]"
                              : "border-outline-variant hover:border-primary hover:bg-surface-container-low"
                          }`}
                        >
                          <div className="flex items-center h-6">
                            <input
                              type="radio"
                              name="mcq"
                              value={opt}
                              checked={selected}
                              onChange={() => setResponse(opt)}
                              className="w-5 h-5 accent-primary"
                            />
                          </div>
                          <div className="ml-4 flex-1">
                            <span className={`font-body-lg text-body-lg text-on-surface ${selected ? "font-medium" : ""}`}>{opt}</span>
                          </div>
                          {selected && <span className="absolute top-1/2 -translate-y-1/2 right-6 text-primary"><CheckIcon /></span>}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      rows={6}
                      placeholder="Write your answer, or upload a photo of a handwritten answer below..."
                      className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant focus:border-primary focus:ring-0 px-3 py-2 rounded-t-md font-body-md text-on-surface outline-none"
                    />
                    <div className="mt-3 flex items-center gap-3">
                      <label className="text-label-md font-label-md text-primary hover:opacity-80 cursor-pointer">
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
                    <p className="text-caption font-caption text-on-surface-variant mt-1.5">
                      We'll read the text out with OCR and drop it in above - handwriting recognition isn't
                      perfect, so check it over before submitting.
                    </p>
                    {ocrError && <p className="text-caption font-caption text-error mt-1">{ocrError}</p>}
                  </div>
                )}

                {error && <p className="text-sm text-error">{error}</p>}
              </div>
            </JournalCard>

            <div className="w-full max-w-3xl mt-12 flex justify-between items-center">
              {canGoBack ? (
                <Button variant="secondary" onClick={goToPrevious} className="group">
                  <span className="group-hover:-translate-x-1 transition-transform">
                    <BackIcon />
                  </span>
                  Previous
                </Button>
              ) : (
                <span />
              )}
              <Button variant="primary" onClick={goToNext} disabled={!response.trim()} className="group">
                {test.adaptive ? "Next" : queueIndex + 1 >= test.questions.length ? "Submit" : "Next Question"}
                <span className="group-hover:translate-x-1 transition-transform">
                  <ForwardIcon />
                </span>
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
