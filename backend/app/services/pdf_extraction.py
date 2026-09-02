import asyncio
import base64
from io import BytesIO
from pathlib import Path

from pdf2image import convert_from_path, pdfinfo_from_path
from PIL import Image

# Every bill is rasterized and handed straight to a vision-capable model (see
# app/services/bill_parser_service.py::call_parser) - no local text layer/OCR extraction step,
# no direct-vs-scanned branching. Bills are almost always 1-5 pages, so a page count past this
# is treated as abusive input rather than a real bill.
MAX_RENDER_PAGES = 20


def _image_to_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def _render_pages_sync(pdf_path: Path) -> list[str]:
    page_count = pdfinfo_from_path(str(pdf_path)).get("Pages", 0)
    if page_count > MAX_RENDER_PAGES:
        raise RuntimeError(
            f"PDF has {page_count} pages, exceeding the {MAX_RENDER_PAGES}-page render limit"
        )
    images = convert_from_path(str(pdf_path), dpi=300)
    return [_image_to_data_url(image) for image in images]


async def render_pages(pdf_path: Path) -> list[str]:
    """Rasterize every page of the bill into a base64 PNG data URI, ready to hand straight to
    a vision-capable model - a bill is read the same way regardless of whether it happens to
    have an embedded text layer, since the model judges legibility itself from the actual page
    image instead of trusting a local text-extraction step (pdfplumber/pytesseract, both
    removed) that could silently mangle or drop what's on the page."""
    return await asyncio.to_thread(_render_pages_sync, pdf_path)
