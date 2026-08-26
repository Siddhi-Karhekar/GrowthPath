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
  document_type: "textbook" | "notes";
  source_type: "upload" | "link";
  source_url: string | null;
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

// ---------- Notes ----------

export interface NoteOut {
  id: string;
  document_id: string | null;
  title: string;
  content: string;
  generated: boolean;
  created_at: string | null;
}

// ---------- Knowledge graph ----------

export type RelationType = "prerequisite" | "related" | "part_of" | "contrasts_with";

export interface ConceptOut {
  id: string;
  canonical_name: string;
  description: string | null;
  mastery: number | null;
}

export interface ConceptEdgeOut {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  relation_type: RelationType;
  weight: number;
  rationale: string | null;
}

export interface ConceptGraphOut {
  subject_id: string;
  concepts: ConceptOut[];
  edges: ConceptEdgeOut[];
}

export interface ConceptCandidateOut {
  id: string;
  new_alias: string;
  candidate_concept_id: string;
  candidate_concept_name: string;
  embedding_similarity: number;
  llm_verdict: string | null;
  llm_rationale: string | null;
  status: string;
}
