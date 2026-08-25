import asyncio
from pathlib import Path

import pdfplumber
import pytesseract
from pdf2image import convert_from_path, pdfinfo_from_path

from app.config import settings

# Below this many characters, a direct-extraction result is treated as "no text layer"
# (a scanned PDF) rather than a genuinely short document, and OCR is tried instead.
MIN_DIRECT_TEXT_CHARS = 20

# OCR rasterizes every page at 300 DPI into memory at once - bills are almost always 1-5
# pages, so a page count past this is treated as abusive input rather than a real bill.
MAX_OCR_PAGES = 20


def _extract_text_direct_sync(pdf_path: Path) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        pages = (page.extract_text() or "" for page in pdf.pages)
        return "\n".join(pages).strip()


def _extract_text_ocr_sync(pdf_path: Path) -> str:
    page_count = pdfinfo_from_path(str(pdf_path)).get("Pages", 0)
    if page_count > MAX_OCR_PAGES:
        raise RuntimeError(
            f"PDF has {page_count} pages, exceeding the {MAX_OCR_PAGES}-page OCR limit"
        )
    images = convert_from_path(str(pdf_path), dpi=300)
    pages = (
        pytesseract.image_to_string(image, lang=settings.ocr_language, config="--psm 6")
        for image in images
    )
    return "\n".join(pages).strip()


async def extract_text_direct(pdf_path: Path) -> str:
    """Pull text straight out of the PDF's own text layer - fast and exact, but returns
    empty/near-empty on a scanned (image-only) PDF."""
    return await asyncio.to_thread(_extract_text_direct_sync, pdf_path)


async def extract_text_ocr(pdf_path: Path) -> str:
    """Rasterize each page and run Tesseract OCR - slower and introduces recognition
    errors, but works on scanned PDFs with no text layer."""
    return await asyncio.to_thread(_extract_text_ocr_sync, pdf_path)


async def extract_text(pdf_path: Path) -> tuple[str, str]:
    """Direct text extraction first; OCR only if that comes back empty (no text layer).
    Returns (text, method) so callers can log/record which path produced the text."""
    text = await extract_text_direct(pdf_path)
    if len(text) >= MIN_DIRECT_TEXT_CHARS:
        return text, "direct"

    text = await extract_text_ocr(pdf_path)
    return text, "ocr"
