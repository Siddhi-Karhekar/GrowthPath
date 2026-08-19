"""
Applies the Elo-style IRT update (app/ml/irt.py) after every graded attempt:
updates the student's ability estimate once, and each answered question's
difficulty estimate individually.
"""
from app.core.supabase_client import get_supabase
from app.ml.irt import update_ability_and_difficulty


def calibrate_from_attempt(user_id: str, questions_by_id: dict[str, dict], graded_answers: list[dict]) -> None:
    supabase = get_supabase()

    profile_res = supabase.table("user_profile").select("*").eq("user_id", user_id).execute()
    ability = profile_res.data[0]["ability"] if profile_res.data else 0.5

    for g in graded_answers:
        question = questions_by_id.get(g["question_id"])
        if not question:
            continue
        correct_fraction = g["score"] / g["max_score"] if g["max_score"] else 0.0
        new_ability, new_difficulty = update_ability_and_difficulty(
            ability, question.get("difficulty", 0.5), correct_fraction
        )
        ability = new_ability  # carry forward across questions within this attempt

        supabase.table("questions").update({"difficulty": new_difficulty}).eq("id", question["id"]).execute()

    supabase.table("user_profile").upsert(
        {"user_id": user_id, "ability": ability}, on_conflict="user_id"
    ).execute()
