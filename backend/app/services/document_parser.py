"""
Extracts raw text from uploaded study material (PDF, DOCX) and chunks it for
embedding. Falls back to Tesseract OCR when a PDF page has no extractable
text layer (i.e. it's a scanned image), which is what most students will
actually upload (photographed notes, scanned textbook pages, etc).
"""
import io

import fitz  # PyMuPDF
from docx import Document as DocxDocument
from PIL import Image
import pytesseract


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
