"""Firebase Admin SDK — ID token verification."""

from functools import lru_cache
from pathlib import Path

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from src.core.config import settings


@lru_cache(maxsize=1)
def _init_firebase() -> None:
    cred_path = Path(settings.FIREBASE_CREDENTIALS_PATH)
    if not cred_path.is_file():
        raise RuntimeError(
            f"Firebase credentials not found at {cred_path}. "
            "Set FIREBASE_CREDENTIALS_PATH in .env"
        )
    cred = credentials.Certificate(str(cred_path))
    firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})


def verify_firebase_token(token: str) -> dict:
    """Verify a Firebase ID token and return the decoded claims."""
    _init_firebase()
    return firebase_auth.verify_id_token(token)
