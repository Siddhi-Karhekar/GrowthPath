"""
Pydantic request/response models shared across routers. These mirror the
Postgres tables defined in docs/schema.sql but are intentionally kept
separate from the DB layer (services/*.py) so the API contract doesn't
silently change if we tweak a column.
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
    created_at: datetime
    updated_at: Optional[datetime] = None


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


class ProgressSummaryOut(BaseModel):
    history: list[PerformancePoint]
    topic_mastery: list[TopicMastery]
    risk_flags: list[RiskFlag]
    revision_reminders: list[RevisionReminder]
    forecast_next_score: Optional[float] = None


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
