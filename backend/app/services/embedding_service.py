"""
Local, free embedding generation using sentence-transformers. Runs on the
backend's own CPU - no per-call API cost, unlike hosted embedding APIs.
The model is loaded once (lazily) and cached for the life of the process.
"""
from functools import lru_cache

from app.core.config import get_settings


@lru_cache
def _get_model():
    # Imported lazily so the (fairly heavy) torch/transformers import only
    # happens the first time an embedding is actually requested.
    from sentence_transformers import SentenceTransformer

    settings = get_settings()
    return SentenceTransformer(settings.embedding_model_name)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _get_model()
    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]
