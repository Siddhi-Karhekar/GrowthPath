"""
RAG retrieval: given a document (and optionally a topic to focus on), pull
the most relevant chunks via pgvector cosine similarity so question
generation is grounded in the student's actual uploaded material instead of
the LLM inventing content.
"""
from app.core.supabase_client import get_supabase
from app.services.embedding_service import embed_text


def retrieve_relevant_chunks(document_id: str, query: str, match_count: int = 6) -> list[dict]:
    supabase = get_supabase()
    query_embedding = embed_text(query)
    res = supabase.rpc(
        "match_document_chunks",
        {
            "query_embedding": query_embedding,
            "match_document_id": document_id,
            "match_count": match_count,
        },
    ).execute()
    return res.data or []


def get_all_chunks(document_id: str, limit: int = 40) -> list[dict]:
    """Used when no topic focus is given - sample broadly across the document
    rather than similarity-searching against a single query."""
    supabase = get_supabase()
    res = (
        supabase.table("document_chunks")
        .select("id, content, topic")
        .eq("document_id", document_id)
        .order("chunk_index")
        .limit(limit)
        .execute()
    )
    return res.data or []
