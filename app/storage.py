import hashlib
import uuid
from pathlib import Path

from app.config import settings


def save_upload(user_id: uuid.UUID, content: bytes) -> tuple[str, str]:
    """Save uploaded file bytes to disk, scoped by user.

    Returns (storage_key, file_hash). storage_key is a path relative to UPLOAD_DIR;
    file_hash is the sha256 of the content, also used as the filename so re-uploading
    identical bytes overwrites rather than duplicates.
    """
    file_hash = hashlib.sha256(content).hexdigest()
    relative_path = Path(str(user_id)) / f"{file_hash}.pdf"

    full_path = Path(settings.upload_dir) / relative_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(content)

    return str(relative_path), file_hash


def resolve_path(storage_key: str) -> Path:
    base = Path(settings.upload_dir).resolve()
    resolved = (base / storage_key).resolve()
    if not resolved.is_relative_to(base):
        raise ValueError(f"storage_key escapes upload_dir: {storage_key!r}")
    return resolved
