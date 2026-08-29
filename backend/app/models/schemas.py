"""
Pydantic request/response models shared across routers. These mirror the
Postgres tables defined in docs/schema.sql (+ migration_001, migration_002)
but are intentionally kept separate from the DB layer (services/*.py) so
the API contract doesn't silently change if we tweak a column.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------- Subjects (folders) ----------

class SubjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class SubjectOut(BaseModel):
    id: str
    name: str
    created_at: datetime


# ---------- Documents ----------

class DocumentOut(BaseModel):
    id: str
    filename: str
    status: str  # "processing" | "ready" | "failed"
    page_count: Optional[int] = None
    subject_id: Optional[str] = None
    version: int = 1
    document_type: str = "textbook"  # "textbook" | "notes"
    source_type: str = "upload"  # "upload" | "link"
    source_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class LinkIngestRequest(BaseModel):
    url: str = Field(min_length=1)
    subject_id: Optional[str] = None
    document_type: str = "textbook"


# ---------- Test generation preferences ----------

class QuestionFormat(str, Enum):
    mcq = "mcq"
    theory = "theory"
    mixed = "mixed"


class TestGenerateRequest(BaseModel):
    document_id: str
    format: QuestionFormat = QuestionFormat.mixed
    total_marks: int = Field(default=40, ge=10, le=100)
    adaptive: bool = Field(
        default=False,
        description="If true, question difficulty adapts to running performance "
                    "during the attempt instead of being fixed up front.",
    )
    topic_focus: Optional[str] = Field(
        default=None,
        description="Optional free-text topic to weight generation towards "
                    "(e.g. a weak area surfaced by analytics).",
    )


class QuestionOut(BaseModel):
    id: str
    order_index: int
    format: QuestionFormat
    prompt: str
    options: Optional[list[str]] = None  # only for MCQ
    marks: int
    difficulty: float  # 0.0 (easiest) - 1.0 (hardest), IRT-style estimate
    topic: Optional[str] = None


class MCQCheckRequest(BaseModel):
    response: str


class MCQCheckResponse(BaseModel):
    is_correct: Optional[bool] = None  # None for non-MCQ questions (nothing to check live)


class OCRAnswerOut(BaseModel):
    text: str  # extracted text only - the student reviews/edits it before submitting,
    # since handwriting OCR quality varies and this feeds straight into LLM grading.


class AdaptiveNextRequest(BaseModel):
    answered_question_ids: list[str] = Field(default_factory=list)
    running_score: float = 0.0
    running_max: float = 0.0


class TestOut(BaseModel):
    id: str
    document_id: str
    format: QuestionFormat
    total_marks: int
    adaptive: bool
    created_at: datetime
    questions: list[QuestionOut]


# ---------- Attempts / grading ----------

class SubmittedAnswer(BaseModel):
    question_id: str
    response: str  # selected option text for MCQ, free text for theory
    time_taken_seconds: Optional[int] = None  # time spent on this question specifically
    revisit_count: int = 0  # how many times the student returned to this question (0 for adaptive - forward-only)


class AttemptSubmitRequest(BaseModel):
    test_id: str
    answers: list[SubmittedAnswer]
    time_taken_seconds: Optional[int] = None


class GradedAnswerOut(BaseModel):
    question_id: str
    score: float
    max_score: int
    is_correct: Optional[bool] = None  # set for MCQ, None for theory (partial credit)
    confidence: Optional[float] = None  # LLM grading confidence, theory only
    feedback: str
    needs_review: bool = False
    time_taken_seconds: Optional[int] = None
    revisit_count: int = 0


class AttemptResultOut(BaseModel):
    attempt_id: str
    test_id: str
    total_score: float
    max_score: int
    percentage: float
    graded_answers: list[GradedAnswerOut]


# ---------- Analytics ----------

class TopicMastery(BaseModel):
    topic: str
    mastery: float  # 0-1
    attempts_count: int
    trend: float  # positive = improving, negative = declining


class PerformancePoint(BaseModel):
    date: datetime
    percentage: float
    test_id: str


class RiskFlag(BaseModel):
    topic: str
    reason: str
    severity: str  # "low" | "medium" | "high"


class RevisionReminder(BaseModel):
    topic: str
    due_date: datetime
    reason: str
    subject_id: Optional[str] = None  # lets the UI show/link the reminder's real subject


class DailyActivity(BaseModel):
    """One cell of the Growth Dashboard's consistency heatmap - a calendar
    day and how many test attempts were submitted on it."""
    date: str  # "YYYY-MM-DD"
    count: int


class ProgressSummaryOut(BaseModel):
    history: list[PerformancePoint]
    topic_mastery: list[TopicMastery]
    risk_flags: list[RiskFlag]
    revision_reminders: list[RevisionReminder]
    forecast_next_score: Optional[float] = None
    activity_heatmap: list[DailyActivity] = Field(default_factory=list)


# ---------- Study guide ("important topics" mode) ----------

class StudyGuideTopic(BaseModel):
    topic: str
    importance: float  # 0-1, derived from how much of the document covers this topic
    predicted_format: str  # "mcq" | "theory" | "either"
    predicted_marks_range: str  # e.g. "2-4" - a range, not a false-precise single number
    rationale: str


class StudyGuideOut(BaseModel):
    id: str
    document_id: str
    topics: list[StudyGuideTopic]
    created_at: datetime


class StudyGuideGenerateRequest(BaseModel):
    document_id: str


# ---------- Notes (uploaded/generated, or written freehand) ----------

class NoteGenerateRequest(BaseModel):
    document_id: str


class NoteCreateRequest(BaseModel):
    subject_id: Optional[str] = None
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)


class NoteOut(BaseModel):
    id: str
    document_id: Optional[str] = None  # null for a freehand note not derived from any document
    title: str
    content: str  # markdown
    generated: bool
    created_at: Optional[datetime] = None


# ---------- Knowledge graph ----------

class ConceptGraphBuildRequest(BaseModel):
    subject_id: str


class ConceptSourceDocumentOut(BaseModel):
    """A document this concept was actually drawn from during ingestion,
    surfaced so the Knowledge Graph UI can link a concept to real source
    material (and its generated notes, if any) instead of nothing."""
    document_id: str
    filename: str
    note_id: Optional[str] = None  # latest generated note for this document, if one exists


class ConceptOut(BaseModel):
    id: str
    canonical_name: str
    description: Optional[str] = None
    mastery: Optional[float] = None  # 0-1, joined from topic_mastery by name/alias match; null if never tested
    source_documents: list[ConceptSourceDocumentOut] = Field(default_factory=list)


class ConceptEdgeOut(BaseModel):
    id: str
    source_concept_id: str
    target_concept_id: str
    relation_type: str  # "prerequisite" | "related" | "part_of" | "contrasts_with"
    weight: float
    rationale: Optional[str] = None


class ConceptGraphOut(BaseModel):
    subject_id: str
    concepts: list[ConceptOut]
    edges: list[ConceptEdgeOut]


class ConceptCandidateOut(BaseModel):
    id: str
    new_alias: str
    candidate_concept_id: str
    candidate_concept_name: str
    embedding_similarity: float
    llm_verdict: Optional[str] = None
    llm_rationale: Optional[str] = None
    status: str


class ConceptCandidateResolveRequest(BaseModel):
    resolution: str  # "confirm_same" | "reject_as_different"
