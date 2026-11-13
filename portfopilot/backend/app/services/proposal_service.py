from datetime import datetime
from sqlalchemy import func
from backend.app.models.models import RebalanceProposal, Trade, ApprovalHistory, Portfolio
from backend.app.engines.rebalance import generate_proposal
from backend.app.services.portfolio_service import load_inputs, load_policy, load_fees
from backend.app.audit.log import log_event

SENIOR_VOLUME = 250_000.0


def next_proposal_id(db):
    n = db.query(func.count(RebalanceProposal.proposal_id)).scalar() + 1
    return f"RB-2026-{n:06d}"


def create_proposal(db, portfolio_id, actor="system", now=None):
    now = now or datetime.utcnow()
    inp = load_inputs(db, portfolio_id)
    res = generate_proposal(inp, load_policy(db), load_fees(db))
    m = res["metrics"]; pid = next_proposal_id(db)
    senior = m["total_volume"] > SENIOR_VOLUME or bool(res["warnings"]) or any(v["severity"] == "HIGH" for v in res["violations"])
    prop = RebalanceProposal(
        proposal_id=pid, portfolio_id=portfolio_id, status=res["status"], created_at=now,
        drift_before=m["drift_before_mean"], drift_after=m["drift_after_mean"], total_fees=m["total_fees"],
        total_volume=m["total_volume"], approval_level="SENIOR" if senior else "STANDARD",
        warnings=res["warnings"], failure_reasons=res["failure_reasons"], before_alloc=res["before"], after_alloc=res["after"])
    db.add(prop); db.flush()
    for n, t in enumerate(res["trades"], 1):
        db.add(Trade(trade_id=f"{pid}-T{n:02d}", proposal_id=pid, portfolio_id=portfolio_id, instrument_id=t["instrument_id"],
                     side=t["side"], quantity=t["quantity"], price=t["price"], notional=t["notional"], fee=t["fee"]))
    log_event(db, "REBALANCE_GENERATED", "proposal", pid, actor, portfolio_id,
              {"status": res["status"], "decision": res["decision"], "trades": len(res["trades"]), "fees": m["total_fees"]}, now)
    if res["trades"]:
        log_event(db, "TRADE_PROPOSED", "proposal", pid, actor, portfolio_id,
                  {"volume": m["total_volume"], "approval_level": prop.approval_level}, now)
    for v in res["violations"]:
        if v["severity"] == "HIGH":
            log_event(db, "POLICY_VIOLATION_DETECTED", "portfolio", portfolio_id, actor, portfolio_id,
                      {"code": v["code"], "message": v["message"], "proposal_id": pid}, now)
    db.commit()
    return prop, res


class DecisionError(Exception):
    def __init__(self, status, msg):
        self.status, self.msg = status, msg


def decide(db, proposal_id, decision, actor="analyst", role="analyst", note=None, now=None):
    now = now or datetime.utcnow()
    prop = db.get(RebalanceProposal, proposal_id)
    if prop is None:
        raise DecisionError(404, f"Proposal {proposal_id} not found")
    if prop.status != "PROPOSED":
        raise DecisionError(409, f"Proposal is {prop.status}; only PROPOSED proposals can be decided")
    if decision == "APPROVED" and prop.approval_level == "SENIOR" and role != "senior":
        raise DecisionError(403, "This proposal requires senior approval")
    prop.status = decision
    db.add(ApprovalHistory(proposal_id=proposal_id, decision=decision, actor=actor, role=role, note=note, decided_at=now))
    log_event(db, "TRADE_APPROVED" if decision == "APPROVED" else "TRADE_REJECTED", "proposal", proposal_id, actor,
              prop.portfolio_id, {"note": note, "role": role}, now)
    db.commit()
    return prop
