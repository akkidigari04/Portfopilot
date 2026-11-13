"""Labelled anomaly scenarios. Inputs (mutations) are kept apart from ground truth labels."""
import copy
import math
from datetime import timedelta
from backend.app.engines.rebalance import (generate_proposal, validate_trades, calc_fee, price_status,
                                           merged_policy)
from backend.app.services.portfolio_service import load_inputs, load_policy, load_fees

SPEC = {  # issue_type -> (ground_truth label, expected decision, expected code)
    "WEIGHTS_NOT_100": ("INVALID", "REJECT", "INVALID_TARGET_WEIGHTS"),
    "SELL_EXCEEDS_HOLDINGS": ("INVALID", "REJECT", "INSUFFICIENT_HOLDINGS"),
    "EXCLUDED_INSTRUMENT_RECOMMENDED": ("INVALID", "REJECT", "RESTRICTED_INSTRUMENT"),
    "FEE_OMITTED": ("INVALID", "REJECT", "FEE_MISMATCH"),
    "STALE_PRICE_UNWARNED": ("WARNING_REQUIRED", "WARN", "STALE_PRICE"),
    "CONTROL_CLEAN": ("VALID", "ACCEPT", None),
}


def is_clean(inp, pol):
    from backend.app.engines.rebalance import target_issues
    return (not target_issues(inp) and all(price_status(inp, i, pol) == "OK" and not inp["instruments"][i]["restricted"]
                                           for i in inp["holdings"]) and len(inp["holdings"]) >= 2)


def build_inputs(db, portfolio_ids, n_per_type):
    """Pick clean portfolios and describe a mutation per case (no labels in this structure)."""
    pol, cases, pool = load_policy(db), [], []
    for pid in portfolio_ids:
        inp = load_inputs(db, pid)
        if is_clean(inp, pol):
            pool.append((pid, inp))
    k = 0
    for itype in SPEC:
        for _ in range(n_per_type):
            if k >= len(pool):
                break
            pid, inp = pool[k]; k += 1
            big = max(inp["holdings"], key=lambda i: inp["holdings"][i] * inp["prices"][i]["price"])
            cand = next(i for i, d in sorted(inp["instruments"].items()) if i not in inp["holdings"] and not d["restricted"]
                        and d["liquidity_tier"] != "Low" and d["asset_class"] not in
                        pol["risk_blocked_buy"].get(inp["risk_category"], []) and i in inp["prices"])
            fees = load_fees(db)

            def trade(iid, side, q):
                px = inp["prices"][iid]["price"]
                return {"instrument_id": iid, "side": side, "quantity": q, "price": px,
                        "notional": round(q * px, 2), "fee": calc_fee(q * px, inp["instruments"][iid]["liquidity_tier"], fees)}
            if itype == "WEIGHTS_NOT_100":
                mut = {"op": "scale_targets", "factor": 0.95}
            elif itype == "SELL_EXCEEDS_HOLDINGS":
                mut = {"op": "inject_trade", "trade": trade(big, "SELL", math.ceil(inp["holdings"][big] * 1.5))}
            elif itype == "EXCLUDED_INSTRUMENT_RECOMMENDED":
                mut = {"op": "inject_trade", "mark_restricted": cand, "trade": trade(cand, "BUY", 5)}
            elif itype == "FEE_OMITTED":
                t = trade(cand, "BUY", 5); t["fee"] = 0.0
                mut = {"op": "inject_trade", "trade": t}
            elif itype == "STALE_PRICE_UNWARNED":
                mut = {"op": "stale_price", "instrument_id": big, "days": 20}
            else:
                mut = {"op": "none"}
            cases.append({"case_id": f"ANOM-{len(cases) + 1:06d}", "portfolio_id": pid, "mutation": mut,
                          "_type": itype})
    return cases


def run_case(db, case):
    inp = load_inputs(db, case["portfolio_id"]); pol, fees = load_policy(db), load_fees(db); m = case["mutation"]
    if m["op"] == "scale_targets":
        inp["targets"] = {k: v * m["factor"] for k, v in inp["targets"].items()}
    elif m["op"] == "stale_price":
        inp["prices"][m["instrument_id"]]["date"] = inp["as_of"] - timedelta(days=m["days"])
    if m["op"] == "inject_trade":
        if m.get("mark_restricted"):
            inp["instruments"][m["mark_restricted"]]["restricted"] = True
        issues = validate_trades(inp, [m["trade"]], pol, fees)
        codes = [i["code"] for i in issues]
        errs = [i for i in issues if i["severity"] == "error"]
        decision = "REJECT" if errs else ("WARN" if issues else "ACCEPT")
    else:
        r = generate_proposal(inp, pol, fees)
        decision = r["decision"]; codes = [x["code"] for x in r["failure_reasons"] + r["warnings"]]
    return decision, codes


def evaluate(db, cases):
    out = []
    for c in cases:
        label, exp_dec, exp_code = SPEC[c["_type"]]
        dec, codes = run_case(db, c)
        ok = dec == exp_dec and (exp_code is None or exp_code in codes)
        why = (f"System returned {dec} with codes {codes or 'none'}; expected {exp_dec}"
               f"{' with ' + exp_code if exp_code else ''}. " + ("PASS." if ok else "FAIL: decision or detection code mismatch."))
        out.append({"case_id": c["case_id"], "portfolio_id": c["portfolio_id"], "issue_type": c["_type"],
                    "ground_truth": label, "expected_decision": exp_dec, "expected_code": exp_code,
                    "actual_decision": dec, "actual_codes": ";".join(codes), "passed": ok, "explanation": why})
    return out
