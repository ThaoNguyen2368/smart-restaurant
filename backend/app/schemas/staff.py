# schemas/staff.py — Staff User schemas

from typing import Optional
from pydantic import BaseModel, Field


class StaffUserCreate(BaseModel):
    username: str
    password: str = Field(..., min_length=8)
    role: str = Field("staff", pattern="^(staff|cashier|manager|admin|kitchen)$")
    display_name: str


class StaffUserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)
    role: Optional[str] = Field(None, pattern="^(staff|cashier|manager|admin|kitchen)$")
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class StaffUserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    display_name: str

    class Config:
        from_attributes = True
