# schemas/table.py — Table schemas

from typing import Optional
from pydantic import BaseModel


class TableCreate(BaseModel):
    table_number: int
    qr_code_url: str
    floor: Optional[str] = None


class TableUpdate(BaseModel):
    table_number: Optional[int] = None
    qr_code_url: Optional[str] = None
    floor: Optional[str] = None


class TableResponse(BaseModel):
    id: int
    table_number: int
    qr_code_url: str
    status: str
    floor: Optional[str]

    class Config:
        from_attributes = True
