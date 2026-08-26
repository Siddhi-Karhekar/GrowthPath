"""
Extracts raw text from uploaded study material (PDF, DOCX) and chunks it for
embedding. Falls back to Tesseract OCR when a PDF page has no extractable
text layer (i.e. it's a scanned image), which is what most students will
actually upload (photographed notes, scanned textbook pages, etc).

Also handles the "textbook link" ingestion path: a direct PDF link is parsed
the same way as an upload, and any other URL is treated as an HTML page and
reduced to its readable text.
"""
import io

import fitz  # PyMuPDF
import httpx
from bs4 import BeautifulSoup
from docx import Document as DocxDocument
from PIL import Image
import pytesseract

USER_AGENT = "GrowthPathBot/1.0 (+https://github.com/Siddhi-Karhekar/GrowthPath)"


def parse_document(file_bytes: bytes, filename: str) -> tuple[str, int]:
    """Returns (full_text, page_count)."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return _parse_pdf(file_bytes)
    if lower.endswith(".docx"):
        return _parse_docx(file_bytes), 1
    if lower.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore"), 1
    raise ValueError(f"Unsupported file type: {filename}. Use PDF, DOCX, or TXT.")


def _parse_pdf(file_bytes: bytes) -> tuple[str, int]:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages_text = []
    for page in doc:
        text = page.get_text().strip()
        if not text:
            # No extractable text layer -> likely a scanned page, OCR it.
            pix = page.get_pixmap(dpi=200)
            image = Image.open(io.BytesIO(pix.tobytes("png")))
            text = pytesseract.image_to_string(image)
        pages_text.append(text)
    return "\n\n".join(pages_text), len(doc)


def _parse_docx(file_bytes: bytes) -> str:
    doc = DocxDocument(io.BytesIO(file_bytes))
    return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())


def chunk_text(text: str, chunk_size: int = 900, overlap: int = 150) -> list[str]:
    """Simple sliding-window chunker on whitespace-normalized text.
    Good enough for RAG grounding without pulling in a heavier text splitter."""
    words = text.split()
    if not words:
        return []

    chunks = []
    step = max(chunk_size - overlap, 1)
    for start in range(0, len(words), step):
        chunk_words = words[start : start + chunk_size]
        if not chunk_words:
            break
        chunks.append(" ".join(chunk_words))
        if start + chunk_size >= len(words):
            break
    return chunks


# ---------------------------------------------------------------------------
# Link ingestion: a student can paste a link to a textbook (a direct PDF
# link, or a webpage) instead of uploading a file. Fetched content goes
# through the same chunk_text() as an upload - only how the raw text is
# obtained differs.
# ---------------------------------------------------------------------------

ALLOWED_SCHEMES = ("http", "https")


def fetch_url(url: str) -> tuple[bytes, str]:
    """Downloads a URL and returns (content_bytes, content_type). Kept as a
    separate step from parsing so document_service can persist the raw bytes
    to Storage before parsing, same as an uploaded file."""
    scheme = url.split("://", 1)[0].lower() if "://" in url else ""
    if scheme not in ALLOWED_SCHEMES:
        raise ValueError("Only http/https links are supported.")

    with httpx.Client(follow_redirects=True, timeout=30.0, headers={"User-Agent": USER_AGENT}) as client:
        resp = client.get(url)
    resp.raise_for_status()
    content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
    return resp.content, content_type


def parse_url_content(content: bytes, content_type: str, url: str) -> tuple[str, int]:
    """Returns (full_text, page_count) for fetched URL content. A direct PDF
    link goes through the same PDF parser as an upload; anything else is
    treated as an HTML page and its readable text is extracted."""
    if content_type == "application/pdf" or url.lower().split("?")[0].endswith(".pdf"):
        return _parse_pdf(content)
    return _parse_html(content), 1


def _parse_html(content: bytes) -> str:
    soup = BeautifulSoup(content, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "noscript", "form"]):
        tag.decompose()
    text = soup.get_text("\n")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def filename_from_url(url: str) -> str:
    """Best-effort human-readable filename for a link-sourced document."""
    path = url.split("://", 1)[-1]
    tail = path.rstrip("/").split("/")[-1] or path.split("/")[0]
    tail = tail.split("?")[0].split("#")[0]
    return tail or url
