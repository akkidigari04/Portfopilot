import csv, io
from datetime import datetime
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import text, func
from sqlalchemy.orm import Session
from backend.app.database.db import get_db
from backend.app.models.models import (Portfolio, Instrument, Holding, RebalanceProposal, Trade, Constraint, AuditEvent, ApprovalHistory)
from backend.app.schemas.schemas import GenerateRequest, SimulateRequest, DecisionRequest, ConstraintUpdate, Page
from backend.app.engines import rebalance as E
from backend.app.services import portfolio_service as PS, proposal_service as PR
from backend.app.validators.validation_service import run_all
from backend.app.analytics.metrics import compute
from backend.app.audit.log import log_event

router = APIRouter(prefix="/api")


def paginate(rows, page, size):
    return {"items": rows[(page - 1) * size: page * size], "total": len(rows), "page": page, "page_size": size}


def pg(): return Query(1, ge=1)
def ps_(): return Query(25, ge=1, le=200)


def prop_dict(p, trades=None):
    d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
    d["created_at"] = p.created_at.isoformat()
    if trades is not None:
        d["trades"] = [{c.name: getattr(t, c.name) for c in t.__table__.columns} for t in trades]
    return d


def need_prop(db, pid):
    p = db.get(RebalanceProposal, pid)
    if not p:
        raise HTTPException(404, f"Proposal {pid} not found")
    return p


def need_inp(db, pid):
    try:
        return PS.load_inputs(db, pid)
    except KeyError:
        raise HTTPException(404, f"Portfolio {pid} not found")


@router.get("/dashboard/summary")
def dashboard(start: str | None = None, end: str | None = None, db: Session = Depends(get_db)):
    snap = PS.snapshot_df(db); s = snap["out"]; pol = snap["pol"]
    aum = float(s.total_value.sum())
    where, params = "WHERE 1=1", {}
    if start: where += " AND price_date>=:a"; params["a"] = start
    if end: where += " AND price_date<=:b"; params["b"] = end
    pr = pd.read_sql(text(f"SELECT instrument_id, price_date, close_price FROM market_prices {where}"), db.connection(), params=params)
    h = snap["h"]; qty = h.groupby("instrument_id").quantity.sum()
    perf = []
    if len(pr):
        piv = pr.pivot(index="price_date", columns="instrument_id", values="close_price").sort_index().ffill().bfill()
        cols = piv.columns.intersection(qty.index)
        series = piv[cols].fillna(0).dot(qty[cols]) + float(s.cash_balance.sum())
        base = series.iloc[0]
        perf = [{"date": d, "aum": round(float(v), 2), "indexed": round(float(v / base * 100), 3)} for d, v in series.items()]
    vals = snap["vals"].sum(); tg = snap["tg"].mul(s.total_value, axis=0).sum() / max(aum, 1)
    alloc = [{"asset_class": c, "weight": round(float(vals[c] / aum * 100), 2), "target": round(float(tg[c]), 2), "value": round(float(vals[c]), 2)} for c in E.ALL_CLASSES]
    risk = [{"risk_category": r, "portfolios": int(g.shape[0]), "aum": round(float(g.total_value.sum()), 2), "avg_drift": round(float(g.drift_mean.mean()), 3)}
            for r, g in s.groupby("risk_category")]
    fees = db.query(func.coalesce(func.sum(RebalanceProposal.total_fees), 0)).filter(RebalanceProposal.status == "PROPOSED").scalar()
    recent = db.query(AuditEvent).order_by(AuditEvent.event_id.desc()).filter(AuditEvent.event_type.in_(
        ["REBALANCE_GENERATED", "TRADE_APPROVED", "TRADE_REJECTED", "TRADE_PROPOSED"])).limit(8).all()
    crit = s[s.critical].sort_values("drift_max", ascending=False).head(8)
    return {"aum": round(aum, 2), "portfolio_count": int(len(s)), "avg_drift": round(float(s.drift_mean.mean()), 3),
            "needs_rebalance": int(s.needs_rebalance.sum()), "policy_violations": int(s.violation_count.sum()),
            "estimated_fees_pending": round(float(fees), 2), "risk_distribution": risk, "allocation": alloc, "performance": perf,
            "recent_activity": [{"event_id": e.event_id, "event_type": e.event_type, "entity_id": e.entity_id, "portfolio_id": e.portfolio_id,
                                 "actor": e.actor, "created_at": e.created_at.isoformat()} for e in recent],
            "critical_exceptions": [{"portfolio_id": i, "risk_category": r.risk_category, "drift_max": r.drift_max, "restricted_held": int(r.restricted_held),
                                     "missing_prices": int(r.missing_held), "weights_ok": bool(r.weights_ok)} for i, r in crit.iterrows()],
            "policy": {"max_drift": pol["max_drift"]}}


@router.get("/portfolios")
def portfolios(q: str | None = None, risk: str | None = None, needs_rebalance: bool | None = None,
               sort: str = "portfolio_id", desc: bool = False, page: int = pg(), page_size: int = ps_(), db: Session = Depends(get_db)):
    s = PS.snapshot_df(db)["out"].reset_index()
    if q: s = s[s.portfolio_id.str.contains(q, case=False) | s.investor_id.str.contains(q, case=False)]
    if risk: s = s[s.risk_category == risk]
    if needs_rebalance is not None: s = s[s.needs_rebalance == needs_rebalance]
    if sort not in s.columns: raise HTTPException(422, f"Cannot sort by {sort}")
    s = s.sort_values(sort, ascending=not desc)
    last = dict(db.execute(text("SELECT portfolio_id, status FROM rebalance_proposals WHERE proposal_id IN (SELECT MAX(proposal_id) FROM rebalance_proposals GROUP BY portfolio_id)")).all())
    rows = [{"portfolio_id": r.portfolio_id, "investor_id": r.investor_id, "risk_category": r.risk_category, "total_value": r.total_value,
             "holdings_count": int(r.holdings_count), "drift_mean": r.drift_mean, "drift_max": r.drift_max, "violation_count": int(r.violation_count),
             "rebalance_status": last.get(r.portfolio_id) or ("REBALANCE_REQUIRED" if r.needs_rebalance else "IN_TOLERANCE"),
             "needs_rebalance": bool(r.needs_rebalance), "updated_on": str(r.updated_on)} for r in s.itertuples()]
    return paginate(rows, page, page_size)


def holdings_rows(inp, pol):
    tot = E.total_value(inp); rows = []
    for iid, q in sorted(inp["holdings"].items()):
        ins = inp["instruments"][iid]; p = inp["prices"].get(iid); mv = q * p["price"] if p else 0.0
        rows.append({"instrument_id": iid, "symbol": ins["symbol"], "name": ins["name"], "asset_class": ins["asset_class"], "liquidity_tier": ins["liquidity_tier"],
                     "restricted": ins["restricted"], "quantity": q, "price": p["price"] if p else None, "price_date": str(p["date"]) if p else None,
                     "price_status": E.price_status(inp, iid, pol), "market_value": round(mv, 2), "weight": round(mv / tot * 100, 3) if tot else 0})
    return rows


@router.get("/portfolios/{portfolio_id}")
def portfolio_detail(portfolio_id: str, db: Session = Depends(get_db)):
    inp = need_inp(db, portfolio_id); pol = PS.load_policy(db); rows = holdings_rows(inp, pol)
    w = [r["weight"] / 100 for r in rows]
    hhi = round(sum(x * x for x in w), 4)
    evs = db.query(AuditEvent).filter(AuditEvent.portfolio_id == portfolio_id).order_by(AuditEvent.event_id.desc()).limit(15).all()
    props = db.query(RebalanceProposal).filter_by(portfolio_id=portfolio_id).order_by(RebalanceProposal.created_at.desc()).limit(10).all()
    p = db.get(Portfolio, portfolio_id)
    return {"portfolio_id": portfolio_id, "investor_id": p.investor_id, "risk_category": inp["risk_category"], "cash": inp["cash"],
            "total_value": round(E.total_value(inp), 2), "as_of": str(inp["as_of"]), "drift": E.drift_table(inp), "drift_summary": E.drift_summary(E.drift_table(inp)),
            "concentration": {"hhi": hhi, "top_holding_pct": max([r["weight"] for r in rows], default=0), "holdings": len(rows)},
            "price_issues": [r for r in rows if r["price_status"] != "OK"], "violations": E.policy_violations(inp, pol),
            "holdings": rows, "proposals": [prop_dict(x) for x in props],
            "history": [{"event_type": e.event_type, "actor": e.actor, "created_at": e.created_at.isoformat(), "payload": e.payload} for e in evs]}


@router.get("/portfolios/{portfolio_id}/holdings")
def portfolio_holdings(portfolio_id: str, db: Session = Depends(get_db)):
    return holdings_rows(need_inp(db, portfolio_id), PS.load_policy(db))


@router.get("/portfolios/{portfolio_id}/allocation")
def portfolio_allocation(portfolio_id: str, db: Session = Depends(get_db)):
    inp = need_inp(db, portfolio_id); rows = E.drift_table(inp)
    return {"portfolio_id": portfolio_id, "rows": rows, "summary": E.drift_summary(rows), "target_sum": sum(inp["targets"].values()),
            "weights_reconcile": not E.target_issues(inp)}


@router.post("/rebalance/generate", status_code=201)
def generate(body: GenerateRequest, db: Session = Depends(get_db)):
    need_inp(db, body.portfolio_id)
    prop, res = PR.create_proposal(db, body.portfolio_id, body.actor)
    return {**prop_dict(prop, db.query(Trade).filter_by(proposal_id=prop.proposal_id).all()), "decision": res["decision"],
            "notes": res["notes"], "skipped": res["skipped"], "metrics": res["metrics"], "violations": res["violations"]}


@router.get("/rebalance/proposals")
def proposals(status: str | None = None, portfolio_id: str | None = None, page: int = pg(), page_size: int = ps_(), db: Session = Depends(get_db)):
    qy = db.query(RebalanceProposal)
    if status: qy = qy.filter(RebalanceProposal.status == status.upper())
    if portfolio_id: qy = qy.filter(RebalanceProposal.portfolio_id == portfolio_id)
    total = qy.count(); items = qy.order_by(RebalanceProposal.proposal_id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [prop_dict(p) for p in items], "total": total, "page": page, "page_size": page_size}


@router.get("/rebalance/{proposal_id}")
def proposal_detail(proposal_id: str, db: Session = Depends(get_db)):
    p = need_prop(db, proposal_id)
    ap = db.query(ApprovalHistory).filter_by(proposal_id=proposal_id).all()
    return {**prop_dict(p, db.query(Trade).filter_by(proposal_id=proposal_id).all()),
            "approvals": [{"decision": a.decision, "actor": a.actor, "role": a.role, "note": a.note, "decided_at": a.decided_at.isoformat()} for a in ap]}


@router.post("/rebalance/{proposal_id}/simulate")
def simulate(proposal_id: str, body: SimulateRequest | None = None, db: Session = Depends(get_db)):
    p = need_prop(db, proposal_id); inp = need_inp(db, p.portfolio_id); pol, fees = PS.load_policy(db), PS.load_fees(db)
    src = body.trades if body and body.trades else [Trade_ for Trade_ in db.query(Trade).filter_by(proposal_id=proposal_id)]
    trades = []
    for t in src:
        px = inp["prices"].get(t.instrument_id, {}).get("price", 0.0); ins = inp["instruments"].get(t.instrument_id)
        n = round(t.quantity * px, 2)
        trades.append({"instrument_id": t.instrument_id, "side": t.side, "quantity": t.quantity, "price": px, "notional": n,
                       "fee": E.calc_fee(t.quantity * px, ins["liquidity_tier"], fees) if ins else 0.0})
    issues = E.validate_trades(inp, trades, pol, fees); errors = [i for i in issues if i["severity"] == "error"]
    after = E.apply_trades(inp, trades); b, a = E.drift_table(inp), E.drift_table(after)
    sb, sa = E.drift_summary(b), E.drift_summary(a)
    status = "NON_COMPLIANT" if errors else ("COMPLIANT_WITH_WARNINGS" if issues or sa["max"] > pol["max_drift"] else "COMPLIANT")
    log_event(db, "SIMULATION_RUN", "proposal", proposal_id, "analyst", p.portfolio_id, {"status": status, "custom": bool(body and body.trades)}); db.commit()
    return {"proposal_id": proposal_id, "before": b, "after": a, "trades": trades, "issues": issues, "compliance_status": status,
            "total_volume": round(sum(t["notional"] for t in trades), 2), "total_fees": round(sum(t["fee"] for t in trades), 2),
            "cash_remaining": after["cash"], "drift_before": sb, "drift_after": sa,
            "effectiveness_pct": round((sb["mean"] - sa["mean"]) / sb["mean"] * 100, 2) if sb["mean"] else 0.0}


def _decide(db, pid, decision, body):
    try:
        p = PR.decide(db, pid, decision, body.actor, body.role, body.note)
    except PR.DecisionError as e:
        raise HTTPException(e.status, e.msg)
    return prop_dict(p)


@router.post("/rebalance/{proposal_id}/approve")
def approve(proposal_id: str, body: DecisionRequest = DecisionRequest(), db: Session = Depends(get_db)):
    return _decide(db, proposal_id, "APPROVED", body)


@router.post("/rebalance/{proposal_id}/reject")
def reject(proposal_id: str, body: DecisionRequest = DecisionRequest(), db: Session = Depends(get_db)):
    return _decide(db, proposal_id, "REJECTED", body)


@router.get("/constraints")
def constraints(db: Session = Depends(get_db)):
    return [{c.name: getattr(r, c.name) for c in r.__table__.columns} | {"effective_from": str(r.effective_from)} for r in db.query(Constraint).order_by(Constraint.constraint_id)]


@router.put("/constraints/{constraint_id}")
def update_constraint(constraint_id: str, body: ConstraintUpdate, db: Session = Depends(get_db)):
    c = db.get(Constraint, constraint_id)
    if not c: raise HTTPException(404, "Constraint not found")
    try:
        if c.name == "STALE_POLICY":
            assert body.value in ("WARN", "BLOCK")
        elif not c.name.startswith("RISK_"):
            assert float(body.value) >= 0
    except (ValueError, AssertionError):
        raise HTTPException(422, f"Invalid value for {c.name}")
    old, c.value = c.value, body.value
    log_event(db, "CONSTRAINT_UPDATED", "constraint", constraint_id, body.actor, None, {"name": c.name, "old": old, "new": body.value}); db.commit()
    return {"constraint_id": constraint_id, "name": c.name, "old": old, "new": body.value}


@router.get("/audit/events")
def audit(event_type: str | None = None, portfolio_id: str | None = None, page: int = pg(), page_size: int = ps_(), db: Session = Depends(get_db)):
    qy = db.query(AuditEvent)
    if event_type: qy = qy.filter(AuditEvent.event_type == event_type)
    if portfolio_id: qy = qy.filter(AuditEvent.portfolio_id == portfolio_id)
    total = qy.count(); items = qy.order_by(AuditEvent.event_id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [{"event_id": e.event_id, "event_type": e.event_type, "entity_type": e.entity_type, "entity_id": e.entity_id, "portfolio_id": e.portfolio_id,
                       "actor": e.actor, "payload": e.payload, "created_at": e.created_at.isoformat()} for e in items], "total": total, "page": page, "page_size": page_size}


@router.get("/validation/report")
def validation(format: str = Query("json", pattern="^(json|csv)$"), db: Session = Depends(get_db)):
    checks = run_all(db)
    if format == "csv":
        buf = io.StringIO(); w = csv.DictWriter(buf, fieldnames=list(checks[0])); w.writeheader(); w.writerows(checks)
        return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=validation_report.csv"})
    return {"checks": checks, "pass_rate": round(sum(c["status"] == "PASS" for c in checks) / len(checks) * 100, 2),
            "generated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/analytics/metrics")
def metrics(db: Session = Depends(get_db)):
    return {"metrics": compute(db)}


@router.get("/policy/violations")
def policy_violations(severity: str | None = None, code: str | None = None, page: int = pg(), page_size: int = ps_(), db: Session = Depends(get_db)):
    """One row per active violation flag per portfolio (same flags that feed dashboard + compliance metrics)."""
    snap = PS.snapshot_df(db); s, pol, cur, tg = snap["out"], snap["pol"], snap["cur"], snap["tg"]; rows = []
    for pid, r in s.iterrows():
        base = {"portfolio_id": pid, "risk_category": r.risk_category}
        if r.needs_rebalance:
            worst = (cur.loc[pid] - tg.loc[pid]).abs().idxmax(); d = float(cur.loc[pid, worst] - tg.loc[pid, worst])
            sev = "HIGH" if abs(d) > 2 * pol["max_drift"] else "MEDIUM"
            rows.append({**base, "code": "MAX_DRIFT_BREACH", "severity": sev, "message": f"{worst} drift {d:+.2f}pp exceeds ±{pol['max_drift']}pp.",
                         "resolution": "Generate and review a rebalance proposal.", "approval_required": sev == "HIGH"})
        if r.restricted_held:
            rows.append({**base, "code": "RESTRICTED_HOLDING", "severity": "HIGH", "message": f"{int(r.restricted_held)} restricted instrument(s) held.",
                         "resolution": "Escalate to compliance for sell-down review.", "approval_required": True})
        if r.missing_held:
            rows.append({**base, "code": "MISSING_PRICE", "severity": "HIGH", "message": f"{int(r.missing_held)} held instrument(s) have no market price.",
                         "resolution": "Source a valid price before trading.", "approval_required": True})
        if r.stale_held:
            rows.append({**base, "code": "STALE_PRICE", "severity": "MEDIUM", "message": f"{int(r.stale_held)} held instrument(s) priced beyond {pol['stale_days']} days.",
                         "resolution": "Refresh market data before trading.", "approval_required": False})
        if not r.weights_ok:
            rows.append({**base, "code": "INVALID_TARGET_WEIGHTS", "severity": "HIGH", "message": "Target weights do not reconcile to 100%.",
                         "resolution": "Correct the target allocation.", "approval_required": True})
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    rows.sort(key=lambda x: (order[x["severity"]], x["portfolio_id"], x["code"]))
    by_sev, by_code = {}, {}
    for x in rows:
        by_sev[x["severity"]] = by_sev.get(x["severity"], 0) + 1; by_code[x["code"]] = by_code.get(x["code"], 0) + 1
    if severity: rows = [x for x in rows if x["severity"] == severity.upper()]
    if code: rows = [x for x in rows if x["code"] == code.upper()]
    return {**paginate(rows, page, page_size), "by_severity": by_sev, "by_code": by_code}


@router.get("/analytics/anomalies")
def anomalies():
    import json, os
    from pathlib import Path
    from backend.app.database.db import ROOT
    p = Path(os.getenv("PORTFOPILOT_GT", ROOT / "data/ground_truth/ground_truth.json"))
    return json.loads(p.read_text()) if p.exists() else []
