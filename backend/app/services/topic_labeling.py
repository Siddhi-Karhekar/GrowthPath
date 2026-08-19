"""
Turns clusters of chunk text into short, human-readable topic labels using
a single LLM call (one call for the whole document, not one per chunk, to
stay well within Groq's free-tier rate limits).
"""
import json

from app.core.groq_client import chat_completion


def label_clusters(cluster_samples: dict[int, list[str]]) -> dict[int, str]:
    """cluster_samples: {cluster_id: [example chunk excerpts]}
    Returns {cluster_id: short topic label}."""
    if not cluster_samples:
        return {}

    prompt_parts = []
    for cluster_id, samples in cluster_samples.items():
        excerpt = " / ".join(s[:200] for s in samples[:3])
        prompt_parts.append(f'Cluster {cluster_id}: "{excerpt}"')

    prompt = (
        "You are labeling topic clusters from a student's study document.\n"
        "For each numbered cluster below, give a short topic name (2-5 words, "
        "e.g. 'Cell Membrane Transport', 'Newton's Laws').\n\n"
        + "\n".join(prompt_parts)
        + '\n\nRespond ONLY with JSON: {"labels": {"<cluster_id>": "<topic name>", ...}}'
    )

    try:
        raw = chat_completion(
            [{"role": "user", "content": prompt}], temperature=0.2, json_mode=True
        )
        parsed = json.loads(raw)
        labels = parsed.get("labels", {})
        return {int(k): v for k, v in labels.items()}
    except Exception:
        # Fail soft: fall back to generic labels rather than blocking ingestion.
        return {cid: f"Topic {cid + 1}" for cid in cluster_samples}
