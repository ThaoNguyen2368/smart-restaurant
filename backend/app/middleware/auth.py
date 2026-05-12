# middleware/auth.py — JWT verification + Session ID validation
# backend.rule.md Section 3

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.staff_user import StaffUser
from app.models.session import Session

security_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: DBSession = Depends(get_db),
) -> StaffUser:
    """Extract and verify JWT to get current staff user."""
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = db.query(StaffUser).filter(
        StaffUser.id == int(user_id),
        StaffUser.is_active == True,
    ).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    return user


async def get_current_session(
    x_session_id: int = Header(..., alias="X-Session-ID"),
    db: DBSession = Depends(get_db),
) -> Session:
    """Validate X-Session-ID header for customer endpoints (backend.rule.md Section 3.3)."""
    session = db.query(Session).filter(
        Session.id == x_session_id,
        Session.status == "open",
    ).first()

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or closed session",
        )

    return session
