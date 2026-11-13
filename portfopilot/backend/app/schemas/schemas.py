from typing import Literal, Optional
from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    portfolio_id: str = Field(pattern=r"^PORT-INV-\d{6}-\d{2}$")
    actor: str = Field(default="analyst", min_length=1, max_length=40)


class TradeIn(BaseModel):
    instrument_id: str = Field(pattern=r"^INS-\d{6}$")
    side: Literal["BUY", "SELL"]
    quantity: int = Field(gt=0)


class SimulateRequest(BaseModel):
    trades: Optional[list[TradeIn]] = None


class DecisionRequest(BaseModel):
    actor: str = Field(default="analyst", min_length=1, max_length=40)
    role: Literal["analyst", "senior"] = "analyst"
    note: Optional[str] = Field(default=None, max_length=240)


class ConstraintUpdate(BaseModel):
    value: str = Field(min_length=1, max_length=120)
    actor: str = Field(default="admin", max_length=40)


class Page(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
