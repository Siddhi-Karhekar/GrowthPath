"""
Builds the "personal growth" dashboard payload: score history over time,
per-topic mastery with trend, risk flags for weak/declining topics, upcoming
spaced-repetition revision reminders, and a next-score forecast.

Queries are deliberately done as a few simple round trips rather than one
clever nested join - easier to reason about and to explain in an interview,
and avoids relying on postgrest embedded-filter syntax that's easy to get
subtly wrong.
"""
from datetime import datetime, timedelta, timezone

from app.core.supabase_client import get_supabase
from app.ml.forecasting import linear_forecast, trend_slope

RISK_MASTERY_THRESHOLD = 0.45
DECLINING_TREND_THRESHOLD = -0.03
REVISION_LOOKAHEAD_DAYS = 7


def get_progress_summary(user_id: str, subject_id: str | None = None) -> dict:
    supabase = get_supabase()

    # Scoping to a subject means walking documents -> tests -> attempts,
    # since attempts don't carry subject_id directly (a subject is a
    # property of the document a test was generated from).
    test_ids_filter: list[str] | None = None
    if subject_id is not None:
        doc_res = (
            supabase.table("documents")
            .select("id")
            .eq("user_id", user_id)
            .eq("subject_id", subject_id)
            .execute()
        )
        document_ids = [d["id"] for d in (doc_res.data or [])]
        if not document_ids:
            return _empty_summary()
        test_res = supabase.table("tests").select("id").eq("user_id", user_id).in_("document_id", document_ids).execute()
        test_ids_filter = [t["id"] for t in (test_res.data or [])]
        if not test_ids_filter:
            return _empty_summary()

    attempts_query = (
        supabase.table("attempts")
        .select("id, test_id, total_score, max_score, created_at")
        .eq("user_id", user_id)
    )
    if test_ids_filter is not None:
        attempts_query = attempts_query.in_("test_id", test_ids_filter)
    attempts_res = attempts_query.order("created_at").execute()
    attempts = attempts_res.data or []

    history = [
        {
            "date": a["created_at"],
            "percentage": round((a["total_score"] / a["max_score"] * 100) if a["max_score"] else 0, 1),
            "test_id": a["id"],
        }
        for a in attempts
    ]

    topic_series = _build_topic_series(supabase, attempts) if attempts else {}

    mastery_query = supabase.table("topic_mastery").select("*").eq("user_id", user_id)
    if subject_id is not None:
        mastery_query = mastery_query.eq("subject_id", subject_id)
    mastery_res = mastery_query.execute()
    mastery_rows = mastery_res.data or []

    topic_mastery = []
    risk_flags = []
    for row in mastery_rows:
        series = topic_series.get(row["topic"], [])
        trend = trend_slope(series)
        topic_mastery.append(
            {
                "topic": row["topic"],
                "mastery": row["mastery"],
                "attempts_count": row["attempts_count"],
                "trend": trend,
            }
        )
        if row["mastery"] < RISK_MASTERY_THRESHOLD:
            risk_flags.append(
                {"topic": row["topic"], "reason": "Mastery below 45% over recent attempts", "severity": "high"}
            )
        elif trend < DECLINING_TREND_THRESHOLD:
            risk_flags.append(
                {"topic": row["topic"], "reason": "Performance trending downward recently", "severity": "medium"}
            )

    now = datetime.now(timezone.utc)
    lookahead = now + timedelta(days=REVISION_LOOKAHEAD_DAYS)
    revision_reminders = [
        {
            "topic": row["topic"],
            "due_date": row["next_review_at"],
            "reason": f"Spaced-repetition review due (mastery: {round(row['mastery'] * 100)}%)",
        }
        for row in mastery_rows
        if row.get("next_review_at") and _parse(row["next_review_at"]) <= lookahead
    ]
    revision_reminders.sort(key=lambda r: r["due_date"])

    forecast = linear_forecast([h["percentage"] for h in history])

    return {
        "history": history,
        "topic_mastery": sorted(topic_mastery, key=lambda t: t["mastery"]),
        "risk_flags": risk_flags,
        "revision_reminders": revision_reminders,
        "forecast_next_score": forecast,
    }


def _empty_summary() -> dict:
    """Returned when a subject filter matches no documents/tests yet -
    avoids sending a malformed empty-list `.in_()` query to postgrest."""
    return {
        "history": [],
        "topic_mastery": [],
        "risk_flags": [],
        "revision_reminders": [],
        "forecast_next_score": None,
    }


def _build_topic_series(supabase, attempts: list[dict]) -> dict[str, list[float]]:
    attempt_ids = [a["id"] for a in attempts]
    attempt_dates = {a["id"]: a["created_at"] for a in attempts}

    # Note: "max_score" for an answer isn't stored on the answers table -
    # each question's marks live on questions.marks, so it's pulled from
    # there below rather than selected directly off answers.
    answers_res = (
        supabase.table("answers")
        .select("attempt_id, question_id, score")
        .in_("attempt_id", attempt_ids)
        .execute()
    )
    answers = answers_res.data or []
    if not answers:
        return {}

    question_ids = list({a["question_id"] for a in answers})
    questions_res = supabase.table("questions").select("id, topic, marks").in_("id", question_ids).execute()
    topic_by_question = {q["id"]: (q.get("topic") or "General") for q in (questions_res.data or [])}
    marks_by_question = {q["id"]: q.get("marks") or 1 for q in (questions_res.data or [])}

    # attempt_id -> chronological order, so per-topic series stay time-ordered
    ordered_attempt_ids = sorted(attempt_ids, key=lambda aid: attempt_dates[aid])
    order_index = {aid: i for i, aid in enumerate(ordered_attempt_ids)}

    by_topic_by_attempt: dict[str, dict[int, list[float]]] = {}
    for ans in answers:
        topic = topic_by_question.get(ans["question_id"], "General")
        max_score = marks_by_question.get(ans["question_id"], 1)
        pct = (ans["score"] / max_score) * 100 if max_score else 0
        idx = order_index[ans["attempt_id"]]
        by_topic_by_attempt.setdefault(topic, {}).setdefault(idx, []).append(pct)

    topic_series: dict[str, list[float]] = {}
    for topic, by_attempt in by_topic_by_attempt.items():
        series = [sum(v) / len(v) for _, v in sorted(by_attempt.items())]
        topic_series[topic] = series
    return topic_series


def _parse(iso_string: str) -> datetime:
    return datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
