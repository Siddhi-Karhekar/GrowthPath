from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.core.security import get_current_user_id
from app.core.supabase_client import get_supabase
from app.models.schemas import (
    AdaptiveNextRequest,
    MCQCheckRequest,
    MCQCheckResponse,
    OCRAnswerOut,
    QuestionOut,
    TestGenerateRequest,
    TestOut,
)
from app.services.adaptive_service import check_mcq_correct, get_next_question
from app.services.document_parser import ocr_image
from app.services.test_generation import generate_test

router = APIRouter()

MAX_OCR_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB - generous for a single phone photo


@router.post("/generate", response_model=TestOut)
def create_test(req: TestGenerateRequest, user_id: str = Depends(get_current_user_id)):
    try:
        test_id = generate_test(user_id, req)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return _load_test(test_id, user_id)


@router.get("/{test_id}", response_model=TestOut)
def get_test(test_id: str, user_id: str = Depends(get_current_user_id)):
    return _load_test(test_id, user_id)


@router.post("/{test_id}/next-question", response_model=QuestionOut | None)
def next_question(test_id: str, req: AdaptiveNextRequest, user_id: str = Depends(get_current_user_id)):
    """Used only for adaptive tests: returns the single best next question
    given what's been answered so far, or null when the pool is exhausted."""
    try:
        question = get_next_question(
            user_id, test_id, req.answered_question_ids, req.running_score, req.running_max
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return question


@router.post("/questions/{question_id}/check", response_model=MCQCheckResponse)
def check_question(question_id: str, req: MCQCheckRequest, user_id: str = Depends(get_current_user_id)):
    """Live, unpersisted correctness check - used only to drive adaptive
    difficulty selection in real time. Does not award marks or count as an
    answer; final scoring only happens via /api/attempts/submit."""
    try:
        is_correct = check_mcq_correct(user_id, question_id, req.response)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"is_correct": is_correct}


@router.post("/ocr-answer", response_model=OCRAnswerOut)
async def ocr_answer(file: UploadFile, user_id: str = Depends(get_current_user_id)):
    """Extracts text from a photo of a handwritten theory answer, so a
    student can photograph a written answer instead of typing it. Returns
    the raw extracted text only - nothing is persisted here, and the
    frontend puts it in the editable answer box so the student can fix any
    OCR mistakes before it's actually submitted for grading."""
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(400, "Upload a photo (JPG/PNG/etc), not a document.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_OCR_UPLOAD_BYTES:
        raise HTTPException(413, "Image too large (max 10MB).")

    try:
        text = ocr_image(file_bytes)
    except Exception as exc:
        raise HTTPException(400, "Couldn't read that image - try a clearer, well-lit photo.") from exc

    if not text:
        raise HTTPException(422, "No text could be read from that image - try a clearer, well-lit photo.")
    return {"text": text}


def _load_test(test_id: str, user_id: str) -> dict:
    supabase = get_supabase()
    test_res = (
        supabase.table("tests").select("*").eq("id", test_id).eq("user_id", user_id).single().execute()
    )
    if not test_res.data:
        raise HTTPException(404, "Test not found")

    q_res = (
        supabase.table("questions")
        .select("*")
        .eq("test_id", test_id)
        .order("order_index")
        .execute()
    )

    test = test_res.data
    test["questions"] = q_res.data or []
    return test
