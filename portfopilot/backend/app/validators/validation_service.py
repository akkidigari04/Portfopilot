import re
from sqlalchemy import text
from backend.app.engines.rebalance import calc_fee, WEIGHT_TOL
from backend.app.services.portfolio_service import load_fees, load_policy, latest_as_of

PKS = [("investor_profiles", "investor_id"), ("portfolios", "portfolio_id"), ("instruments", "instrument_id"),
       ("holdings", "holding_id"), ("rebalance_proposals", "proposal_id"), ("trades", "trade_id"),
       ("constraints", "constraint_id"), ("market_prices", "price_id"), ("target_allocations", "target_id")]
FKS = [("portfolios", "investor_id", "investor_profiles", "investor_id"), ("holdings", "portfolio_id", "portfolios", "portfolio_id"),
       ("holdings", "instrument_id", "instruments", "instrument_id"), ("market_prices", "instrument_id", "instruments", "instrument_id"),
       ("target_allocations", "portfolio_id", "portfolios", "portfolio_id"), ("rebalance_proposals", "portfolio_id", "portfolios", "portfolio_id"),
       ("trades", "proposal_id", "rebalance_proposals", "proposal_id"), ("trades", "instrument_id", "instruments", "instrument_id"),
       ("approval_history", "proposal_id", "rebalance_proposals", "proposal_id")]
ID_RULES = [("investor_profiles", "investor_id", r"^INV-\d{6}$"), ("portfolios", "portfolio_id", r"^PORT-INV-\d{6}-\d{2}$"),
            ("instruments", "instrument_id", r"^INS-\d{6}$"), ("holdings", "holding_id", r"^HOLD-PORT-INV-\d{6}-\d{2}-INS-\d{6}$"),
            ("rebalance_proposals", "proposal_id", r"^RB-\d{4}-\d{6}$")]


def run_all(db):
    q = lambda s, **p: db.execute(text(s), p).scalar() or 0
    checks = []

    def add(cid, name, cat, failed, checked, detail, warn=False):
        st = "PASS" if failed == 0 else ("WARN" if warn else "FAIL")
        checks.append({"id": cid, "name": name, "category": cat, "status": st, "checked": int(checked), "failed": int(failed), "detail": detail})

    f = sum(q(f"SELECT COUNT(*)-COUNT(DISTINCT {c}) FROM {t}") for t, c in PKS)
    add("PK-001", "Primary key uniqueness", "Keys", f, sum(q(f"SELECT COUNT(*) FROM {t}") for t, _ in PKS), f"{len(PKS)} tables checked")
    bad = [(c, p) for c, col, p, pc in FKS if q(f"SELECT COUNT(*) FROM {c} x LEFT JOIN {p} y ON x.{col}=y.{pc} WHERE y.{pc} IS NULL AND x.{col} IS NOT NULL")]
    add("FK-001", "Foreign key integrity (no orphans)", "Keys", len(bad), len(FKS), f"Orphans in: {bad}" if bad else f"{len(FKS)} relationships checked")
    mv = (q("SELECT COUNT(*) FROM investor_profiles WHERE TRIM(full_name)=''") + q("SELECT COUNT(*) FROM instruments WHERE TRIM(name)='' OR TRIM(symbol)=''")
          + q("SELECT COUNT(*) FROM holdings WHERE quantity IS NULL") + q("SELECT COUNT(*) FROM market_prices WHERE close_price IS NULL"))
    add("MV-001", "Missing / blank required values", "Completeness", mv, q("SELECT COUNT(*) FROM holdings"), "Names, symbols, quantities, prices")
    dup = (q("SELECT COUNT(*) FROM (SELECT 1 FROM holdings GROUP BY portfolio_id, instrument_id HAVING COUNT(*)>1)") +
           q("SELECT COUNT(*) FROM (SELECT 1 FROM instruments GROUP BY symbol HAVING COUNT(*)>1)") +
           q("SELECT COUNT(*) FROM (SELECT 1 FROM market_prices GROUP BY instrument_id, price_date HAVING COUNT(*)>1)"))
    add("DUP-001", "Duplicate records", "Uniqueness", dup, q("SELECT COUNT(*) FROM holdings"), "Holdings, symbols, daily prices")
    wr = q("SELECT COUNT(*) FROM portfolios p LEFT JOIN (SELECT portfolio_id, SUM(target_weight) s FROM target_allocations WHERE effective_to IS NULL "
           "GROUP BY portfolio_id) t ON t.portfolio_id=p.portfolio_id WHERE t.s IS NULL OR ABS(t.s-100)>:tol", tol=WEIGHT_TOL)
    add("WR-001", f"Target weights reconcile to 100% (±{WEIGHT_TOL}pp)", "Reconciliation", wr, q("SELECT COUNT(*) FROM portfolios"), "Active targets per portfolio")
    iq = q("SELECT COUNT(*) FROM trades WHERE quantity<=0 OR quantity != CAST(quantity AS INTEGER)")
    add("QTY-001", "Trade quantities positive whole numbers", "Trades", iq, q("SELECT COUNT(*) FROM trades"), "")
    ov = q("SELECT COUNT(*) FROM trades t JOIN rebalance_proposals p ON p.proposal_id=t.proposal_id LEFT JOIN holdings h ON h.portfolio_id=t.portfolio_id "
           "AND h.instrument_id=t.instrument_id WHERE p.status='PROPOSED' AND t.side='SELL' AND t.quantity > COALESCE(h.quantity,0)")
    add("QTY-002", "Pending sells within available holdings", "Trades", ov, q("SELECT COUNT(*) FROM trades t JOIN rebalance_proposals p ON p.proposal_id=t.proposal_id WHERE p.status='PROPOSED' AND t.side='SELL'"), "")
    rs = q("SELECT COUNT(*) FROM trades t JOIN instruments i ON i.instrument_id=t.instrument_id JOIN rebalance_proposals p ON p.proposal_id=t.proposal_id WHERE i.restricted=1 AND p.status!='FAILED'")
    add("RST-001", "No restricted instruments in live proposals", "Trades", rs, q("SELECT COUNT(*) FROM trades"), "")
    pol = load_policy(db); as_of = latest_as_of(db)
    st = q("SELECT COUNT(DISTINCT h.instrument_id) FROM holdings h JOIN (SELECT instrument_id, MAX(price_date) d FROM market_prices GROUP BY instrument_id) m "
           "ON m.instrument_id=h.instrument_id WHERE julianday(:a)-julianday(m.d)>:n", a=str(as_of), n=pol["stale_days"])
    ms = q("SELECT COUNT(DISTINCT h.instrument_id) FROM holdings h WHERE NOT EXISTS (SELECT 1 FROM market_prices m WHERE m.instrument_id=h.instrument_id)")
    add("STL-001", "Held instruments with stale or missing prices", "Market data", st + ms, q("SELECT COUNT(DISTINCT instrument_id) FROM holdings"),
        f"{st} stale (>{pol['stale_days']}d), {ms} missing; surfaced as warnings per policy", warn=True)
    fees, mism, rows = load_fees(db), 0, db.execute(text("SELECT t.notional, t.fee, i.liquidity_tier FROM trades t JOIN instruments i ON i.instrument_id=t.instrument_id")).all()
    for n, fee, tier in rows:
        mism += abs(calc_fee(n, tier, fees) - fee) > 0.01
    add("FEE-001", "Fees match fee schedule", "Trades", mism, len(rows), "Recomputed from tier bps and minimum fee")
    lf = (q("SELECT COUNT(*) FROM rebalance_proposals p WHERE p.status IN ('APPROVED','REJECTED') AND NOT EXISTS (SELECT 1 FROM approval_history a WHERE a.proposal_id=p.proposal_id)") +
          q("SELECT COUNT(*) FROM rebalance_proposals p WHERE p.status IN ('PROPOSED','FAILED') AND EXISTS (SELECT 1 FROM approval_history a WHERE a.proposal_id=p.proposal_id)") +
          q("SELECT COUNT(*) FROM approval_history a JOIN rebalance_proposals p ON p.proposal_id=a.proposal_id WHERE a.decided_at < p.created_at"))
    add("LIF-001", "Proposal lifecycle consistency", "Lifecycle", lf, q("SELECT COUNT(*) FROM rebalance_proposals"), "Status vs approval history, decision after creation")
    badid = 0; n_ids = 0
    for t, c, rx in ID_RULES:
        for (v,) in db.execute(text(f"SELECT {c} FROM {t}")):
            n_ids += 1; badid += not re.match(rx, v)
    add("ID-001", "ID convention compliance", "Keys", badid, n_ids, "INV-/PORT-/INS-/HOLD-/RB- patterns")
    return checks
