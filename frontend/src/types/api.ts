export type QuestionFormat = "mcq" | "theory" | "mixed";

export interface SubjectOut {
  id: string;
  name: string;
  created_at: string;
}

export interface DocumentOut {
  id: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  page_count: number | null;
  subject_id: string | null;
  version: number;
  created_at: string;
  updated_at: string | null;
}

export interface QuestionOut {
  id: string;
  order_index: number;
  format: "mcq" | "theory";
  prompt: string;
  options: string[] | null;
  marks: number;
  difficulty: number;
  topic: string | null;
}

export interface TestOut {
  id: string;
  document_id: string;
  format: QuestionFormat;
  total_marks: number;
  adaptive: boolean;
  created_at: string;
  questions: QuestionOut[];
}

export interface TestGenerateRequest {
  document_id: string;
  format: QuestionFormat;
  total_marks: number;
  adaptive: boolean;
  topic_focus?: string | null;
}

export interface GradedAnswerOut {
  question_id: string;
  score: number;
  max_score: number;
  is_correct: boolean | null;
  confidence: number | null;
  feedback: string;
  needs_review: boolean;
}

export interface AttemptResultOut {
  attempt_id: string;
  test_id: string;
  total_score: number;
  max_score: number;
  percentage: number;
  graded_answers: GradedAnswerOut[];
}

export interface PerformancePoint {
  date: string;
  percentage: number;
  test_id: string;
}

export interface TopicMastery {
  topic: string;
  mastery: number;
  attempts_count: number;
  trend: number;
}

export interface RiskFlag {
  topic: string;
  reason: string;
  severity: "low" | "medium" | "high";
}

export interface RevisionReminder {
  topic: string;
  due_date: string;
  reason: string;
}

export interface ProgressSummaryOut {
  history: PerformancePoint[];
  topic_mastery: TopicMastery[];
  risk_flags: RiskFlag[];
  revision_reminders: RevisionReminder[];
  forecast_next_score: number | null;
}

export interface StudyGuideTopic {
  topic: string;
  importance: number;
  predicted_format: "mcq" | "theory" | "either";
  predicted_marks_range: string;
  rationale: string;
}

export interface StudyGuideOut {
  id: string;
  document_id: string;
  topics: StudyGuideTopic[];
  created_at: string;
}
