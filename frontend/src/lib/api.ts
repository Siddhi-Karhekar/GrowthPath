import { supabase } from "./supabase";
import type {
  AttemptResultOut,
  ConceptCandidateOut,
  ConceptGraphOut,
  DocumentOut,
  NoteOut,
  OCRAnswerOut,
  ProgressSummaryOut,
  QuestionOut,
  StudyGuideOut,
  SubjectOut,
  TestGenerateRequest,
  TestOut,
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    ...(await authHeader()),
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  uploadDocument: (file: File, subjectId?: string | null, documentType: "textbook" | "notes" = "textbook") => {
    const form = new FormData();
    form.append("file", file);
    if (subjectId) form.append("subject_id", subjectId);
    form.append("document_type", documentType);
    return request<DocumentOut>("/api/documents", { method: "POST", body: form });
  },

  uploadDocumentFromLink: (url: string, subjectId?: string | null, documentType: "textbook" | "notes" = "textbook") =>
    request<DocumentOut>("/api/documents/from-link", {
      method: "POST",
      body: JSON.stringify({ url, subject_id: subjectId ?? null, document_type: documentType }),
    }),

  reuploadDocument: (documentId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentOut>(`/api/documents/${documentId}/reupload`, { method: "PUT", body: form });
  },

  listDocuments: (subjectId?: string | null) =>
    request<DocumentOut[]>(`/api/documents${subjectId ? `?subject_id=${subjectId}` : ""}`),

  getDocument: (id: string) => request<DocumentOut>(`/api/documents/${id}`),

  listSubjects: () => request<SubjectOut[]>("/api/subjects"),

  createSubject: (name: string) =>
    request<SubjectOut>("/api/subjects", { method: "POST", body: JSON.stringify({ name }) }),

  renameSubject: (id: string, name: string) =>
    request<SubjectOut>(`/api/subjects/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),

  deleteSubject: (id: string) => request<void>(`/api/subjects/${id}`, { method: "DELETE" }),

  generateTest: (req: TestGenerateRequest) =>
    request<TestOut>("/api/tests/generate", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  getTest: (id: string) => request<TestOut>(`/api/tests/${id}`),

  checkMcqAnswer: (questionId: string, response: string) =>
    request<{ is_correct: boolean | null }>(`/api/tests/questions/${questionId}/check`, {
      method: "POST",
      body: JSON.stringify({ response }),
    }),

  ocrAnswerImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<OCRAnswerOut>("/api/tests/ocr-answer", { method: "POST", body: form });
  },

  nextAdaptiveQuestion: (
    testId: string,
    answeredQuestionIds: string[],
    runningScore: number,
    runningMax: number
  ) =>
    request<QuestionOut | null>(`/api/tests/${testId}/next-question`, {
      method: "POST",
      body: JSON.stringify({
        answered_question_ids: answeredQuestionIds,
        running_score: runningScore,
        running_max: runningMax,
      }),
    }),

  submitAttempt: (
    testId: string,
    answers: { question_id: string; response: string }[],
    timeTakenSeconds: number
  ) =>
    request<AttemptResultOut>("/api/attempts/submit", {
      method: "POST",
      body: JSON.stringify({
        test_id: testId,
        answers,
        time_taken_seconds: timeTakenSeconds,
      }),
    }),

  getProgress: (subjectId?: string | null) =>
    request<ProgressSummaryOut>(`/api/analytics/progress${subjectId ? `?subject_id=${subjectId}` : ""}`),

  generateStudyGuide: (documentId: string) =>
    request<StudyGuideOut>("/api/study-guides/generate", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId }),
    }),

  getLatestStudyGuide: (documentId: string) =>
    request<StudyGuideOut | null>(`/api/study-guides/by-document/${documentId}`),

  // ---------- Notes ----------

  generateNotes: (documentId: string) =>
    request<NoteOut>("/api/notes/generate", { method: "POST", body: JSON.stringify({ document_id: documentId }) }),

  getLatestNotes: (documentId: string) => request<NoteOut | null>(`/api/notes/by-document/${documentId}`),

  createNote: (subjectId: string | null, title: string, content: string) =>
    request<NoteOut>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ subject_id: subjectId, title, content }),
    }),

  listNotes: (subjectId?: string | null) =>
    request<NoteOut[]>(`/api/notes${subjectId ? `?subject_id=${subjectId}` : ""}`),

  // ---------- Knowledge graph ----------

  buildConceptGraph: (subjectId: string) =>
    request<ConceptGraphOut>("/api/concepts/build", { method: "POST", body: JSON.stringify({ subject_id: subjectId }) }),

  getConceptGraph: (subjectId: string) => request<ConceptGraphOut>(`/api/concepts/graph/${subjectId}`),

  listConceptCandidates: (subjectId: string) => request<ConceptCandidateOut[]>(`/api/concepts/candidates/${subjectId}`),

  resolveConceptCandidate: (candidateId: string, resolution: "confirm_same" | "reject_as_different") =>
    request<void>(`/api/concepts/candidates/${candidateId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution }),
    }),
};
