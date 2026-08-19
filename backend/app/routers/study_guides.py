from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.models.schemas import StudyGuideGenerateRequest, StudyGuideOut
from app.services.study_guide_service import generate_study_guide, get_latest_study_guide

router = APIRouter()


@router.post("/generate", response_model=StudyGuideOut)
def generate(req: StudyGuideGenerateRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return generate_study_guide(user_id, req.document_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/by-document/{document_id}", response_model=StudyGuideOut | None)
def latest_for_document(document_id: str, user_id: str = Depends(get_current_user_id)):
    """Returns the most recently generated study guide for this document, if
    any, so the frontend can show a cached one instead of always
    regenerating (each generation costs an LLM call)."""
    return get_latest_study_guide(user_id, document_id)
