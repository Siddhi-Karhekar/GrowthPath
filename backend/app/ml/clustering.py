"""
Small, dependency-light clustering helper used in two places:
  1. document ingestion - grouping a document's chunks into topics
  2. analytics - grouping a student's wrong answers into weak-area topics
Both are "cluster a handful of embeddings, then ask the LLM to name each
cluster" - so the clustering logic lives here, shared.
"""
import numpy as np
from sklearn.cluster import KMeans


def choose_k(n_items: int, max_k: int = 8, min_k: int = 2) -> int:
    """Heuristic: roughly one cluster per 4-5 items, clamped to [min_k, max_k]."""
    if n_items <= min_k:
        return max(1, n_items)
    return max(min_k, min(max_k, n_items // 4))


def cluster_embeddings(embeddings: list[list[float]], max_k: int = 8) -> list[int]:
    """Returns a cluster label (int) per embedding."""
    n = len(embeddings)
    if n == 0:
        return []
    if n == 1:
        return [0]

    k = choose_k(n, max_k=max_k)
    X = np.array(embeddings)
    model = KMeans(n_clusters=k, n_init=10, random_state=42)
    labels = model.fit_predict(X)
    return labels.tolist()
