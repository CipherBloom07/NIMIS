"""Fail-closed external identity validator for the isolated NIMIS Core pilot.

No user roles or geographic permissions are trusted from the JWT; those are
looked up using the verified OIDC subject in the local actor directory.
Config and provider approval remain institutional prerequisites.
"""
from __future__ import annotations

import os
from urllib.parse import urlparse
from fastapi import HTTPException


def _options():
    issuer=os.environ.get("NIMIS_OIDC_ISSUER","").strip()
    audience=os.environ.get("NIMIS_OIDC_AUDIENCE","").strip()
    jwks=os.environ.get("NIMIS_OIDC_JWKS_URL","").strip()
    if not issuer or not audience or not jwks:
        raise HTTPException(503,detail="Institutional identity provider not configured")
    parts=urlparse(jwks)
    issuer_parts=urlparse(issuer)
    if (parts.scheme!="https" or not parts.hostname or parts.username or parts.password
            or parts.fragment or issuer_parts.scheme!="https" or
            not issuer_parts.hostname or issuer_parts.username or issuer_parts.password
            or parts.hostname.lower()!=issuer_parts.hostname.lower()
            or parts.port!=issuer_parts.port):
        raise HTTPException(503,detail="Identity endpoints must use valid HTTPS URLs")
    return issuer,audience,jwks


def verified_subject(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401,detail="Signed institutional access token required")
    token=authorization.removeprefix("Bearer ").strip()
    if not token or len(token)>12000 or token.count(".")!=2:
        raise HTTPException(401,detail="Invalid bearer token")
    issuer,audience,jwks=_options()
    try:
        import jwt
        key=jwt.PyJWKClient(jwks,cache_jwk_set=True,lifespan=300,
                            timeout=4).get_signing_key_from_jwt(token)
        claims=jwt.decode(
            token,key.key,algorithms=["RS256"],issuer=issuer,audience=audience,
            options={"require":["exp","iat","iss","aud","sub"]},
            leeway=30,
        )
    except Exception as error:
        # Include no token/provider details in user-visible errors.
        if error.__class__.__name__ in ("PyJWKClientConnectionError",
                                         "ConnectionError","TimeoutError"):
            raise HTTPException(503,detail="Institutional login verification unavailable") from None
        raise HTTPException(401,detail="Invalid or expired institutional identity") from None
    subject=claims.get("sub")
    if not isinstance(subject,str) or not 1<=len(subject)<=255:
        raise HTTPException(401,detail="Invalid identity subject")
    return subject
