"""
Orchestrates the full document ingestion pipeline:
upload/link -> parse (+ OCR fallback) -> chunk -> embed -> cluster into
topics -> label topics via LLM -> persist chunks+embeddings to
Supabase/pgvector.

Also handles re-ingestion when a student replaces a document with an updated
version - old chunks/embeddings are cleared and rebuilt from the new file,
but the document's id (and therefore its test/attempt history) stays intact.

Two intake paths converge on the same _process_document() once raw text has
been obtained: an uploaded file (ingest_document) and a textbook link
(ingest_document_from_link).
"""
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.supabase_client import get_supabase
from app.ml.clustering import cluster_embeddings
from app.services.document_parser import (
    chunk_text,
    fetch_url,
    filename_from_url,
    parse_document,
    parse_url_content,
)
from app.services.embedding_service import embed_texts
from app.services.topic_labeling import label_clusters


def ingest_document(
    user_id: str,
    filename: str,
    file_bytes: bytes,
    document_id: str | None = None,
    subject_id: str | None = None,
    document_type: str = "textbook",
) -> str:
    settings = get_settings()
    supabase = get_supabase()

    document_id = document_id or str(uuid.uuid4())
    storage_path = f"{user_id}/{document_id}_{filename}"

    # 1. Upload the raw file to Supabase Storage (free tier includes 1GB).
    supabase.storage.from_(settings.documents_bucket).upload(
        storage_path, file_bytes, {"content-type": "application/octet-stream"}
    )

    supabase.table("documents").insert(
        {
            "id": document_id,
            "user_id": user_id,
            "filename": filename,
            "storage_path": storage_path,
            "status": "processing",
            "subject_id": subject_id,
            "document_type": document_type,
            "source_type": "upload",
        }
    ).execute()

    try:
        full_text, page_count = parse_document(file_bytes, filename)
        _process_document(user_id, document_id, full_text, page_count)
        supabase.table("documents").update({"status": "ready"}).eq("id", document_id).execute()
    except Exception:
        supabase.table("documents").update({"status": "failed"}).eq("id", document_id).execute()
        raise

    return document_id


def ingest_document_from_link(
    user_id: str,
    url: str,
    document_id: str | None = None,
    subject_id: str | None = None,
    document_type: str = "textbook",
) -> str:
    """Same pipeline as ingest_document, but the source material is fetched
    from a URL (a direct textbook PDF link, or a webpage) instead of an
    uploaded file. The fetched bytes are still stored in Supabase Storage so
    reprocessing/re-download never needs to hit the original URL again."""
    settings = get_settings()
    supabase = get_supabase()

    document_id = document_id or str(uuid.uuid4())
    filename = filename_from_url(url)
    storage_path = f"{user_id}/{document_id}_{filename}"

    supabase.table("documents").insert(
        {
            "id": document_id,
            "user_id": user_id,
            "filename": filename,
            "storage_path": storage_path,
            "status": "processing",
            "subject_id": subject_id,
            "document_type": document_type,
            "source_type": "link",
            "source_url": url,
        }
    ).execute()

    try:
        content, content_type = fetch_url(url)
        supabase.storage.from_(settings.documents_bucket).upload(
            storage_path, content, {"content-type": content_type or "application/octet-stream"}
        )
        full_text, page_count = parse_url_content(content, content_type, url)
        _process_document(user_id, document_id, full_text, page_count)
        supabase.table("documents").update({"status": "ready"}).eq("id", document_id).execute()
    except Exception:
        supabase.table("documents").update({"status": "failed"}).eq("id", document_id).execute()
        raise

    return document_id


def reingest_document(user_id: str, document_id: str, filename: str, file_bytes: bytes) -> None:
    """Replace a document's content in place: clears old chunks, re-parses
    the new file, bumps the version. The test/attempt history tied to this
    document_id is left untouched - only the source material changes."""
    settings = get_settings()
    supabase = get_supabase()

    existing = (
        supabase.table("documents")
        .select("id, version")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not existing.data:
        raise ValueError("Document not found")

    storage_path = f"{user_id}/{document_id}_{filename}"
    supabase.storage.from_(settings.documents_bucket).upload(
        storage_path, file_bytes, {"content-type": "application/octet-stream", "x-upsert": "true"}
    )

    supabase.table("documents").update(
        {
            "status": "processing",
            "filename": filename,
            "storage_path": storage_path,
            "version": existing.data["version"] + 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", document_id).execute()

    # Old chunks/embeddings no longer reflect the current file - clear them
    # before reprocessing so stale content can't leak into future test
    # generation, study guides, or notes for this document.
    supabase.table("document_chunks").delete().eq("document_id", document_id).execute()

    try:
        full_text, page_count = parse_document(file_bytes, filename)
        _process_document(user_id, document_id, full_text, page_count)
        supabase.table("documents").update({"status": "ready"}).eq("id", document_id).execute()
    except Exception:
        supabase.table("documents").update({"status": "failed"}).eq("id", document_id).execute()
        raise


def _process_document(user_id: str, document_id: str, full_text: str, page_count: int) -> None:
    supabase = get_supabase()

    supabase.table("documents").update({"page_count": page_count}).eq("id", document_id).execute()

    # Chunk for RAG grounding.
    chunks = chunk_text(full_text)
    if not chunks:
        raise ValueError("No extractable text found in document.")

    # Embed all chunks locally (free, no API cost).
    embeddings = embed_texts(chunks)

    # Cluster chunks into topics, then label each cluster once via LLM.
    cluster_labels = cluster_embeddings(embeddings)
    samples_by_cluster: dict[int, list[str]] = defaultdict(list)
    for chunk, cluster_id in zip(chunks, cluster_labels):
        samples_by_cluster[cluster_id].append(chunk)
    topic_names = label_clusters(samples_by_cluster)

    # Persist chunks + embeddings + topic assignment.
    rows = []
    for idx, (chunk, cluster_id, embedding) in enumerate(zip(chunks, cluster_labels, embeddings)):
        rows.append(
            {
                "document_id": document_id,
                "user_id": user_id,
                "chunk_index": idx,
                "content": chunk,
                "topic": topic_names.get(cluster_id, f"Topic {cluster_id + 1}"),
                "embedding": embedding,
            }
        )
    # Batch insert to keep round trips low.
    for i in range(0, len(rows), 100):
        supabase.table("document_chunks").insert(rows[i : i + 100]).execute()
