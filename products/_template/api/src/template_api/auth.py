from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Request
from jwt import PyJWKClient

from .errors import ProblemException
from .schemas.user import MeRead
from .settings import Settings, get_settings


@lru_cache
def _jwks_client(jwks_url: str) -> PyJWKClient:
    # PyJWKClient caches keys internally; lru_cache keeps ONE client per URL. (Ruling #5)
    return PyJWKClient(jwks_url)


def _decode(token: str, settings: Settings) -> dict[str, object]:
    # PRIMARY path on ALL environments (incl. local): verify via JWKS (ES256/RS256). New
    # Supabase projects sign asymmetrically by default, and the local CLI now ALSO issues
    # ES256 by default (since CLI v2.71.1) — so point SUPABASE_URL at http://localhost:54321
    # locally and let PyJWKClient hit the local /auth/v1/.well-known/jwks.json too. (Ruling #5)
    jwks_url = settings.jwks_url  # explicit SUPABASE_JWKS_URL override, else derived
    if jwks_url is not None:
        try:
            signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience=settings.jwt_audience,
            )
        except jwt.PyJWTError:
            pass  # fall through to the HS256 genuine fallback
    # HS256 + SUPABASE_JWT_SECRET — GENUINE FALLBACK ONLY (older CLI, self-hosted symmetric
    # secret, manually-minted test tokens). NOT the local happy path: a current CLI issues
    # ES256, so the JWKS branch above is what handles local tokens.
    if settings.supabase_jwt_secret is not None:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.jwt_audience,
        )
    raise ProblemException(status=401, title="Unauthorized", detail="No verifiable token")


def get_current_user(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> MeRead:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise ProblemException(status=401, title="Unauthorized", detail="Missing bearer token")
    try:
        claims = _decode(auth.removeprefix("Bearer "), settings)
    except jwt.PyJWTError as exc:
        raise ProblemException(status=401, title="Unauthorized", detail=str(exc)) from exc
    sub = claims.get("sub")
    if not isinstance(sub, str):
        raise ProblemException(status=401, title="Unauthorized", detail="No subject claim")
    email = claims.get("email")
    return MeRead(id=sub, email=email if isinstance(email, str) else None)


CurrentUser = Annotated[MeRead, Depends(get_current_user)]
