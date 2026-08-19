"""
Updates each topic's rolling mastery estimate after a graded attempt, and
schedules the next spaced-repetition review date using a simplified SM-2
algorithm. This is what powers "weak areas" and "revision reminders" in the
analytics dashboard - it runs after every attempt, not as a big batch job.

Mastery is scoped per (user, subject, topic) - subject_id is null when the
document a test came from isn't filed under a subject folder.
"""
from datetime import datetime, timedelta, timezone

from app.core.supabase_client import get_supabase

# How much a single answer moves the rolling mastery estimate - keeps
# mastery responsive to recent performance without being wiped out by one
# lucky/unlucky question.
LEARNING_RATE = 0.25


def update_topic_mastery(user_id: str, graded_answers: list[dict], subject_id: str | None = None) -> None:
    supabase = get_supabase()

    # Aggregate per-topic performance from this attempt first, so a topic
    # with several questions only moves mastery once with the average.
    by_topic: dict[str, list[float]] = {}
    for ans in graded_answers:
        topic = ans.get("topic") or "General"
        pct = (ans["score"] / ans["max_score"]) if ans["max_score"] else 0
        by_topic.setdefault(topic, []).append(pct)

    for topic, scores in by_topic.items():
        avg_pct = sum(scores) / len(scores)
        _update_single_topic(supabase, user_id, subject_id, topic, avg_pct)


def _update_single_topic(supabase, user_id: str, subject_id: str | None, topic: str, latest_pct: float) -> None:
    query = supabase.table("topic_mastery").select("*").eq("user_id", user_id).eq("topic", topic)
    query = query.is_("subject_id", "null") if subject_id is None else query.eq("subject_id", subject_id)
    existing = query.execute()

    now = datetime.now(timezone.utc)

    if existing.data:
        row = existing.data[0]
        prior_mastery = row["mastery"]
        attempts_count = row["attempts_count"] + 1
    else:
        row = None
        prior_mastery = 0.5  # neutral prior for a topic never attempted before
        attempts_count = 1

    new_mastery = prior_mastery + LEARNING_RATE * (latest_pct - prior_mastery)
    new_mastery = max(0.0, min(1.0, new_mastery))

    next_review = now + _sm2_interval(new_mastery, attempts_count)

    payload = {
        "user_id": user_id,
        "subject_id": subject_id,
        "topic": topic,
        "mastery": new_mastery,
        "attempts_count": attempts_count,
        "last_attempt_at": now.isoformat(),
        "next_review_at": next_review.isoformat(),
    }

    # Explicit update-or-insert rather than postgrest's upsert/on_conflict:
    # the unique constraint here is two partial indexes (see migration_001),
    # not a single plain composite key, so it's simpler and more reliable to
    # branch on the row we already fetched above than to fight ON CONFLICT
    # target matching.
    if row:
        supabase.table("topic_mastery").update(payload).eq("id", row["id"]).execute()
    else:
        supabase.table("topic_mastery").insert(payload).execute()


def _sm2_interval(mastery: float, attempts_count: int) -> timedelta:
    """Simplified SM-2: higher mastery and more attempts -> longer gap until
    the next recommended review. Weak topics (low mastery) get reviewed soon."""
    if mastery < 0.4:
        return timedelta(days=1)
    if mastery < 0.6:
        return timedelta(days=3)
    if mastery < 0.8:
        return timedelta(days=3 * min(attempts_count, 4))
    return timedelta(days=7 * min(attempts_count, 6))
