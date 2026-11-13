from datetime import date
import numpy as np
import pandas as pd
from sqlalchemy import text, bindparam
from backend.app.models.models import (Portfolio, InvestorProfile, Holding, TargetAllocation, Instrument,
                                        Constraint, FeeSchedule)
from backend.app.engines.rebalance import (CLASSES, ALL_CLASSES, LIQ_RANK, WEIGHT_TOL, DEFAULT_POLICY,
                                           DEFAULT_FEES, merged_policy)


def _d(v):
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def latest_as_of(db):
    return _d(db.execute(text("SELECT MAX(price_date) FROM market_prices")).scalar())


def load_policy(db):
    pol = merged_policy(); rbb = {}
    for c in db.query(Constraint).all():
        n, v = c.name, c.value
        if n in ("MAX_DRIFT", "MIN_TRADE", "MAX_FEE_PCT", "MIN_CASH_PCT"):
            pol[n.lower()] = float(v)
        elif n == "STALE_DAYS":
            pol["stale_days"] = int(float(v))
        elif n == "STALE_POLICY":
            pol["stale_policy"] = v
        elif n.startswith("RISK_BLOCKED_BUY_"):
            rbb[n.removeprefix("RISK_BLOCKED_BUY_").title()] = [x for x in v.split("|") if x]
    pol["risk_blocked_buy"] = rbb
    return pol


def load_fees(db):
    fees = {}
    for f in db.query(FeeSchedule).order_by(FeeSchedule.effective_from).all():
        fees[f.tier] = {"bps": f.bps, "min_fee": f.min_fee}
    return fees or DEFAULT_FEES


def load_inputs(db, portfolio_id, as_of=None):
    p = db.get(Portfolio, portfolio_id)
    if p is None:
        raise KeyError(portfolio_id)
    inv = db.get(InvestorProfile, p.investor_id)
    as_of = as_of or latest_as_of(db)
    holdings = {h.instrument_id: h.quantity for h in db.query(Holding).filter(Holding.portfolio_id == portfolio_id)}
    targets = {t.asset_class: t.target_weight for t in db.query(TargetAllocation).filter(
        TargetAllocation.portfolio_id == portfolio_id, TargetAllocation.effective_to.is_(None))}
    instruments, pool = {}, {c: [] for c in CLASSES}
    for i in db.query(Instrument).all():
        d = {"asset_class": i.asset_class, "liquidity_tier": i.liquidity_tier, "restricted": bool(i.restricted),
             "symbol": i.symbol, "name": i.name}
        instruments[i.instrument_id] = d
        if not i.restricted and i.liquidity_tier != "Low":
            pool[i.asset_class].append((LIQ_RANK[i.liquidity_tier], i.instrument_id))
    ids = set(holdings)
    for c in pool:
        ids.update(iid for _, iid in sorted(pool[c])[:10])
    q = text("SELECT m.instrument_id, m.price_date, m.close_price FROM market_prices m JOIN "
             "(SELECT instrument_id, MAX(price_date) d FROM market_prices WHERE instrument_id IN :ids GROUP BY instrument_id) x "
             "ON x.instrument_id=m.instrument_id AND x.d=m.price_date").bindparams(bindparam("ids", expanding=True))
    prices = {r[0]: {"price": float(r[2]), "date": _d(r[1])} for r in db.execute(q, {"ids": list(ids)})}
    return {"portfolio_id": portfolio_id, "risk_category": inv.risk_category, "as_of": as_of, "cash": float(p.cash_balance),
            "holdings": holdings, "targets": targets, "prices": prices,
            "instruments": {i: instruments[i] for i in ids}}


def snapshot_df(db):
    """Vectorised portfolio valuation + drift + violation flags for all portfolios."""
    pol = load_policy(db); conn = db.connection()
    pr = pd.read_sql(text("SELECT m.instrument_id, m.price_date, m.close_price FROM market_prices m JOIN "
                          "(SELECT instrument_id, MAX(price_date) d FROM market_prices GROUP BY instrument_id) x "
                          "ON x.instrument_id=m.instrument_id AND x.d=m.price_date"), conn)
    as_of = pd.to_datetime(pr.price_date).max()
    pr["stale"] = (as_of - pd.to_datetime(pr.price_date)).dt.days > pol["stale_days"]
    h = pd.read_sql(text("SELECT h.portfolio_id,h.instrument_id,h.quantity,i.asset_class,i.restricted FROM holdings h "
                         "JOIN instruments i ON i.instrument_id=h.instrument_id"), conn)
    h = h.merge(pr[["instrument_id", "close_price", "stale"]], on="instrument_id", how="left")
    h["mv"] = (h.quantity * h.close_price).fillna(0.0)
    h["missing"] = h.close_price.isna()
    h["stale"] = h["stale"].fillna(False).astype(bool)
    h["restricted"] = h["restricted"].astype(bool)
    pf = pd.read_sql(text("SELECT p.portfolio_id,p.investor_id,p.cash_balance,p.updated_on,i.risk_category "
                          "FROM portfolios p JOIN investor_profiles i ON i.investor_id=p.investor_id"), conn).set_index("portfolio_id")
    vals = (h.pivot_table(index="portfolio_id", columns="asset_class", values="mv", aggfunc="sum")
            .reindex(pf.index).reindex(columns=CLASSES).fillna(0.0))
    vals["Cash"] = pf.cash_balance
    total = vals.sum(axis=1)
    cur = vals.div(total.replace(0, np.nan), axis=0).mul(100).fillna(0.0)[ALL_CLASSES]
    tg = (pd.read_sql(text("SELECT portfolio_id,asset_class,target_weight FROM target_allocations WHERE effective_to IS NULL"), conn)
          .pivot_table(index="portfolio_id", columns="asset_class", values="target_weight", aggfunc="sum")
          .reindex(pf.index).reindex(columns=ALL_CLASSES).fillna(0.0))
    drift = (cur - tg).abs()
    g = h.groupby("portfolio_id")
    out = pf.copy()
    out["total_value"] = total.round(2)
    out["holdings_count"] = g.size().reindex(pf.index).fillna(0).astype(int)
    out["drift_mean"] = drift.mean(axis=1).round(4)
    out["drift_max"] = drift.max(axis=1).round(4)
    out["restricted_held"] = g["restricted"].sum().reindex(pf.index).fillna(0).astype(int)
    out["stale_held"] = g["stale"].sum().reindex(pf.index).fillna(0).astype(int)
    out["missing_held"] = g["missing"].sum().reindex(pf.index).fillna(0).astype(int)
    out["weights_ok"] = (tg.sum(axis=1) - 100).abs() <= WEIGHT_TOL
    out["needs_rebalance"] = out.drift_max > pol["max_drift"]
    out["violation_count"] = (out.needs_rebalance.astype(int) + (out.restricted_held > 0).astype(int) +
                              (out.stale_held > 0).astype(int) + (out.missing_held > 0).astype(int) +
                              (~out.weights_ok).astype(int))
    out["critical"] = (out.restricted_held > 0) | (~out.weights_ok) | (out.missing_held > 0) | (out.drift_max > 2 * pol["max_drift"])
    return {"out": out, "cur": cur, "tg": tg, "vals": vals, "pol": pol, "h": h}
