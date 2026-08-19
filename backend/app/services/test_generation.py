"""
Turns retrieved document chunks into a structured test (MCQ / theory / mixed)
via a single grounded LLM call, then persists the test + questions.
"""
import json
import uuid

from app.core.supabase_client import get_supabase
from app.core.groq_client import chat_completion
from app.models.schemas import QuestionFormat, TestGenerateRequest
from app.services.retrieval import get_all_chunks, retrieve_relevant_chunks


def generate_test(user_id: str, req: TestGenerateRequest) -> str:
    chunks = (
        retrieve_relevant_chunks(req.document_id, req.topic_focus, match_count=10)
        if req.topic_focus
        else get_all_chunks(req.document_id, limit=25)
    )
    if not chunks:
        raise ValueError("Document has no processed content yet - wait for ingestion to finish.")

    context = "\n\n".join(f"[{c.get('topic', 'General')}] {c['content']}" for c in chunks)
    questions = _generate_questions(context, req)
    questions = _normalize_marks(questions, req.total_marks)

    supabase = get_supabase()
    test_id = str(uuid.uuid4())
    supabase.table("tests").insert(
        {
            "id": test_id,
            "user_id": user_id,
            "document_id": req.document_id,
            "format": req.format.value,
            "total_marks": req.total_marks,
            "adaptive": req.adaptive,
        }
    ).execute()

    rows = []
    for idx, q in enumerate(questions):
        rows.append(
            {
                "test_id": test_id,
                "order_index": idx,
                "format": q["format"],
                "prompt": q["prompt"],
                "options": q.get("options"),
                "correct_option": q.get("correct_option"),
                "rubric": q.get("rubric"),
                "marks": q["marks"],
                "difficulty": q.get("difficulty", 0.5),
                "topic": q.get("topic"),
            }
        )
    supabase.table("questions").insert(rows).execute()

    return test_id


def _generate_questions(context: str, req: TestGenerateRequest) -> list[dict]:
    format_instruction = {
        QuestionFormat.mcq: "Generate ONLY multiple-choice questions (format: 'mcq'), each with exactly 4 options and one correct_option.",
        QuestionFormat.theory: "Generate ONLY theory/long-answer questions (format: 'theory'), each with a grading rubric.",
        QuestionFormat.mixed: "Generate a mix of multiple-choice ('mcq', 4 options each) and theory ('theory', with a rubric) questions.",
    }[req.format]

    topic_instruction = (
        f"Focus questions primarily on this topic/weak area: {req.topic_focus}."
        if req.topic_focus
        else ""
    )

    prompt = f"""You are creating a self-study test from a student's own notes, strictly grounded in the material below. Do not invent facts not supported by the material.

STUDY MATERIAL:
{context}

TASK:
{format_instruction}
{topic_instruction}
Target total marks: {req.total_marks} (distribute marks per question so they sum to approximately this total).
For every question, also assign:
  - "difficulty": your estimate from 0.0 (very easy, direct recall) to 1.0 (very hard, requires synthesis/application)
  - "topic": a short topic label (2-5 words) matching the concept the question tests

Respond ONLY with JSON in this exact shape:
{{
  "questions": [
    {{
      "format": "mcq",
      "prompt": "...",
      "options": ["...", "...", "...", "..."],
      "correct_option": "...",
      "marks": 2,
      "difficulty": 0.4,
      "topic": "..."
    }},
    {{
      "format": "theory",
      "prompt": "...",
      "rubric": "Key points a full-marks answer must cover...",
      "marks": 10,
      "difficulty": 0.7,
      "topic": "..."
    }}
  ]
}}"""

    raw = chat_completion([{"role": "user", "content": prompt}], temperature=0.5, json_mode=True)
    parsed = json.loads(raw)
    questions = parsed.get("questions", [])
    if not questions:
        raise ValueError("Model returned no questions - try again or use a longer document.")
    return questions


def _normalize_marks(questions: list[dict], total_marks: int) -> list[dict]:
    """LLMs are unreliable at making numbers sum exactly right - rescale
    proportionally so the test's marks always match what the student asked for."""
    raw_sum = sum(q.get("marks", 1) for q in questions) or 1
    running = 0
    for i, q in enumerate(questions):
        if i == len(questions) - 1:
            q["marks"] = max(1, total_marks - running)
        else:
            scaled = max(1, round(q.get("marks", 1) / raw_sum * total_marks))
            q["marks"] = scaled
            running += scaled
    return questions
