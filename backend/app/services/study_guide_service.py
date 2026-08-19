"""
"Important topics" mode: instead of generating a test, analyze the
document's own structure to predict which topics are likely to be
emphasized in an exam, and roughly how they'd be tested.

Methodology (kept simple and explainable on purpose - this is a content-
emphasis heuristic, not a claim of knowing real exam questions):
  1. Use the topic clusters already computed at ingestion time - a topic's
     "importance" is approximated by what share of the document's content
     falls into that cluster (more coverage devoted to a concept usually
     signals it's a bigger deal in the source material).
  2. One batched LLM call reasons over representative excerpts per topic to
     predict a likely question format and a mark-range estimate, with a
     short rationale - grounded in the actual text, not invented.
"""
import json
import uuid
from collections import defaultdict

from app.core.groq_client import chat_completion
from app.core.supabase_client import get_supabase


def generate_study_guide(user_id: str, document_id: str) -> dict:
    supabase = get_supabase()

    doc_res = (
        supabase.table("documents").select("id").eq("id", document_id).eq("user_id", user_id).single().execute()
    )
    if not doc_res.data:
        raise ValueError("Document not found")

    chunks_res = (
        supabase.table("document_chunks")
        .select("topic, content")
        .eq("document_id", document_id)
        .execute()
    )
    chunks = chunks_res.data or []
    if not chunks:
        raise ValueError("Document has no processed content yet - wait for ingestion to finish.")

    by_topic: dict[str, list[str]] = defaultdict(list)
    for c in chunks:
        by_topic[c.get("topic") or "General"].append(c["content"])

    total_chunks = len(chunks)
    importance_by_topic = {topic: len(items) / total_chunks for topic, items in by_topic.items()}

    topics = _predict_topics(by_topic, importance_by_topic)

    study_guide_id = str(uuid.uuid4())
    supabase.table("study_guides").insert(
        {
            "id": study_guide_id,
            "user_id": user_id,
            "document_id": document_id,
            "topics": topics,
        }
    ).execute()

    return {"id": study_guide_id, "document_id": document_id, "topics": topics}


def _predict_topics(by_topic: dict[str, list[str]], importance_by_topic: dict[str, float]) -> list[dict]:
    topic_summaries = []
    for topic, chunks in by_topic.items():
        excerpt = " / ".join(c[:250] for c in chunks[:2])
        topic_summaries.append(
            f'Topic: "{topic}" (covers {round(importance_by_topic[topic] * 100)}% of the document)\n'
            f"Excerpt: {excerpt}"
        )

    prompt = (
        "You are helping a student prioritize study time before an exam, based only on "
        "their own uploaded material. For each topic below, predict: the most likely "
        "question format it would be tested with, a realistic mark-range estimate (as a "
        "range like '2-4' or '8-10', never a single false-precise number), and a short "
        "one-sentence rationale grounded in what the excerpt actually shows (e.g. depth of "
        "coverage, whether it's a definition vs. a multi-step process, whether it's "
        "referenced repeatedly).\n\n"
        "Be honest that this is an estimate based on the document's own emphasis, not a "
        "leaked or guaranteed exam question.\n\n"
        + "\n\n".join(topic_summaries)
        + '\n\nRespond ONLY with JSON: {"topics": [{"topic": "...", "predicted_format": '
        '"mcq"|"theory"|"either", "predicted_marks_range": "...", "rationale": "..."}]}'
    )

    raw = chat_completion([{"role": "user", "content": prompt}], temperature=0.3, json_mode=True)
    parsed = json.loads(raw)
    predictions = {p["topic"]: p for p in parsed.get("topics", [])}

    results = []
    for topic, importance in sorted(importance_by_topic.items(), key=lambda kv: -kv[1]):
        pred = predictions.get(topic, {})
        results.append(
            {
                "topic": topic,
                "importance": round(importance, 3),
                "predicted_format": pred.get("predicted_format", "either"),
                "predicted_marks_range": pred.get("predicted_marks_range", "unknown"),
                "rationale": pred.get("rationale", "Based on how much of the document covers this topic."),
            }
        )
    return results


def get_latest_study_guide(user_id: str, document_id: str) -> dict | None:
    supabase = get_supabase()
    res = (
        supabase.table("study_guides")
        .select("id, document_id, topics, created_at")
        .eq("document_id", document_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None
