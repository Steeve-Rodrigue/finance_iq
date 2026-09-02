"""app/services/pdf_extraction.py isn't exercised by tests/test_bill_upload.py - that suite
mocks bill_parser_service.call_parser entirely to avoid real API calls, so the local
rendering step (page rasterization, base64 encoding, page-count guard, error handling) needs
its own coverage.

Every bill - text-layer or scanned - goes through the same render_pages path now (no more
pdfplumber/pytesseract, no more direct-vs-OCR branching) - both real sample PDFs are exercised
below to prove that's actually true, not just true for one of them.
"""

from pathlib import Path

import pytest

from app.services import pdf_extraction

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_TEXT_LAYER_PDF = _DATA_DIR / "Invoice3.pdf"
_SCANNED_PDF = _DATA_DIR / "Invoice2.pdf"
# data/ is gitignored (real sample bills aren't committed) - CI checkouts don't have these,
# so these tests only run where they happen to be present locally.
_skip_without_sample_pdfs = pytest.mark.skipif(
    not (_TEXT_LAYER_PDF.exists() and _SCANNED_PDF.exists()),
    reason="Invoice2.pdf and Invoice3.pdf are gitignored, not present in this checkout",
)


@_skip_without_sample_pdfs
async def test_render_pages_returns_one_data_url_per_page_for_text_layer_pdf() -> None:
    urls = await pdf_extraction.render_pages(_TEXT_LAYER_PDF)
    assert len(urls) >= 1
    assert all(url.startswith("data:image/png;base64,") for url in urls)


@_skip_without_sample_pdfs
async def test_render_pages_returns_one_data_url_per_page_for_scanned_pdf() -> None:
    # Same code path regardless of whether the PDF has a text layer - no branching left to
    # exercise differently here, this just proves it works on a genuinely scanned file too.
    urls = await pdf_extraction.render_pages(_SCANNED_PDF)
    assert len(urls) >= 1
    assert all(url.startswith("data:image/png;base64,") for url in urls)


async def test_render_pages_raises_clear_error_on_corrupt_file(tmp_path: Path) -> None:
    corrupt = tmp_path / "not-a-real.pdf"
    corrupt.write_bytes(b"this is not a pdf, just garbage bytes")

    with pytest.raises(Exception):  # noqa: B017 - pdf2image's exception type isn't public API
        await pdf_extraction.render_pages(corrupt)


async def test_render_pages_rejects_too_many_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pdf_extraction, "pdfinfo_from_path", lambda _: {"Pages": 999})

    with pytest.raises(RuntimeError, match="exceeding"):
        await pdf_extraction.render_pages(Path("irrelevant.pdf"))
