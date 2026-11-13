import json, os
from pathlib import Path
from sqlalchemy import text
from backend.app.database.db import ROOT
from backend.app.services.portfolio_service import snapshot_df
from backend.app.validators.validation_service import run_all


def compute(db):
    s = snapshot_df(db)["out"]; q = lambda x: db.execute(text(x)).all()
    props = q("SELECT status, drift_before, drift_after, total_fees, portfolio_id FROM rebalance_proposals")
    live = [p for p in props if p[0] != "FAILED"]; failed = [p for p in props if p[0] == "FAILED"]
    appr = sum(p[0] == "APPROVED" for p in props); rej = sum(p[0] == "REJECTED" for p in props)
    improved = {p[4] for p in live if p[2] < p[1]}; withp = {p[4] for p in live}
    checks = run_all(db); passed = sum(c["status"] == "PASS" for c in checks)
    gt_path = Path(os.getenv("PORTFOPILOT_GT", ROOT / "data/ground_truth/ground_truth.json"))
    gt = json.loads(gt_path.read_text()) if gt_path.exists() else []
    avg = lambda xs: round(sum(xs) / len(xs), 4) if xs else 0.0
    M = lambda id, name, value, unit, formula: {"id": id, "name": name, "value": value, "unit": unit, "formula": formula}
    return [
        M("drift_before", "Avg drift before rebalancing", avg([p[1] for p in live]), "pp", "Mean over non-failed proposals of mean(|current% − target%|) across 6 asset classes, before trades."),
        M("drift_after", "Avg drift after rebalancing", avg([p[2] for p in live]), "pp", "Same measure, recomputed from post-trade holdings, cash and latest valid prices."),
        M("rebalanced_pct", "Portfolios successfully rebalanced", round(len(improved) / len(withp) * 100, 2) if withp else 0.0, "%",
          "Portfolios with ≥1 non-failed proposal whose after-drift < before-drift ÷ portfolios with ≥1 non-failed proposal."),
        M("compliance_rate", "Policy compliance rate", round((s.violation_count == 0).mean() * 100, 2), "%", "Portfolios with zero active policy violations ÷ all portfolios (drift, restricted, stale/missing price, weight reconciliation)."),
        M("violation_count", "Constraint violation count", int(s.violation_count.sum()), "count", "Sum of active violation flags across portfolios."),
        M("proposal_failures", "Failed proposals", len(failed), "count", "Proposals blocked by hard rules; failure reasons are retained on the proposal."),
        M("est_fees", "Estimated transaction fees", round(sum(p[3] for p in live), 2), "USD", "Σ fee over trades of non-failed proposals; fee = max(min_fee, notional × bps/10,000) by liquidity tier."),
        M("acceptance_rate", "Recommendation acceptance rate", round(appr / (appr + rej) * 100, 2) if appr + rej else 0.0, "%", "APPROVED ÷ (APPROVED + REJECTED) proposals."),
        M("validation_pass_rate", "Data validation pass rate", round(passed / len(checks) * 100, 2), "%", "Checks with status PASS ÷ total checks (WARN counts as not passed)."),
        M("anomaly_accuracy", "Anomaly scenario pass rate", round(sum(x["passed"] for x in gt) / len(gt) * 100, 2) if gt else None, "%",
          "Labelled edge cases where actual decision and detection code matched ground truth ÷ all cases (ground_truth.json)."),
    ]
