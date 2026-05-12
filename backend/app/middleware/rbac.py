# middleware/rbac.py — Role-Based Access Control
# backend.rule.md Section 3.2: RBAC rejects with 403 BEFORE service logic

from functools import wraps
from typing import Callable

from fastapi import HTTPException, status

from app.models.staff_user import StaffUser


def require_roles(*allowed_roles: str) -> Callable:
    """Dependency factory: reject if user role not in allowed_roles.
    Usage: Depends(require_roles("manager", "admin"))
    """
    def role_checker(current_user: StaffUser) -> StaffUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "FORBIDDEN",
                    "message": f"Role '{current_user.role}' is not permitted for this action. Required: {', '.join(allowed_roles)}",
                },
            )
        return current_user
    return role_checker
