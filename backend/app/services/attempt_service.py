import uuid

from app.core.supabase_client import get_supabase
from app.ml.mastery import update_topic_mastery
from app.services.calibration_service import calibrate_from_attempt
from app.services.grading import grade_answers


def submit_attempt(user_id: str, test_id: str, answers: list[dict], time_taken_seconds: int | None) -> dict:
    supabase = get_supabase()

    test_res = (
        supabase.table("tests")
        .select("id, documents(subject_id)")
        .eq("id", test_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not test_res.data:
        raise ValueError("Test not found")
    # Embedded relation via the tests.document_id FK - None if the source
    # document isn't filed under a subject folder.
    subject_id = (test_res.data.get("documents") or {}).get("subject_id")

    q_res = supabase.table("questions").select("*").eq("test_id", test_id).execute()
    questions_by_id = {q["id"]: q for q in q_res.data or []}

    graded = grade_answers(questions_by_id, answers)

    # Per-question timing/revisits come straight from the client (nothing to
    # grade here) - merge them onto the graded dicts so they flow through to
    # both the DB insert and the response in one place.
    answers_by_id = {a["question_id"]: a for a in answers}
    for g in graded:
        original = answers_by_id.get(g["question_id"], {})
        g["time_taken_seconds"] = original.get("time_taken_seconds")
        g["revisit_count"] = original.get("revisit_count", 0)

    total_score = sum(g["score"] for g in graded)
    max_score = sum(g["max_score"] for g in graded)

    attempt_id = str(uuid.uuid4())
    supabase.table("attempts").insert(
        {
            "id": attempt_id,
            "user_id": user_id,
            "test_id": test_id,
            "total_score": total_score,
            "max_score": max_score,
            "time_taken_seconds": time_taken_seconds,
        }
    ).execute()

    answer_rows = [
        {
            "attempt_id": attempt_id,
            "question_id": g["question_id"],
            "response": answers_by_id.get(g["question_id"], {}).get("response", ""),
            "score": g["score"],
            "is_correct": g["is_correct"],
            "confidence": g["confidence"],
            "feedback": g["feedback"],
            "needs_review": g["needs_review"],
            "time_taken_seconds": g["time_taken_seconds"],
            "revisit_count": g["revisit_count"],
        }
        for g in graded
    ]
    supabase.table("answers").insert(answer_rows).execute()

    # Update rolling per-topic mastery + spaced-repetition schedule so
    # analytics/revision reminders reflect this attempt immediately.
    update_topic_mastery(user_id, graded, subject_id=subject_id)

    # IRT-style calibration: sharpen question difficulty estimates and the
    # student's ability estimate based on how this attempt actually went.
    calibrate_from_attempt(user_id, questions_by_id, graded)

    percentage = (total_score / max_score * 100) if max_score else 0.0
    return {
        "attempt_id": attempt_id,
        "test_id": test_id,
        "total_score": total_score,
        "max_score": max_score,
        "percentage": round(percentage, 1),
        "graded_answers": graded,
    }
