"""
Generates structured, source-grounded study notes for a document - a
condensed write-up per topic, distinct from "study guide" mode (which
predicts exam emphasis rather than summarizing content). Reuses the
per-topic chunk grouping ingestion already computed, so this costs one
extra batched LLM call, not a second ingestion pass.

Also supports freehand notes a student writes directly (not derived from
any document) - both kinds live in the same `notes` table, filed under a
subject folder like documents are.
"""
import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from app.core.groq_client import chat_completion
from app.core.supabase_client import get_supabase

NOTE_COLUMNS = "id, source_document_id, subject_id, title, content, generated, created_at"


def generate_notes(user_id: str, document_id: str) -> dict:
    supabase = get_supabase()

    doc_res = (
        supabase.table("documents").select("id, filename, subject_id").eq("id", document_id).eq("user_id", user_id).single().execute()
    )
    if not doc_res.data:
        raise ValueError("Document not found")
    document = doc_res.data

    chunks_res = (
        supabase.table("document_chunks").select("topic, content, chunk_index").eq("document_id", document_id).order("chunk_index").execute()
    )
    chunks = chunks_res.data or []
    if not chunks:
        raise ValueError("Document has no processed content yet - wait for ingestion to finish.")

    by_topic: dict[str, list[str]] = defaultdict(list)
    for c in chunks:
        by_topic[c.get("topic") or "General"].append(c["content"])

    content_md = _write_notes(document["filename"], by_topic)
    title = f"Notes - {document['filename']}"

    note_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("notes").insert(
        {
            "id": note_id,
            "user_id": user_id,
            "subject_id": document.get("subject_id"),
            "source_document_id": document_id,
            "title": title,
            "content": content_md,
            "generated": True,
            "created_at": now,
        }
    ).execute()

    return {"id": note_id, "document_id": document_id, "title": title, "content": content_md, "generated": True, "created_at": now}


def get_latest_notes(user_id: str, document_id: str) -> dict | None:
    supabase = get_supabase()
    res = (
        supabase.table("notes")
        .select(NOTE_COLUMNS)
        .eq("source_document_id", document_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return _to_out(res.data[0]) if res.data else None


def create_freehand_note(user_id: str, subject_id: str | None, title: str, content: str) -> dict:
    supabase = get_supabase()
    note_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("notes").insert(
        {
            "id": note_id,
            "user_id": user_id,
            "subject_id": subject_id,
            "title": title,
            "content": content,
            "generated": False,
            "created_at": now,
        }
    ).execute()
    return {"id": note_id, "document_id": None, "title": title, "content": content, "generated": False, "created_at": now}


def list_notes(user_id: str, subject_id: str | None = None) -> list[dict]:
    supabase = get_supabase()
    query = supabase.table("notes").select(NOTE_COLUMNS).eq("user_id", user_id)
    if subject_id is not None:
        query = query.eq("subject_id", subject_id)
    res = query.order("created_at", desc=True).execute()
    return [_to_out(row) for row in (res.data or [])]


def _to_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "document_id": row.get("source_document_id"),
        "title": row["title"],
        "content": row["content"],
        "generated": row["generated"],
        "created_at": row.get("created_at"),
    }


def _write_notes(filename: str, by_topic: dict[str, list[str]]) -> str:
    sections = []
    for topic, chunks in by_topic.items():
        excerpt = "\n".join(c[:600] for c in chunks[:4])
        sections.append(f'Topic: "{topic}"\nSource material:\n"""\n{excerpt}\n"""')

    prompt = (
        f"You are writing condensed study notes for a student, based strictly on their own "
        f"uploaded material from '{filename}'. For each topic section below, write clear, "
        f"well-organized markdown notes (a short intro sentence, then key points as a markdown "
        f"bullet list, using **bold** for key terms) that the student could revise from without "
        f"re-reading the original document. Do not invent facts not present in the source "
        f"material.\n\n" + "\n\n".join(sections) + "\n\n"
        'Respond ONLY with JSON: {"notes_markdown": "# Notes\\n\\n## Topic 1\\n..."} - one single '
        "markdown string covering every topic above, each as its own '## Topic' heading, in order."
    )
    raw = chat_completion([{"role": "user", "content": prompt}], temperature=0.3, json_mode=True)
    parsed = json.loads(raw)
    markdown = parsed.get("notes_markdown", "")
    if not markdown:
        raise ValueError("Model returned no notes content - try again.")
    return markdown
