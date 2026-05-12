# schemas/common.py — Shared response wrappers

from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder


def api_response(data: Any) -> JSONResponse:
    """Standard success response (backend.rule.md Section 2.3).
    Uses jsonable_encoder to handle SQLAlchemy objects, Decimal, datetime, etc.
    """
    return JSONResponse(content={
        "data": jsonable_encoder(data),
        "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
    })


class APIError(BaseModel):
    """Standard error response with business rule code."""
    error: str
    message: str
    code: Optional[str] = None
