from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user_id
from app.models.schemas import AttemptResultOut, AttemptSubmitRequest
from app.services.attempt_service import submit_attempt

router = APIRouter()


@router.post("/submit", response_model=AttemptResultOut)
def submit(req: AttemptSubmitRequest, user_id: str = Depends(get_current_user_id)):
    try:
        result = submit_attempt(
            user_id,
            req.test_id,
            [a.model_dump() for a in req.answers],
            req.time_taken_seconds,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return result
