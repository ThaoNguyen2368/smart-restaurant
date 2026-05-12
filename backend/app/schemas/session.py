# schemas/session.py — Session schemas

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SessionResponse(BaseModel):
    id: int
    table_id: int
    table_number: Optional[int] = None
    opened_at: datetime
    closed_at: Optional[datetime]
    status: str
    merged_into_session_id: Optional[int]

    class Config:
        from_attributes = True


class TableTransferRequest(BaseModel):
    """Transfer session to a new table (BR-011: blocked if destination occupied)."""
    destination_table_id: int


class SessionMergeRequest(BaseModel):
    """Merge a source session into a master session (Manager only)."""
    source_session_id: int
    master_session_id: int
