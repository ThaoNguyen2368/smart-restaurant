# routers/auth.py — Authentication endpoints
# ERS Section 7.2: POST /api/auth/login

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_refresh_token
from app.models.staff_user import StaffUser
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: DBSession = Depends(get_db)):
    user = db.query(StaffUser).filter(StaffUser.username == data.username, StaffUser.is_active == True).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id), "role": user.role, "display_name": user.display_name}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(data: RefreshRequest, db: DBSession = Depends(get_db)):
    payload = decode_refresh_token(data.refresh_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.query(StaffUser).filter(StaffUser.id == int(payload["sub"]), StaffUser.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id), "role": user.role, "display_name": user.display_name}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
    )
