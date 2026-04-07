from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import decode_access_token


ROLE_ORDER = {"Viewer": 1, "Editor": 2, "Admin": 3}
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    x_user_id: int | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    user = None
    if token:
        subject = decode_access_token(token)
        if subject and subject.isdigit():
            user = db.query(User).filter(User.id == int(subject)).first()
    if not user and x_user_id is not None:
        user = db.query(User).filter(User.id == x_user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


def require_role(min_role: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        current = ROLE_ORDER.get(user.role, 0)
        needed = ROLE_ORDER.get(min_role, 99)
        if current < needed:
            raise HTTPException(status_code=403, detail=f"{min_role} role required")
        return user

    return checker
