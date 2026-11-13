from datetime import date, datetime
from sqlalchemy import (String, Integer, Float, Boolean, Date, DateTime, ForeignKey,
                        UniqueConstraint, CheckConstraint, JSON, DDL, event)
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.database.db import Base

RISKS = ("Conservative", "Moderate", "Balanced", "Growth", "Aggressive")
CLASSES = ("Equity", "Fixed Income", "Real Estate", "Commodities", "Alternatives")
TIERS = ("High", "Medium", "Low")
STATUSES = ("PROPOSED", "FAILED", "APPROVED", "REJECTED")


def _in(col, vals):
    return f"{col} IN ({','.join(repr(v) for v in vals)})"


class InvestorProfile(Base):
    __tablename__ = "investor_profiles"
    investor_id: Mapped[str] = mapped_column(String(12), primary_key=True)
    full_name: Mapped[str] = mapped_column(String(80))
    risk_category: Mapped[str] = mapped_column(String(16))
    created_on: Mapped[date] = mapped_column(Date)
    __table_args__ = (CheckConstraint(_in("risk_category", RISKS), name="ck_inv_risk"),)


class Portfolio(Base):
    __tablename__ = "portfolios"
    portfolio_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    investor_id: Mapped[str] = mapped_column(ForeignKey("investor_profiles.investor_id"), index=True)
    base_currency: Mapped[str] = mapped_column(String(3), default="USD")
    cash_balance: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(8), default="ACTIVE")
    created_on: Mapped[date] = mapped_column(Date)
    updated_on: Mapped[date] = mapped_column(Date)
    __table_args__ = (CheckConstraint("cash_balance >= 0", name="ck_pf_cash"),
                      CheckConstraint(_in("status", ("ACTIVE", "CLOSED")), name="ck_pf_status"))


class Instrument(Base):
    __tablename__ = "instruments"
    instrument_id: Mapped[str] = mapped_column(String(12), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(12), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    asset_class: Mapped[str] = mapped_column(String(16))
    liquidity_tier: Mapped[str] = mapped_column(String(8))
    restricted: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(8), default="ACTIVE")
    __table_args__ = (CheckConstraint(_in("asset_class", CLASSES), name="ck_ins_class"),
                      CheckConstraint(_in("liquidity_tier", TIERS), name="ck_ins_tier"))


class Holding(Base):
    __tablename__ = "holdings"
    holding_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.portfolio_id"), index=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.instrument_id"), index=True)
    quantity: Mapped[float] = mapped_column(Float)
    updated_on: Mapped[date] = mapped_column(Date)
    __table_args__ = (UniqueConstraint("portfolio_id", "instrument_id", name="uq_holding"),
                      CheckConstraint("quantity >= 0", name="ck_hold_qty"))


class MarketPrice(Base):
    __tablename__ = "market_prices"
    price_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.instrument_id"))
    price_date: Mapped[date] = mapped_column(Date)
    close_price: Mapped[float] = mapped_column(Float)
    __table_args__ = (UniqueConstraint("instrument_id", "price_date", name="uq_price"),
                      CheckConstraint("close_price > 0", name="ck_price_pos"))


class TargetAllocation(Base):
    __tablename__ = "target_allocations"
    target_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.portfolio_id"), index=True)
    asset_class: Mapped[str] = mapped_column(String(16))
    target_weight: Mapped[float] = mapped_column(Float)
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    __table_args__ = (UniqueConstraint("portfolio_id", "asset_class", "effective_from", name="uq_target"),
                      CheckConstraint("target_weight BETWEEN 0 AND 100", name="ck_tw"))


class FeeSchedule(Base):
    __tablename__ = "fee_schedules"
    fee_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tier: Mapped[str] = mapped_column(String(8))
    bps: Mapped[float] = mapped_column(Float)
    min_fee: Mapped[float] = mapped_column(Float)
    effective_from: Mapped[date] = mapped_column(Date)
    __table_args__ = (UniqueConstraint("tier", "effective_from", name="uq_fee"),)


class Constraint(Base):
    __tablename__ = "constraints"
    constraint_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    value: Mapped[str] = mapped_column(String(120))
    scope: Mapped[str] = mapped_column(String(16), default="GLOBAL")
    severity: Mapped[str] = mapped_column(String(8), default="MEDIUM")
    description: Mapped[str] = mapped_column(String(240), default="")
    effective_from: Mapped[date] = mapped_column(Date)


class RebalanceProposal(Base):
    __tablename__ = "rebalance_proposals"
    proposal_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.portfolio_id"), index=True)
    status: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime)
    drift_before: Mapped[float] = mapped_column(Float, default=0)
    drift_after: Mapped[float] = mapped_column(Float, default=0)
    total_fees: Mapped[float] = mapped_column(Float, default=0)
    total_volume: Mapped[float] = mapped_column(Float, default=0)
    approval_level: Mapped[str] = mapped_column(String(10), default="STANDARD")
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    failure_reasons: Mapped[list] = mapped_column(JSON, default=list)
    before_alloc: Mapped[list] = mapped_column(JSON, default=list)
    after_alloc: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = (CheckConstraint(_in("status", STATUSES), name="ck_prop_status"),)


class Trade(Base):
    """Proposal-scoped trade; doubles as the proposal<->instrument mapping (1 proposal : N trades)."""
    __tablename__ = "trades"
    trade_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("rebalance_proposals.proposal_id"), index=True)
    portfolio_id: Mapped[str] = mapped_column(ForeignKey("portfolios.portfolio_id"))
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.instrument_id"))
    side: Mapped[str] = mapped_column(String(4))
    quantity: Mapped[float] = mapped_column(Float)
    price: Mapped[float] = mapped_column(Float)
    notional: Mapped[float] = mapped_column(Float)
    fee: Mapped[float] = mapped_column(Float)
    __table_args__ = (CheckConstraint(_in("side", ("BUY", "SELL")), name="ck_trade_side"),)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    event_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    entity_type: Mapped[str] = mapped_column(String(24))
    entity_id: Mapped[str] = mapped_column(String(64))
    portfolio_id: Mapped[str | None] = mapped_column(String(24), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class ApprovalHistory(Base):
    __tablename__ = "approval_history"
    approval_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("rebalance_proposals.proposal_id"), index=True)
    decision: Mapped[str] = mapped_column(String(10))
    actor: Mapped[str] = mapped_column(String(40))
    role: Mapped[str] = mapped_column(String(10))
    note: Mapped[str | None] = mapped_column(String(240), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime)


for _t in ("audit_events", "approval_history"):  # append-only: history is never overwritten
    for _op in ("UPDATE", "DELETE"):
        event.listen(Base.metadata.tables[_t], "after_create", DDL(
            f"CREATE TRIGGER IF NOT EXISTS {_t}_no_{_op.lower()} BEFORE {_op} ON {_t} "
            f"BEGIN SELECT RAISE(ABORT, '{_t} is append-only'); END;"))
