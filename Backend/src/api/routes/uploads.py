"""Image upload endpoint — stores files on disk under static/uploads/."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from src.api.deps import get_current_user
from src.models.user import User

router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOAD_DIR = Path("static/uploads")
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload an image. Returns a URL that can be stored as a message's image_url."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: JPEG, PNG, GIF, WebP.",
        )

    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large — maximum size is 10 MB.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    ext = "jpg"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()

    filename = f"{uuid.uuid4()}.{ext}"
    dest = UPLOAD_DIR / filename
    dest.write_bytes(contents)

    return {"url": f"/static/uploads/{filename}", "filename": filename}
