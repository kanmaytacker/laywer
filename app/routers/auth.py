from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuthCredential, User
from ..schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from ..security import create_access_token, hash_password, verify_password
from ..supabase_client import get_supabase_client

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=TokenResponse,
    summary="Register user (legacy local auth)",
    description=(
        "Creates a user in the local SQLite auth store and returns a local JWT.\n"
        "For Supabase-first flows, prefer signing up directly with Supabase Auth from the frontend."
    ),
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(name=payload.name, email=payload.email, role=payload.role, tenant=payload.tenant)
    db.add(user)
    db.commit()
    db.refresh(user)

    cred = AuthCredential(user_id=user.id, password_hash=hash_password(payload.password))
    db.add(cred)
    db.commit()

    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login with email/password",
    description=(
        "Authenticates against local auth first, then falls back to Supabase Auth.\n"
        "If Supabase credentials are valid, the endpoint returns the Supabase access token."
    ),
    responses={
        401: {"description": "Invalid credentials"},
    },
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    # Legacy local-auth path (SQLite users table).
    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        cred = db.query(AuthCredential).filter(AuthCredential.user_id == user.id).first()
        if cred and verify_password(payload.password, cred.password_hash):
            token = create_access_token(str(user.id))
            return TokenResponse(access_token=token, user=UserOut.model_validate(user))

    # Supabase-auth fallback so /auth/login works with Supabase credentials.
    try:
        client = get_supabase_client(service_role=False)
        auth_response = client.auth.sign_in_with_password(
            {
                "email": payload.email,
                "password": payload.password,
            }
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid credentials") from None

    session = getattr(auth_response, "session", None)
    supa_user = getattr(auth_response, "user", None)
    access_token = getattr(session, "access_token", None)
    if not access_token or not supa_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    metadata = getattr(supa_user, "user_metadata", {}) or {}
    app_meta = getattr(supa_user, "app_metadata", {}) or {}
    mapped_user = UserOut(
        id=0,
        name=metadata.get("name") or payload.email.split("@")[0],
        email=getattr(supa_user, "email", payload.email) or payload.email,
        role=app_meta.get("role", "Editor"),
        tenant=app_meta.get("tenant", "default"),
    )
    return TokenResponse(access_token=access_token, user=mapped_user)
