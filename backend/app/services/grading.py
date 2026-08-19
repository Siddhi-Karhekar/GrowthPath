"""
Grades a submitted attempt:
  - MCQ: exact match against correct_option (deterministic, no LLM call needed)
  - Theory: a single batched LLM call grades all theory answers at once
    against their rubrics, returning a score, a confidence level, and
    feedback per question. Low-confidence gradings are flagged for the
    student to review themselves rather than silently trusted.
"""
import json

from app.core.groq_client import chat_completion

LOW_CONFIDENCE_THRESHOLD = 0.6


def grade_answers(questions_by_id: dict[str, dict], answers: list[dict]) -> list[dict]:
    """answers: [{question_id, response}]. Returns graded answer dicts."""
    mcq_graded = []
    theory_to_grade = []

    for ans in answers:
        question = questions_by_id.get(ans["question_id"])
        if not question:
            continue
        if question["format"] == "mcq":
            mcq_graded.append(_grade_mcq(question, ans))
        else:
            theory_to_grade.append((question, ans))

    theory_graded = _grade_theory_batch(theory_to_grade) if theory_to_grade else []
    return mcq_graded + theory_graded


def _grade_mcq(question: dict, answer: dict) -> dict:
    is_correct = (answer.get("response", "").strip().lower()
                  == (question.get("correct_option") or "").strip().lower())
    return {
        "question_id": question["id"],
        "score": question["marks"] if is_correct else 0,
        "max_score": question["marks"],
        "is_correct": is_correct,
        "confidence": 1.0,
        "feedback": "Correct." if is_correct else f"Incorrect. Correct answer: {question.get('correct_option')}",
        "needs_review": False,
        "topic": question.get("topic"),
    }


def _grade_theory_batch(pairs: list[tuple[dict, dict]]) -> list[dict]:
    items = []
    for question, answer in pairs:
        items.append(
            {
                "question_id": question["id"],
                "prompt": question["prompt"],
                "rubric": question.get("rubric") or "Award marks for factual accuracy and completeness.",
                "max_score": question["marks"],
                "student_answer": answer.get("response", ""),
            }
        )

    prompt = (
        "You are grading a student's own self-study theory answers against the "
        "rubric for each question. Be fair but rigorous - this is for the "
        "student's own learning, so accurate feedback matters more than being lenient.\n\n"
        f"{json.dumps(items, indent=2)}\n\n"
        "For each question_id, respond with a score out of max_score, a confidence "
        "(0.0-1.0) in your own grading accuracy, and 1-2 sentences of feedback "
        "explaining what was missing or well done.\n\n"
        'Respond ONLY with JSON: {"grades": [{"question_id": "...", "score": 0, '
        '"confidence": 0.0, "feedback": "..."}]}'
    )

    raw = chat_completion([{"role": "user", "content": prompt}], temperature=0.2, json_mode=True)
    parsed = json.loads(raw)
    grades_by_id = {g["question_id"]: g for g in parsed.get("grades", [])}

    results = []
    for question, answer in pairs:
        grade = grades_by_id.get(question["id"])
        if not grade:
            # LLM dropped this question from its response - fail safe by
            # flagging for manual review rather than silently scoring 0.
            results.append(
                {
                    "question_id": question["id"],
                    "score": 0,
                    "max_score": question["marks"],
                    "is_correct": None,
                    "confidence": 0.0,
                    "feedback": "Automated grading failed for this answer - please review manually.",
                    "needs_review": True,
                    "topic": question.get("topic"),
                }
            )
            continue

        confidence = float(grade.get("confidence", 0.5))
        results.append(
            {
                "question_id": question["id"],
                "score": float(grade.get("score", 0)),
                "max_score": question["marks"],
                "is_correct": None,
                "confidence": confidence,
                "feedback": grade.get("feedback", ""),
                "needs_review": confidence < LOW_CONFIDENCE_THRESHOLD,
                "topic": question.get("topic"),
            }
        )
    return results
