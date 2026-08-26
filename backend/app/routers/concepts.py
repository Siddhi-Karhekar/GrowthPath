from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.models.schemas import (
    ConceptCandidateOut,
    ConceptCandidateResolveRequest,
    ConceptGraphBuildRequest,
    ConceptGraphOut,
)
from app.services.knowledge_graph_service import (
    build_subject_graph,
    get_subject_graph,
    list_candidates,
    resolve_candidate,
)

router = APIRouter()


@router.post("/build", response_model=ConceptGraphOut)
def build(req: ConceptGraphBuildRequest, user_id: str = Depends(get_current_user_id)):
    """(Re)builds the knowledge graph for a subject: resolves any new topic
    terms since the last build (embedding match + LLM disambiguation), then
    proposes edges between concepts. Safe to call repeatedly - already
    resolved terms are skipped."""
    try:
        return build_subject_graph(user_id, req.subject_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/graph/{subject_id}", response_model=ConceptGraphOut)
def graph(subject_id: str, user_id: str = Depends(get_current_user_id)):
    """Returns the graph as last built - does not trigger a rebuild."""
    return get_subject_graph(user_id, subject_id)


@router.get("/candidates/{subject_id}", response_model=list[ConceptCandidateOut])
def candidates(subject_id: str, user_id: str = Depends(get_current_user_id)):
    """Terms the LLM judge couldn't confidently resolve as same/different -
    left for the student to confirm."""
    return list_candidates(user_id, subject_id)


@router.post("/candidates/{candidate_id}/resolve", status_code=204)
def resolve(candidate_id: str, req: ConceptCandidateResolveRequest, user_id: str = Depends(get_current_user_id)):
    try:
        resolve_candidate(user_id, candidate_id, req.resolution)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
