"""
Serves questions one at a time for an "adaptive" test: rather than a fixed
question order, each call picks the unanswered question whose difficulty is
closest to the student's current estimated ability - a standard simplified
Computerized Adaptive Testing (CAT) heuristic (full CAT maximizes Fisher
information; nearest-difficulty-to-ability is the well-known lightweight
approximation, and transparent enough to explain in an interview).

Kept stateless on the backend: the frontend tracks which questions have been
answered and the running score for the current attempt, and passes that back
on each call, rather than the backend needing an "in-progress attempt" table.
"""
from app.core.supabase_client import get_supabase
from app.ml.irt import clamp


def get_next_question(user_id: str, test_id: str, answered_question_ids: list[str],
                       running_score: float, running_max: float) -> dict | None:
    supabase = get_supabase()

    test_res = supabase.table("tests").select("id").eq("id", test_id).eq("user_id", user_id).single().execute()
    if not test_res.data:
        raise ValueError("Test not found")

    q_res = supabase.table("questions").select("*").eq("test_id", test_id).order("order_index").execute()
    all_questions = q_res.data or []
    remaining = [q for q in all_questions if q["id"] not in answered_question_ids]
    if not remaining:
        return None

    session_ability = _session_ability(supabase, user_id, running_score, running_max)

    # Pick the remaining question whose difficulty is nearest the student's
    # current estimated ability - keeps the test challenging but not
    # discouraging, and easy to defend ("we target ~50% expected success").
    best = min(remaining, key=lambda q: abs(q.get("difficulty", 0.5) - session_ability))
    return best


def check_mcq_correct(user_id: str, question_id: str, response: str) -> bool | None:
    """Live, unpersisted correctness check for a single MCQ - used only to
    feed the in-session ability estimate for adaptive tests. Theory
    questions can't be checked this cheaply (would need an LLM call per
    question), so they're folded into ability only after full grading at
    submit time via calibration_service instead."""
    supabase = get_supabase()
    q_res = (
        supabase.table("questions")
        .select("id, format, correct_option, tests!inner(user_id)")
        .eq("id", question_id)
        .single()
        .execute()
    )
    question = q_res.data
    if not question or question["tests"]["user_id"] != user_id:
        raise ValueError("Question not found")
    if question["format"] != "mcq":
        return None
    return response.strip().lower() == (question.get("correct_option") or "").strip().lower()


def _session_ability(supabase, user_id: str, running_score: float, running_max: float) -> float:
    profile_res = supabase.table("user_profile").select("ability").eq("user_id", user_id).execute()
    baseline_ability = profile_res.data[0]["ability"] if profile_res.data else 0.5

    if running_max <= 0:
        return baseline_ability

    session_pct = running_score / running_max
    # Blend the long-run ability estimate with how this specific attempt is
    # going so far, weighted towards the live session as it progresses.
    weight = min(0.7, running_max / 20)  # more questions answered this session -> trust it more
    return clamp(baseline_ability * (1 - weight) + session_pct * weight)
