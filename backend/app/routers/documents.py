import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile

from app.core.security import get_current_user_id
from app.core.supabase_client import get_supabase
from app.models.schemas import DocumentOut, LinkIngestRequest
from app.services.document_service import ingest_document, ingest_document_from_link, reingest_document

router = APIRouter()

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB - generous for lecture notes/PDFs, keeps free-tier storage in check
DOCUMENT_COLUMNS = "id, filename, status, page_count, subject_id, version, document_type, source_type, source_url, created_at, updated_at"
ALLOWED_UPLOAD_EXTENSIONS = (".pdf", ".docx", ".txt")  # kept in sync with document_parser.parse_document


def _validate_upload_filename(filename: str | None) -> None:
    if not filename or not filename.lower().endswith(ALLOWED_UPLOAD_EXTENSIONS):
        raise HTTPException(400, "Unsupported file type - upload a PDF, DOCX, or TXT file.")


@router.post("", response_model=DocumentOut)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    subject_id: Optional[str] = Form(default=None),
    document_type: str = Form(default="textbook"),
    user_id: str = Depends(get_current_user_id),
):
    _validate_upload_filename(file.filename)

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 20MB on the free tier).")

    # Ingestion (parsing/OCR/embedding) can take a few seconds - generate the
    # id up front so we can return it immediately, then do the actual work
    # (upload/parse/embed) in the background. The frontend polls
    # GET /api/documents/{id} for status until it flips to "ready"/"failed".
    document_id = str(uuid.uuid4())
    background_tasks.add_task(
        _ingest_and_record, user_id, file.filename, file_bytes, document_id, subject_id, document_type
    )

    return DocumentOut(
        id=document_id, filename=file.filename, status="processing", page_count=None,
        subject_id=subject_id, version=1, document_type=document_type, source_type="upload",
        source_url=None, created_at=_now(),
    )


def _ingest_and_record(
    user_id: str, filename: str, file_bytes: bytes, document_id: str, subject_id: Optional[str], document_type: str
) -> None:
    # A production version would use a task queue (Celery/Redis) and push a
    # websocket/event on completion; polling is simpler and free-tier-friendly
    # for an MVP.
    try:
        ingest_document(user_id, filename, file_bytes, document_id=document_id, subject_id=subject_id, document_type=document_type)
    except Exception as exc:  # noqa: BLE001 - log and move on, status already recorded as "failed"
        print(f"[document ingestion failed] user={user_id} file={filename}: {exc}")


@router.post("/from-link", response_model=DocumentOut)
async def upload_from_link(
    req: LinkIngestRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    """Ingests a textbook from a link instead of an uploaded file - a direct
    PDF link is parsed like an upload; any other URL is treated as a webpage
    and its readable text is extracted. Same downstream pipeline either way
    (chunk -> embed -> cluster into topics -> label), so tests, study
    guides, notes, and the knowledge graph all work identically regardless
    of how the material arrived."""
    document_id = str(uuid.uuid4())
    background_tasks.add_task(
        _ingest_link_and_record, user_id, req.url, document_id, req.subject_id, req.document_type
    )

    return DocumentOut(
        id=document_id, filename=req.url, status="processing", page_count=None,
        subject_id=req.subject_id, version=1, document_type=req.document_type, source_type="link",
        source_url=req.url, created_at=_now(),
    )


def _ingest_link_and_record(
    user_id: str, url: str, document_id: str, subject_id: Optional[str], document_type: str
) -> None:
    try:
        ingest_document_from_link(user_id, url, document_id=document_id, subject_id=subject_id, document_type=document_type)
    except Exception as exc:  # noqa: BLE001
        print(f"[link ingestion failed] user={user_id} url={url}: {exc}")


def _now():
    return datetime.now(timezone.utc)


@router.put("/{document_id}/reupload", response_model=DocumentOut)
async def reupload_document(
    document_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    """Replace a document's content with an updated version - test/attempt
    history for this document_id is preserved, only the source material and
    its derived chunks/embeddings are refreshed."""
    supabase = get_supabase()
    existing = (
        supabase.table("documents").select("id").eq("id", document_id).eq("user_id", user_id).single().execute()
    )
    if not existing.data:
        raise HTTPException(404, "Document not found")

    _validate_upload_filename(file.filename)

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File too large (max 20MB on the free tier).")

    background_tasks.add_task(_reingest_and_record, user_id, document_id, file.filename, file_bytes)

    return get_document(document_id, user_id)


def _reingest_and_record(user_id: str, document_id: str, filename: str, file_bytes: bytes) -> None:
    try:
        reingest_document(user_id, document_id, filename, file_bytes)
    except Exception as exc:  # noqa: BLE001
        print(f"[document reingestion failed] user={user_id} document={document_id}: {exc}")


@router.get("", response_model=list[DocumentOut])
def list_documents(subject_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)):
    supabase = get_supabase()
    query = supabase.table("documents").select(DOCUMENT_COLUMNS).eq("user_id", user_id)
    if subject_id is not None:
        query = query.eq("subject_id", subject_id)
    res = query.order("created_at", desc=True).execute()
    return res.data


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, user_id: str = Depends(get_current_user_id)):
    supabase = get_supabase()
    res = (
        supabase.table("documents")
        .select(DOCUMENT_COLUMNS)
        .eq("id", document_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Document not found")
    return res.data
