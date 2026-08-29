"""
Builds and serves the per-subject knowledge graph: canonical concepts,
linked into a "learning flow" by directed edges, with terminology
disambiguation so the graph doesn't (a) silently merge two different ideas
that happen to share a name, or (b) keep duplicate nodes for one idea
described with two different names.

Reuses the topic labels already computed at document-ingestion time
(document_service._process_document -> topic_labeling.py) as the raw
candidate terms - no separate NLP/NER pass is needed, since ingestion has
already clustered and named each document's topics.

Disambiguation pipeline (embedding similarity -> LLM judge), run once per
new term when the graph is (re)built for a subject:
  1. Embed the term (+ a short excerpt for context).
  2. Look up nearby existing concepts in this subject via match_concepts
     (pgvector cosine similarity).
  3. Nothing close enough -> it's a genuinely new concept, create it -
     no LLM call needed for the common case.
  4. Something close enough -> log a concept_resolution_candidates row and
     ask the LLM: same concept under another name (merge as an alias),
     a different concept that happens to share the term (new concept, kept
     distinct), or genuinely ambiguous (left pending for the student to
     confirm in the UI rather than auto-resolved either way).

Edges (the "learning flow") are proposed the same LLM-in-the-loop way,
batched into one call per graph build: concept pairs whose embeddings are
close enough are sent to the LLM together, which assigns a relation type
(prerequisite / related / part_of / contrasts_with) or "none".
"""
import json
import uuid
from datetime import datetime, timezone

from app.core.groq_client import chat_completion
from app.core.supabase_client import get_supabase
from app.services.embedding_service import embed_text

# Below this embedding similarity to every existing concept, a term is
# treated as a genuinely new concept with no LLM call needed.
CANDIDATE_SIMILARITY_FLOOR = 0.75

# Below this embedding similarity, two concepts aren't even proposed as a
# possible graph edge - keeps the batched relation-judging prompt focused.
EDGE_SIMILARITY_FLOOR = 0.45

# Caps the relation-judging prompt size for subjects with many concepts.
MAX_EDGE_CANDIDATES = 25

VALID_RELATIONS = ("prerequisite", "related", "part_of", "contrasts_with")


def build_subject_graph(user_id: str, subject_id: str) -> dict:
    supabase = get_supabase()

    doc_res = (
        supabase.table("documents").select("id").eq("user_id", user_id).eq("subject_id", subject_id).execute()
    )
    document_ids = [d["id"] for d in (doc_res.data or [])]
    if not document_ids:
        return {"subject_id": subject_id, "concepts": [], "edges": []}

    chunks_res = (
        supabase.table("document_chunks")
        .select("topic, content, document_id")
        .in_("document_id", document_ids)
        .execute()
    )
    chunks = chunks_res.data or []

    # One representative excerpt per distinct topic label (case-insensitive)
    # - the topic labels ingestion already produced are the candidate terms.
    representative: dict[str, dict] = {}
    for c in chunks:
        topic = (c.get("topic") or "").strip()
        if not topic:
            continue
        key = topic.lower()
        if key not in representative:
            representative[key] = {"label": topic, "excerpt": c["content"][:400], "document_id": c["document_id"]}

    # Only new terms need (re-)resolving - a term already aliased into this
    # subject's graph from a previous build is skipped.
    existing_alias_keys = _existing_alias_keys(supabase, subject_id)
    new_terms = [term for key, term in representative.items() if key not in existing_alias_keys]

    for term in new_terms:
        _resolve_term(supabase, user_id, subject_id, term)

    _propose_edges(supabase, subject_id)

    return get_subject_graph(user_id, subject_id)


def get_subject_graph(user_id: str, subject_id: str) -> dict:
    supabase = get_supabase()

    concepts_res = (
        supabase.table("concepts")
        .select("id, canonical_name, description")
        .eq("subject_id", subject_id)
        .eq("user_id", user_id)
        .execute()
    )
    concepts = concepts_res.data or []

    edges_res = (
        supabase.table("concept_edges")
        .select("id, source_concept_id, target_concept_id, relation_type, weight, rationale")
        .eq("subject_id", subject_id)
        .execute()
    )
    edges = edges_res.data or []

    mastery_res = (
        supabase.table("topic_mastery").select("topic, mastery").eq("user_id", user_id).eq("subject_id", subject_id).execute()
    )
    mastery_by_topic = {m["topic"].strip().lower(): m["mastery"] for m in (mastery_res.data or [])}

    concept_ids = [c["id"] for c in concepts]
    aliases_by_concept: dict[str, list[str]] = {}
    # concept_id -> ordered-unique document ids it was actually drawn from,
    # via each alias's source_document_id - lets the UI show real linked
    # source material ("Recent Insights") per concept instead of nothing.
    source_doc_ids_by_concept: dict[str, list[str]] = {}
    if concept_ids:
        alias_res = (
            supabase.table("concept_aliases")
            .select("concept_id, alias, source_document_id")
            .in_("concept_id", concept_ids)
            .execute()
        )
        for row in alias_res.data or []:
            aliases_by_concept.setdefault(row["concept_id"], []).append(row["alias"])
            doc_id = row.get("source_document_id")
            if doc_id:
                doc_list = source_doc_ids_by_concept.setdefault(row["concept_id"], [])
                if doc_id not in doc_list:
                    doc_list.append(doc_id)

    all_doc_ids = sorted({doc_id for doc_ids in source_doc_ids_by_concept.values() for doc_id in doc_ids})
    filename_by_doc: dict[str, str] = {}
    latest_note_id_by_doc: dict[str, str] = {}
    if all_doc_ids:
        docs_res = supabase.table("documents").select("id, filename").in_("id", all_doc_ids).execute()
        filename_by_doc = {d["id"]: d["filename"] for d in (docs_res.data or [])}

        # Latest note per document: ordered desc by created_at, so the
        # first row seen for a given document is the latest one.
        notes_res = (
            supabase.table("notes")
            .select("id, source_document_id, created_at")
            .in_("source_document_id", all_doc_ids)
            .order("created_at", desc=True)
            .execute()
        )
        for row in notes_res.data or []:
            doc_id = row["source_document_id"]
            if doc_id not in latest_note_id_by_doc:
                latest_note_id_by_doc[doc_id] = row["id"]

    concept_out = []
    for c in concepts:
        names = [c["canonical_name"], *aliases_by_concept.get(c["id"], [])]
        mastery = next((mastery_by_topic[n.strip().lower()] for n in names if n.strip().lower() in mastery_by_topic), None)
        source_documents = [
            {
                "document_id": doc_id,
                "filename": filename_by_doc.get(doc_id, "Untitled document"),
                "note_id": latest_note_id_by_doc.get(doc_id),
            }
            for doc_id in source_doc_ids_by_concept.get(c["id"], [])
            if doc_id in filename_by_doc
        ]
        concept_out.append(
            {
                "id": c["id"],
                "canonical_name": c["canonical_name"],
                "description": c.get("description"),
                "mastery": mastery,
                "source_documents": source_documents,
            }
        )

    return {"subject_id": subject_id, "concepts": concept_out, "edges": edges}


def list_candidates(user_id: str, subject_id: str) -> list[dict]:
    supabase = get_supabase()
    res = (
        supabase.table("concept_resolution_candidates")
        .select("id, new_alias, candidate_concept_id, embedding_similarity, llm_verdict, llm_rationale, status")
        .eq("user_id", user_id)
        .eq("subject_id", subject_id)
        .eq("status", "pending")
        .execute()
    )
    candidates = res.data or []
    if not candidates:
        return []

    concept_ids = list({c["candidate_concept_id"] for c in candidates})
    names_res = supabase.table("concepts").select("id, canonical_name").in_("id", concept_ids).execute()
    name_by_id = {c["id"]: c["canonical_name"] for c in (names_res.data or [])}
    for c in candidates:
        c["candidate_concept_name"] = name_by_id.get(c["candidate_concept_id"], "?")
    return candidates


def resolve_candidate(user_id: str, candidate_id: str, resolution: str) -> None:
    supabase = get_supabase()
    res = (
        supabase.table("concept_resolution_candidates").select("*").eq("id", candidate_id).eq("user_id", user_id).single().execute()
    )
    candidate = res.data
    if not candidate:
        raise ValueError("Candidate not found")

    if resolution == "confirm_same":
        _add_alias(supabase, candidate["candidate_concept_id"], candidate["new_alias"], None, candidate["embedding_similarity"], "manual")
        new_status = "user_confirmed"
    elif resolution == "reject_as_different":
        embedding = embed_text(candidate["new_alias"])
        _create_concept(
            supabase, user_id, candidate["subject_id"], candidate["new_alias"], None, embedding,
            resolution_method="manual", confidence=1.0,
        )
        new_status = "user_rejected"
    else:
        raise ValueError("resolution must be 'confirm_same' or 'reject_as_different'")

    supabase.table("concept_resolution_candidates").update(
        {"status": new_status, "resolved_at": _now_iso()}
    ).eq("id", candidate_id).execute()


# ---------------------------------------------------------------------------
# internals
# ---------------------------------------------------------------------------

def _existing_alias_keys(supabase, subject_id: str) -> set[str]:
    concept_res = supabase.table("concepts").select("id").eq("subject_id", subject_id).execute()
    concept_ids = [c["id"] for c in (concept_res.data or [])]
    if not concept_ids:
        return set()
    alias_res = supabase.table("concept_aliases").select("alias").in_("concept_id", concept_ids).execute()
    return {row["alias"].strip().lower() for row in (alias_res.data or [])}


def _resolve_term(supabase, user_id: str, subject_id: str, term: dict) -> None:
    label = term["label"]
    embedding = embed_text(f"{label}: {term['excerpt']}")

    match_res = supabase.rpc(
        "match_concepts", {"query_embedding": embedding, "match_subject_id": subject_id, "match_count": 3}
    ).execute()
    candidates = [m for m in (match_res.data or []) if m["similarity"] >= CANDIDATE_SIMILARITY_FLOOR]

    if not candidates:
        _create_concept(
            supabase, user_id, subject_id, label, term["document_id"], embedding,
            resolution_method="exact", confidence=1.0,
        )
        return

    best = candidates[0]
    verdict, rationale, suggested_name = _judge_same_concept(label, term["excerpt"], best["canonical_name"])

    supabase.table("concept_resolution_candidates").insert(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "subject_id": subject_id,
            "new_alias": label,
            "candidate_concept_id": best["id"],
            "embedding_similarity": best["similarity"],
            "llm_verdict": verdict,
            "llm_rationale": rationale,
            "status": "pending" if verdict == "ambiguous_needs_review" else "auto_resolved",
            "resolved_at": None if verdict == "ambiguous_needs_review" else _now_iso(),
        }
    ).execute()

    if verdict == "same_concept":
        _add_alias(supabase, best["id"], label, term["document_id"], best["similarity"], "embedding_llm_confirmed")
    elif verdict == "different_concept":
        new_name = suggested_name or label
        _create_concept(
            supabase, user_id, subject_id, new_name, term["document_id"], embedding,
            resolution_method="embedding_llm_confirmed", confidence=best["similarity"], alias_text=label,
        )
    # ambiguous_needs_review: intentionally left pending - no concept/alias
    # created yet, surfaced to the student in the UI to confirm manually.


def _judge_same_concept(new_term: str, excerpt: str, existing_name: str) -> tuple[str, str, str | None]:
    prompt = (
        "A student's knowledge graph for one subject already has a concept named "
        f'"{existing_name}". A new term just appeared in their material: "{new_term}", '
        f'used in this context: "{excerpt[:400]}"\n\n'
        "Decide: is the new term the SAME concept as the existing one under a different name "
        "(a synonym), a DIFFERENT concept that just happens to share/overlap the term (e.g. "
        "the same word used for two different things), or genuinely AMBIGUOUS from this "
        "context alone?\n\n"
        'Respond ONLY with JSON: {"verdict": "same_concept"|"different_concept"|'
        '"ambiguous_needs_review", "rationale": "one sentence", "suggested_distinct_name": '
        '"a short, unambiguous name for the new term if verdict is different_concept '
        "(e.g. distinguish 'CPU Cache' from 'Browser Cache'), else null\"}"
    )
    try:
        raw = chat_completion([{"role": "user", "content": prompt}], temperature=0.2, json_mode=True)
        parsed = json.loads(raw)
        verdict = parsed.get("verdict", "ambiguous_needs_review")
        if verdict not in ("same_concept", "different_concept", "ambiguous_needs_review"):
            verdict = "ambiguous_needs_review"
        return verdict, parsed.get("rationale", ""), parsed.get("suggested_distinct_name")
    except Exception:
        # Fail soft towards caution: don't silently auto-merge if the judge call breaks.
        return "ambiguous_needs_review", "Automated disambiguation failed - please confirm manually.", None


def _create_concept(
    supabase, user_id: str, subject_id: str, name: str, document_id: str | None, embedding: list[float],
    *, resolution_method: str, confidence: float, alias_text: str | None = None,
) -> str:
    concept_id = str(uuid.uuid4())
    supabase.table("concepts").insert(
        {"id": concept_id, "user_id": user_id, "subject_id": subject_id, "canonical_name": name, "embedding": embedding}
    ).execute()
    _add_alias(supabase, concept_id, alias_text or name, document_id, confidence, resolution_method)
    return concept_id


def _add_alias(supabase, concept_id: str, alias: str, document_id: str | None, confidence: float, resolution_method: str) -> None:
    supabase.table("concept_aliases").insert(
        {
            "id": str(uuid.uuid4()),
            "concept_id": concept_id,
            "alias": alias,
            "source_document_id": document_id,
            "confidence": confidence,
            "resolution_method": resolution_method,
        }
    ).execute()


def _propose_edges(supabase, subject_id: str) -> None:
    concepts_res = supabase.table("concepts").select("id, canonical_name, embedding").eq("subject_id", subject_id).execute()
    concepts = concepts_res.data or []
    if len(concepts) < 2:
        return

    existing_res = supabase.table("concept_edges").select("source_concept_id, target_concept_id").eq("subject_id", subject_id).execute()
    existing_pairs = {frozenset((e["source_concept_id"], e["target_concept_id"])) for e in (existing_res.data or [])}

    pairs = []
    for i in range(len(concepts)):
        for j in range(i + 1, len(concepts)):
            a, b = concepts[i], concepts[j]
            if frozenset((a["id"], b["id"])) in existing_pairs:
                continue
            sim = _cosine(a["embedding"], b["embedding"])
            if sim >= EDGE_SIMILARITY_FLOOR:
                pairs.append((a, b, sim))

    pairs.sort(key=lambda p: -p[2])
    pairs = pairs[:MAX_EDGE_CANDIDATES]
    if not pairs:
        return

    proposals = _judge_relations(pairs)

    rows = []
    for (a, b, sim), proposal in zip(pairs, proposals):
        relation = proposal.get("relation_type")
        if relation not in VALID_RELATIONS:
            continue
        if relation == "prerequisite" and proposal.get("direction") == "b_before_a":
            source, target = b, a
        else:
            source, target = a, b
        rows.append(
            {
                "id": str(uuid.uuid4()),
                "subject_id": subject_id,
                "source_concept_id": source["id"],
                "target_concept_id": target["id"],
                "relation_type": relation,
                "weight": round(float(proposal.get("confidence", sim)), 3),
                "rationale": proposal.get("rationale"),
            }
        )
    if rows:
        supabase.table("concept_edges").insert(rows).execute()


def _judge_relations(pairs: list[tuple[dict, dict, float]]) -> list[dict]:
    items = [
        {"pair_index": i, "concept_a": a["canonical_name"], "concept_b": b["canonical_name"]}
        for i, (a, b, _sim) in enumerate(pairs)
    ]
    prompt = (
        "For each numbered pair of concepts from the same subject's knowledge graph, decide how "
        "they relate, so a student can navigate a learning flow between them.\n\n"
        f"{json.dumps(items, indent=2)}\n\n"
        'For each pair, respond with one of: "prerequisite" (concept_a should usually be learned '
        'before concept_b - set direction to "a_before_b" or "b_before_a"), "related" (connected '
        'but no clear order), "part_of" (one is a sub-topic of the other), "contrasts_with" '
        '(often confused or worth distinguishing), or "none" if they aren\'t meaningfully '
        "connected for a learner. Also give a confidence 0-1 and a short one-sentence rationale.\n\n"
        'Respond ONLY with JSON: {"relations": [{"pair_index": 0, "relation_type": "...", '
        '"direction": "a_before_b"|"b_before_a"|null, "confidence": 0.0, "rationale": "..."}]}'
    )
    try:
        raw = chat_completion([{"role": "user", "content": prompt}], temperature=0.2, json_mode=True)
        parsed = json.loads(raw)
        by_index = {r["pair_index"]: r for r in parsed.get("relations", [])}
        return [by_index.get(i, {"relation_type": "none"}) for i in range(len(pairs))]
    except Exception:
        return [{"relation_type": "none"} for _ in pairs]


def _cosine(a: list[float], b: list[float]) -> float:
    # Embeddings are unit-normalized at creation (embedding_service.py uses
    # normalize_embeddings=True), so a plain dot product equals cosine similarity.
    return float(sum(x * y for x, y in zip(a, b)))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
