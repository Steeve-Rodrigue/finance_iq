import hashlib
import tempfile
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


def compute_storage_key(user_id: uuid.UUID, content: bytes) -> tuple[str, str]:
    """Returns (storage_key, file_hash) - storage_key is a stable, server-generated
    "{user_id}/{sha256}.pdf" identifier (same format as before), kept as bill metadata and for
    dedup (re-uploading identical bytes reuses the same key). No file is written for it - see
    temp_pdf for the actual (transient) file handling."""
    file_hash = hashlib.sha256(content).hexdigest()
    storage_key = str(Path(str(user_id)) / f"{file_hash}.pdf")
    return storage_key, file_hash


@contextmanager
def temp_pdf(content: bytes) -> Iterator[Path]:
    """Writes the uploaded bytes to a temp file for the duration of parsing. The parser needs a
    real filesystem path (pdf_extraction.extract_text reads from one), but nothing in this app
    reads an uploaded bill's original PDF again after that one parse call - there's no
    "view/download original" feature and no re-parse-later flow - so there's no reason to
    persist it beyond the request. /tmp is writable on effectively every container platform
    (including Render, where this app is deployed with no attached persistent disk), unlike an
    app-relative directory that may not exist or be writable at runtime.
    """
    with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
        tmp.write(content)
        tmp.flush()
        yield Path(tmp.name)
