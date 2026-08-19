from typing import Optional

from fastapi import APIRouter, Depends

from app.core.security import get_current_user_id
from app.models.schemas import ProgressSummaryOut
from app.services.analytics_service import get_progress_summary

router = APIRouter()


@router.get("/progress", response_model=ProgressSummaryOut)
def progress(subject_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    return get_progress_summary(user_id, subject_id=subject_id)
