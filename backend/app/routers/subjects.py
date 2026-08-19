from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.models.schemas import SubjectCreateRequest, SubjectOut
from app.services.subject_service import create_subject, delete_subject, list_subjects, rename_subject

router = APIRouter()


@router.post("", response_model=SubjectOut)
def create(req: SubjectCreateRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return create_subject(user_id, req.name)
    except Exception as exc:
        # Most likely cause: unique (user_id, name) constraint - same folder name twice.
        raise HTTPException(400, f"Could not create subject (maybe the name already exists?): {exc}") from exc


@router.get("", response_model=list[SubjectOut])
def list_all(user_id: str = Depends(get_current_user_id)):
    return list_subjects(user_id)


@router.put("/{subject_id}", response_model=SubjectOut)
def rename(subject_id: str, req: SubjectCreateRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return rename_subject(user_id, subject_id, req.name)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/{subject_id}", status_code=204)
def delete(subject_id: str, user_id: str = Depends(get_current_user_id)):
    delete_subject(user_id, subject_id)
