"""app/services/pdf_extraction.py isn't exercised by tests/test_bill_upload.py - that suite
mocks bill_parser_service.call_parser entirely to avoid real API calls, so the local
extraction step (direct-vs-OCR branching, error handling) needs its own coverage.

data/Invoice2.pdf turned out to be a genuinely scanned/image-only PDF (0 chars via direct
pdfplumber extraction) - confirmed by inspecting all four data/ samples directly, not assumed.
It's used below as the real OCR-fallback fixture rather than a synthetic one.
"""

from pathlib import Path

import pytest

from app.services import pdf_extraction

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_TEXT_BASED_PDF = _DATA_DIR / "Invoice3.pdf"
_SCANNED_PDF = _DATA_DIR / "Invoice2.pdf"


async def test_extract_text_direct_on_real_text_based_pdf() -> None:
    text = await pdf_extraction.extract_text_direct(_TEXT_BASED_PDF)
    assert len(text) >= pdf_extraction.MIN_DIRECT_TEXT_CHARS


async def test_extract_text_picks_direct_method_for_text_based_pdf() -> None:
    text, method = await pdf_extraction.extract_text(_TEXT_BASED_PDF)
    assert method == "direct"
    assert len(text) > 0


async def test_extract_text_direct_returns_empty_on_scanned_pdf() -> None:
    text = await pdf_extraction.extract_text_direct(_SCANNED_PDF)
    assert len(text) < pdf_extraction.MIN_DIRECT_TEXT_CHARS


async def test_extract_text_falls_back_to_ocr_on_scanned_pdf() -> None:
    text, method = await pdf_extraction.extract_text(_SCANNED_PDF)
    assert method == "ocr"
    assert len(text) > 0


async def test_extract_text_direct_raises_clear_error_on_corrupt_file(tmp_path: Path) -> None:
    corrupt = tmp_path / "not-a-real.pdf"
    corrupt.write_bytes(b"this is not a pdf, just garbage bytes")

    with pytest.raises(Exception):  # noqa: B017 - pdfplumber's own exception type isn't public API
        await pdf_extraction.extract_text_direct(corrupt)
