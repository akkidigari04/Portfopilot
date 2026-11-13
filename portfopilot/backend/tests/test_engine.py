import copy
from datetime import date
import pytest
from backend.app.engines import rebalance as E
from backend.tests.conftest import make_inp


def test_allocation_and_drift():
    inp = make_inp()  # equity 60k, FI 30k, cash 10k => total 100k
    a = E.allocation(inp)
    assert a["Equity"] == pytest.approx(60.0) and a["Fixed Income"] == pytest.approx(30.0) and a["Cash"] == pytest.approx(10.0)
    rows = {r["asset_class"]: r for r in E.drift_table(inp)}
    assert rows["Equity"]["drift"] == pytest.approx(10.0) and rows["Fixed Income"]["drift"] == pytest.approx(-10.0)
    assert sum(a.values()) == pytest.approx(100.0)


def test_buy_sell_directions_and_reduced_drift():
    r = E.generate_proposal(make_inp())
    assert r["status"] == "PROPOSED" and r["decision"] == "ACCEPT"
    sides = {t["instrument_id"]: t["side"] for t in r["trades"]}
    assert sides["INS-000001"] == "SELL" and "BUY" in sides.values()
    assert r["metrics"]["drift_after_mean"] < r["metrics"]["drift_before_mean"]
    assert r["metrics"]["effectiveness_pct"] > 50


def test_post_trade_reconciliation():
    inp = make_inp(); r = E.generate_proposal(inp); after = E.apply_trades(inp, r["trades"])
    assert sum(E.allocation(after).values()) == pytest.approx(100.0)
    assert after["cash"] >= 0 and all(q >= 0 for q in after["holdings"].values())
    # value conserved except for fees
    assert E.total_value(inp) - E.total_value(after) == pytest.approx(r["metrics"]["total_fees"], abs=0.5)


def test_minimum_trade_threshold_and_boundary():
    inp = make_inp(targets={"Equity": 59.9, "Fixed Income": 30.1, "Real Estate": 0, "Commodities": 0, "Alternatives": 0, "Cash": 10.0})
    r = E.generate_proposal(inp)  # deltas are ~$100 < $500
    assert r["trades"] == [] and any("NO_TRADES" in n for n in r["notes"])
    exact = E.generate_proposal(make_inp(), {"min_trade": 10_000.0})  # delta is exactly 10,000 => not below threshold
    assert any(t["side"] == "SELL" for t in exact["trades"])


def test_restricted_never_traded():
    inp = make_inp(); inp["instruments"]["INS-000001"]["restricted"] = True
    inp["instruments"]["INS-000003"]["restricted"] = True
    r = E.generate_proposal(inp)
    assert all(t["instrument_id"] not in ("INS-000001", "INS-000003") for t in r["trades"])
    assert any("tradable" in n for n in r["notes"])
    assert any(v["code"] == "RESTRICTED_HOLDING" for v in r["violations"])


def test_fee_calculation():
    assert E.calc_fee(10_000, "High") == 5.0 and E.calc_fee(100, "High") == 1.0  # minimum fee floor
    assert E.calc_fee(10_000, "Low") == 25.0 and E.calc_fee(10_000, "Medium") == 12.0
    r = E.generate_proposal(make_inp())
    assert all(t["fee"] == E.calc_fee(t["notional"], "High") for t in r["trades"])


def test_stale_price_warn_and_block():
    inp = make_inp(); inp["prices"]["INS-000001"]["date"] = date(2026, 10, 1)
    w = E.generate_proposal(inp)
    assert w["decision"] == "WARN" and w["warnings"][0]["code"] == "STALE_PRICE"
    assert all(t["instrument_id"] != "INS-000001" for t in w["trades"])
    b = E.generate_proposal(inp, {"stale_policy": "BLOCK"})
    assert b["status"] == "FAILED" and b["failure_reasons"][0]["code"] == "STALE_PRICE_BLOCK"


def test_missing_price_fails():
    inp = make_inp(); del inp["prices"]["INS-000002"]
    assert E.generate_proposal(inp)["failure_reasons"][0]["code"] == "MISSING_PRICE"


@pytest.mark.parametrize("fx,ok", [(100.005, True), (100.0, True), (100.02, False), (95.0, False)])
def test_weight_tolerance_boundary(fx, ok):
    inp = make_inp(); inp["targets"]["Cash"] = 10.0 + (fx - 100.0)
    r = E.generate_proposal(inp)
    assert (r["status"] != "FAILED") == ok
    if not ok:
        assert r["failure_reasons"][0]["code"] == "INVALID_TARGET_WEIGHTS" and r["trades"] == []


def test_insufficient_holdings_and_negative_quantity():
    inp = make_inp(); fees = E.DEFAULT_FEES
    t = {"instrument_id": "INS-000001", "side": "SELL", "quantity": 601, "price": 100.0, "notional": 60100.0, "fee": E.calc_fee(60100, "High")}
    assert "INSUFFICIENT_HOLDINGS" in [i["code"] for i in E.validate_trades(inp, [t])]
    t2 = {**t, "quantity": -5}
    assert "INVALID_QUANTITY" in [i["code"] for i in E.validate_trades(inp, [t2])]
    t3 = {**t, "quantity": 1.5}
    assert "INVALID_QUANTITY" in [i["code"] for i in E.validate_trades(inp, [t3])]


def test_fee_omitted_and_cash_checks():
    inp = make_inp()
    t = {"instrument_id": "INS-000003", "side": "BUY", "quantity": 10, "price": 100.0, "notional": 1000.0, "fee": 0.0}
    assert "FEE_MISMATCH" in [i["code"] for i in E.validate_trades(inp, [t])]
    big = {**t, "quantity": 1000, "notional": 100000.0, "fee": E.calc_fee(100000, "High")}
    assert "INSUFFICIENT_CASH" in [i["code"] for i in E.validate_trades(inp, [big])]


def test_risk_category_and_liquidity_restrictions():
    inp = make_inp(risk_category="Conservative"); inp["instruments"]["INS-000003"]["asset_class"] = "Alternatives"
    t = {"instrument_id": "INS-000003", "side": "BUY", "quantity": 5, "price": 100.0, "notional": 500.0, "fee": 1.0}
    assert "RISK_CATEGORY_RESTRICTION" in [i["code"] for i in E.validate_trades(inp, [t])]
    inp2 = make_inp(); inp2["instruments"]["INS-000003"]["liquidity_tier"] = "Low"
    assert "LIQUIDITY_RESTRICTION" in [i["code"] for i in E.validate_trades(inp2, [{**t, "fee": 5.0}])]


def test_liquidity_sell_cap():
    inp = make_inp(); inp["instruments"]["INS-000001"]["liquidity_tier"] = "Low"
    r = E.generate_proposal(inp)
    sold = sum(t["quantity"] for t in r["trades"] if t["instrument_id"] == "INS-000001")
    assert sold <= 600 * 0.25


def test_determinism():
    a = E.generate_proposal(make_inp()); b = E.generate_proposal(copy.deepcopy(make_inp()))
    assert a == b
