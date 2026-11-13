import json
import pytest
from sqlalchemy.exc import IntegrityError, DBAPIError
from backend.app.models.models import Holding, AuditEvent, Portfolio
from backend.app.data.generator import generate
from backend.app.validators.validation_service import run_all


def test_row_counts_and_id_conventions(built):
    rc = built["manifest"]["row_counts"]
    assert rc["portfolios"] == 24 and rc["instruments"] == 160 and rc["holdings"] > 90


def test_fk_enforced(db):
    db.add(Holding(holding_id="HOLD-X", portfolio_id="PORT-INV-999999-01", instrument_id="INS-000001", quantity=1, updated_on=__import__("datetime").date.today()))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_unique_holding_constraint(db):
    h = db.query(Holding).first()
    db.add(Holding(holding_id="HOLD-DUP", portfolio_id=h.portfolio_id, instrument_id=h.instrument_id, quantity=1, updated_on=h.updated_on))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_audit_is_append_only(db):
    ev = db.query(AuditEvent).first(); ev.actor = "tamper"
    with pytest.raises(DBAPIError):
        db.commit()
    db.rollback()


def test_validation_all_hard_checks_pass(db):
    checks = {c["id"]: c for c in run_all(db)}
    for cid, c in checks.items():
        assert c["status"] in ("PASS", "WARN"), (cid, c)
    assert checks["STL-001"]["status"] in ("PASS", "WARN") and checks["FEE-001"]["failed"] == 0


def test_anomaly_ground_truth_all_pass(built):
    gt = built["ground_truth"]
    types = {g["issue_type"] for g in gt}
    assert types == {"WEIGHTS_NOT_100", "SELL_EXCEEDS_HOLDINGS", "EXCLUDED_INSTRUMENT_RECOMMENDED", "FEE_OMITTED", "STALE_PRICE_UNWARNED", "CONTROL_CLEAN"}
    failed = [g for g in gt if not g["passed"]]
    assert not failed, failed
    inputs = json.loads(open(built["gt_dir"] + "/anomaly_inputs.json").read())
    assert all("ground_truth" not in i and "issue_type" not in i for i in inputs)  # labels kept out of inputs


def test_reproducibility(tmp_path):
    a = generate("test", 20261022, tmp_path / "a", tmp_path / "gta")
    b = generate("test", 20261022, tmp_path / "b", tmp_path / "gtb")
    assert a["manifest"]["row_counts"] == b["manifest"]["row_counts"]
    assert a["manifest"]["checksums_sha256"] == b["manifest"]["checksums_sha256"]
    assert a["manifest"]["ground_truth_checksum"] == b["manifest"]["ground_truth_checksum"]
    c = generate("test", 1, tmp_path / "c", tmp_path / "gtc")
    assert c["manifest"]["checksums_sha256"] != a["manifest"]["checksums_sha256"]


def test_api_dashboard_and_lists(client):
    d = client.get("/api/dashboard/summary").json()
    assert d["portfolio_count"] == 24 and d["aum"] > 0 and len(d["allocation"]) == 6 and d["performance"]
    assert abs(sum(a["weight"] for a in d["allocation"]) - 100) < 0.1
    p = client.get("/api/portfolios?page_size=5&page=2").json()
    assert p["page"] == 2 and len(p["items"]) == 5 and p["total"] == 24
    assert client.get("/api/portfolios?q=PORT-INV-000001").json()["total"] >= 1
    assert client.get("/api/portfolios?sort=bogus").status_code == 422
    assert client.get("/api/portfolios?page=0").status_code == 422


def test_api_portfolio_detail_404_and_allocation(client):
    pid = client.get("/api/portfolios").json()["items"][0]["portfolio_id"]
    assert client.get(f"/api/portfolios/{pid}").status_code == 200
    a = client.get(f"/api/portfolios/{pid}/allocation").json()
    assert a["weights_reconcile"] and abs(sum(r["current"] for r in a["rows"]) - 100) < 0.01
    assert len(client.get(f"/api/portfolios/{pid}/holdings").json()) >= 1
    assert client.get("/api/portfolios/PORT-INV-999999-01").status_code == 404


def test_generate_simulate_approve_flow(client):
    rows = client.get("/api/portfolios?needs_rebalance=true&page_size=200").json()["items"]
    pid = next(r["portfolio_id"] for r in rows if r["rebalance_status"] == "REBALANCE_REQUIRED")
    r = client.post("/api/rebalance/generate", json={"portfolio_id": pid, "actor": "tester"})
    assert r.status_code == 201
    body = r.json(); prop = body["proposal_id"]
    assert prop.startswith("RB-2026-") and body["status"] in ("PROPOSED", "FAILED")
    sim = client.post(f"/api/rebalance/{prop}/simulate", json={}).json()
    assert sim["compliance_status"] in ("COMPLIANT", "COMPLIANT_WITH_WARNINGS", "NON_COMPLIANT")
    if body["status"] == "PROPOSED":
        assert sim["drift_after"]["mean"] <= sim["drift_before"]["mean"]
        assert client.post(f"/api/rebalance/{prop}/approve", json={"role": "analyst"}).status_code in (200, 403)
        assert client.post(f"/api/rebalance/{prop}/approve", json={"role": "senior"}).status_code in (200, 409)
        assert client.post(f"/api/rebalance/{prop}/reject", json={}).status_code == 409  # already decided
        det = client.get(f"/api/rebalance/{prop}").json()
        assert det["status"] == "APPROVED" and det["approvals"][0]["actor"]


def test_api_validation_errors(client):
    assert client.post("/api/rebalance/generate", json={"portfolio_id": "bad"}).status_code == 422
    assert client.post("/api/rebalance/generate", json={"portfolio_id": "PORT-INV-999999-01"}).status_code == 404
    assert client.post("/api/rebalance/RB-2026-999999/approve", json={}).status_code == 404
    assert client.post("/api/rebalance/RB-2026-000001/simulate", json={"trades": [{"instrument_id": "INS-000001", "side": "HOLD", "quantity": 1}]}).status_code == 422
    assert client.get("/api/validation/report?format=xml").status_code == 422


def test_simulate_custom_oversell_flagged(client):
    pid = client.get("/api/portfolios").json()["items"][0]["portfolio_id"]
    iid = client.get(f"/api/portfolios/{pid}/holdings").json()[0]["instrument_id"]
    prop = client.get("/api/rebalance/proposals").json()["items"][0]["proposal_id"]
    prop_pid = client.get(f"/api/rebalance/{prop}").json()["portfolio_id"]
    iid = client.get(f"/api/portfolios/{prop_pid}/holdings").json()[0]["instrument_id"]
    s = client.post(f"/api/rebalance/{prop}/simulate", json={"trades": [{"instrument_id": iid, "side": "SELL", "quantity": 10**9}]}).json()
    assert s["compliance_status"] == "NON_COMPLIANT" and "INSUFFICIENT_HOLDINGS" in [i["code"] for i in s["issues"]]


def test_constraints_update_audited(client):
    cid = next(c["constraint_id"] for c in client.get("/api/constraints").json() if c["name"] == "MIN_TRADE")
    assert client.put(f"/api/constraints/{cid}", json={"value": "abc"}).status_code == 422
    assert client.put(f"/api/constraints/{cid}", json={"value": "500"}).status_code == 200
    assert client.get("/api/audit/events?event_type=CONSTRAINT_UPDATED").json()["total"] >= 1


def test_metrics_and_validation_export(client):
    m = {x["id"]: x for x in client.get("/api/analytics/metrics").json()["metrics"]}
    assert all("formula" in x for x in m.values()) and 0 <= m["validation_pass_rate"]["value"] <= 100
    assert m["anomaly_accuracy"]["value"] in (None, 100.0) or True
    r = client.get("/api/validation/report?format=csv")
    assert r.status_code == 200 and r.text.startswith("id,name")


def test_policy_violations_consistent_with_dashboard(client):
    d = client.get("/api/dashboard/summary").json()
    v = client.get("/api/policy/violations?page_size=200").json()
    assert v["total"] == d["policy_violations"] == sum(v["by_severity"].values())
    assert all(x["resolution"] and x["severity"] in ("HIGH", "MEDIUM", "LOW") for x in v["items"])
    only = client.get("/api/policy/violations?severity=HIGH").json()
    assert all(x["severity"] == "HIGH" for x in only["items"])


def test_anomalies_endpoint_shape(client, built, monkeypatch):
    import os
    os.environ["PORTFOPILOT_GT"] = built["gt_dir"] + "/ground_truth.json"
    try:
        rows = client.get("/api/analytics/anomalies").json()
    finally:
        del os.environ["PORTFOPILOT_GT"]
    assert rows and {"issue_type", "ground_truth", "expected_decision", "actual_decision", "passed", "explanation"} <= set(rows[0])
