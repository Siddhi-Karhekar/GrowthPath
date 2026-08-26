from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.models.schemas import NoteCreateRequest, NoteGenerateRequest, NoteOut
from app.services.notes_service import create_freehand_note, generate_notes, get_latest_notes, list_notes

router = APIRouter()


@router.post("/generate", response_model=NoteOut)
def generate(req: NoteGenerateRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return generate_notes(user_id, req.document_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/by-document/{document_id}", response_model=NoteOut | None)
def latest_for_document(document_id: str, user_id: str = Depends(get_current_user_id)):
    """Returns the most recently generated notes for this document, if any,
    so the frontend can show cached notes instead of always regenerating
    (each generation costs an LLM call)."""
    return get_latest_notes(user_id, document_id)


@router.post("", response_model=NoteOut)
def create(req: NoteCreateRequest, user_id: str = Depends(get_current_user_id)):
    """Freehand note, written directly rather than generated from a document."""
    return create_freehand_note(user_id, req.subject_id, req.title, req.content)


@router.get("", response_model=list[NoteOut])
def list_all(subject_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return list_notes(user_id, subject_id)
