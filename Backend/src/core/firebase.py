"""Firebase Admin SDK — ID token verification."""

import json
from functools import lru_cache

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from src.core.config import settings


@lru_cache(maxsize=1)
def _init_firebase() -> None:
    raw = settings.FIREBASE_CREDENTIALS_JSON.strip()
    if not raw:
        raise RuntimeError(
            "Firebase credentials not configured. "
            "Set FIREBASE_CREDENTIALS_JSON in .env to your service account JSON."
        )
    try:
        cred_dict = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            "FIREBASE_CREDENTIALS_JSON is not valid JSON. "
            "Paste the full service account JSON on one line."
        ) from exc
    cred = credentials.Certificate(cred_dict)
    firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})


def verify_firebase_token(token: str) -> dict:
    """Verify a Firebase ID token and return the decoded claims."""
    _init_firebase()
    return firebase_auth.verify_id_token(token)
