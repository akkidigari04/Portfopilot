"""Deterministic, rule-based rebalancing engine. Pure functions: no DB, no randomness, no clock.

Input snapshot ("inp"):
  portfolio_id, risk_category, as_of(date), cash(float), holdings{iid: qty},
  targets{asset_class: pct}, instruments{iid: {asset_class, liquidity_tier, restricted, ...}},
  prices{iid: {price, date}}
"""
import copy
import math

CLASSES = ["Equity", "Fixed Income", "Real Estate", "Commodities", "Alternatives"]
ALL_CLASSES = CLASSES + ["Cash"]
LIQ_RANK = {"High": 0, "Medium": 1, "Low": 2}
SELL_CAP = {"High": 1.0, "Medium": 0.75, "Low": 0.25}   # max fraction of a position sellable per proposal
WEIGHT_TOL = 0.01                                        # percentage points
DEFAULT_POLICY = {"max_drift": 5.0, "min_trade": 500.0, "max_fee_pct": 0.5, "min_cash_pct": 1.0,
                  "stale_days": 5, "stale_policy": "WARN",
                  "risk_blocked_buy": {"Conservative": ["Alternatives"]}}
DEFAULT_FEES = {"High": {"bps": 5.0, "min_fee": 1.0}, "Medium": {"bps": 12.0, "min_fee": 2.0},
                "Low": {"bps": 25.0, "min_fee": 5.0}}


def calc_fee(notional, tier, fees=None):
    f = (fees or DEFAULT_FEES)[tier]
    return round(max(f["min_fee"], notional * f["bps"] / 10000.0), 2)


def merged_policy(p=None):
    d = dict(DEFAULT_POLICY); d.update(p or {}); return d


def price_status(inp, iid, pol):
    p = inp["prices"].get(iid)
    if not p:
        return "MISSING"
    return "STALE" if (inp["as_of"] - p["date"]).days > pol["stale_days"] else "OK"


def class_values(inp):
    v = {c: 0.0 for c in ALL_CLASSES}
    for iid, q in inp["holdings"].items():
        p = inp["prices"].get(iid)
        if p:
            v[inp["instruments"][iid]["asset_class"]] += q * p["price"]
    v["Cash"] = inp["cash"]
    return v


def total_value(inp):
    return sum(class_values(inp).values())


def allocation(inp):
    v = class_values(inp); t = sum(v.values())
    return {c: (v[c] / t * 100 if t > 0 else 0.0) for c in ALL_CLASSES}


def drift_table(inp):
    a = allocation(inp); v = class_values(inp); rows = []
    for c in ALL_CLASSES:
        t = float(inp["targets"].get(c, 0.0))
        rows.append({"asset_class": c, "market_value": round(v[c], 2), "current": round(a[c], 4), "target": t,
                     "drift": round(a[c] - t, 4), "abs_drift": round(abs(a[c] - t), 4)})
    return rows


def drift_summary(rows):
    d = [r["abs_drift"] for r in rows]
    return {"mean": round(sum(d) / len(d), 4), "max": round(max(d), 4)}


def target_issues(inp):
    s = sum(inp["targets"].values()); out = []
    if abs(s - 100.0) > WEIGHT_TOL:
        out.append({"code": "INVALID_TARGET_WEIGHTS",
                    "message": f"Target weights sum to {s:.4f}%, expected 100% (tolerance ±{WEIGHT_TOL}pp)."})
    if any(w < 0 for w in inp["targets"].values()):
        out.append({"code": "NEGATIVE_TARGET_WEIGHT", "message": "A target weight is negative."})
    return out


def policy_violations(inp, pol):
    pol = merged_policy(pol); v = []
    for i in target_issues(inp):
        v.append({**i, "severity": "HIGH", "resolution": "Correct the target allocation so weights sum to 100%.",
                  "approval_required": True})
    for r in drift_table(inp):
        if r["abs_drift"] > pol["max_drift"]:
            sev = "HIGH" if r["abs_drift"] > 2 * pol["max_drift"] else "MEDIUM"
            v.append({"code": "MAX_DRIFT_BREACH", "severity": sev, "asset_class": r["asset_class"],
                      "message": f"{r['asset_class']} drift {r['drift']:+.2f}pp exceeds ±{pol['max_drift']}pp.",
                      "resolution": "Generate and review a rebalance proposal.", "approval_required": sev == "HIGH"})
    for iid in inp["holdings"]:
        ins = inp["instruments"][iid]; st = price_status(inp, iid, pol)
        if ins["restricted"]:
            v.append({"code": "RESTRICTED_HOLDING", "severity": "HIGH", "instrument_id": iid,
                      "message": f"{iid} is restricted but held.", "resolution": "Escalate to compliance for sell-down review.",
                      "approval_required": True})
        if st == "STALE":
            v.append({"code": "STALE_PRICE", "severity": "MEDIUM", "instrument_id": iid,
                      "message": f"{iid} price is stale ({(inp['as_of'] - inp['prices'][iid]['date']).days}d).",
                      "resolution": "Refresh market data before trading.", "approval_required": False})
        if st == "MISSING":
            v.append({"code": "MISSING_PRICE", "severity": "HIGH", "instrument_id": iid,
                      "message": f"{iid} has no market price.", "resolution": "Source a valid price.", "approval_required": True})
    return v


def validate_trades(inp, trades, policy=None, fees=None):
    """Hard business rules. Returns issues [{code, severity: error|warning, message, instrument_id}]."""
    pol = merged_policy(policy); fees = fees or DEFAULT_FEES; issues = []; sold = {}
    cash = inp["cash"]; vol = 0.0; tot_fee = 0.0

    def add(code, sev, msg, iid=None):
        issues.append({"code": code, "severity": sev, "message": msg, "instrument_id": iid})

    for t in trades:
        iid, side, q = t["instrument_id"], t["side"], t["quantity"]
        ins = inp["instruments"].get(iid)
        if ins is None:
            add("UNKNOWN_INSTRUMENT", "error", f"{iid} is not in the instrument universe.", iid); continue
        if side not in ("BUY", "SELL"):
            add("INVALID_SIDE", "error", f"Invalid side '{side}'.", iid); continue
        if not (q > 0 and float(q).is_integer()):
            add("INVALID_QUANTITY", "error", f"Quantity {q} must be a positive whole number.", iid); continue
        if ins["restricted"]:
            add("RESTRICTED_INSTRUMENT", "error", f"{iid} is restricted and cannot be traded.", iid)
        if side == "BUY" and ins["asset_class"] in pol["risk_blocked_buy"].get(inp["risk_category"], []):
            add("RISK_CATEGORY_RESTRICTION", "error",
                f"{inp['risk_category']} portfolios may not buy {ins['asset_class']}.", iid)
        if side == "BUY" and ins["liquidity_tier"] == "Low":
            add("LIQUIDITY_RESTRICTION", "error", f"{iid} is low-liquidity; buys are not permitted.", iid)
        st = price_status(inp, iid, pol)
        if st == "MISSING":
            add("MISSING_PRICE", "error", f"No market price for {iid}.", iid); continue
        if st == "STALE":
            add("STALE_PRICE", "error" if pol["stale_policy"] == "BLOCK" else "warning",
                f"Price for {iid} is stale.", iid)
        px = inp["prices"][iid]["price"]
        if abs(t.get("price", px) - px) > 0.005:
            add("PRICE_MISMATCH", "error", f"Trade price {t.get('price')} differs from market price {px}.", iid)
        notional = q * px
        if side == "SELL":
            sold[iid] = sold.get(iid, 0) + q
            held = inp["holdings"].get(iid, 0)
            if sold[iid] > held:
                add("INSUFFICIENT_HOLDINGS", "error", f"Selling {sold[iid]:g} of {iid} exceeds {held:g} held.", iid)
            elif sold[iid] > math.floor(held * SELL_CAP[ins["liquidity_tier"]]):
                add("LIQUIDITY_LIMIT", "error",
                    f"Sale exceeds {int(SELL_CAP[ins['liquidity_tier']] * 100)}% liquidity cap for {ins['liquidity_tier']} tier.", iid)
        exp = calc_fee(notional, ins["liquidity_tier"], fees)
        if abs(t.get("fee", 0.0) - exp) > 0.01:
            add("FEE_MISMATCH", "error", ("Fee omitted" if not t.get("fee") else f"Fee {t['fee']} != expected") +
                f" (expected {exp:.2f}).", iid)
        fee = exp
        vol += notional; tot_fee += fee
        cash += (-notional if side == "BUY" else notional) - fee
    if cash < -0.005:
        add("INSUFFICIENT_CASH", "error", f"Post-trade cash would be {cash:.2f}.")
    if vol > 0 and tot_fee / vol * 100 > pol["max_fee_pct"]:
        add("FEE_CAP_EXCEEDED", "warning", f"Fees are {tot_fee / vol * 100:.3f}% of volume (cap {pol['max_fee_pct']}%).")
    return issues


def apply_trades(inp, trades):
    n = copy.deepcopy(inp)
    for t in trades:
        s = 1 if t["side"] == "BUY" else -1
        n["holdings"][t["instrument_id"]] = n["holdings"].get(t["instrument_id"], 0) + s * t["quantity"]
        n["cash"] = round(n["cash"] - s * t["notional"] - t["fee"], 2)
    n["holdings"] = {k: v for k, v in n["holdings"].items() if v > 0}
    return n


def _mk(iid, side, q, px, tier, fees):
    n = round(q * px, 2)
    return {"instrument_id": iid, "side": side, "quantity": int(q), "price": px, "notional": n,
            "fee": calc_fee(q * px, tier, fees)}


def generate_proposal(inp, policy=None, fees=None):
    pol = merged_policy(policy); fees = fees or DEFAULT_FEES
    res = {"portfolio_id": inp["portfolio_id"], "status": "PROPOSED", "trades": [], "warnings": [],
           "failure_reasons": [], "notes": [], "skipped": [], "before": drift_table(inp),
           "violations": policy_violations(inp, pol)}
    fails = res["failure_reasons"]
    fails.extend(target_issues(inp))
    untradable = set()
    for iid in inp["holdings"]:
        st = price_status(inp, iid, pol)
        if st == "MISSING":
            fails.append({"code": "MISSING_PRICE", "message": f"No market price for held instrument {iid}."})
        elif st == "STALE":
            untradable.add(iid)
            m = f"Price for {iid} is stale ({(inp['as_of'] - inp['prices'][iid]['date']).days} days old)."
            if pol["stale_policy"] == "BLOCK":
                fails.append({"code": "STALE_PRICE_BLOCK", "message": m + " Policy blocks recommendations."})
            else:
                res["warnings"].append({"code": "STALE_PRICE", "message": m + " Position valued at last price and excluded from trading."})
    total = total_value(inp)
    if total <= 0:
        fails.append({"code": "EMPTY_PORTFOLIO", "message": "Portfolio value is zero."})
    if fails:
        return _finish(res, inp, pol, fees, None)

    alloc = allocation(inp); instr = inp["instruments"]

    def tradable(iid):
        return (not instr[iid]["restricted"]) and iid not in untradable and price_status(inp, iid, pol) == "OK"

    sells, buys = [], []
    for c in CLASSES:
        delta = (inp["targets"].get(c, 0.0) - alloc[c]) / 100 * total
        if abs(delta) < pol["min_trade"]:
            res["skipped"].append({"asset_class": c, "reason": "BELOW_MIN_TRADE", "amount": round(delta, 2)}); continue
        if delta < 0:
            caps = {}
            for iid, q in sorted(inp["holdings"].items()):
                if instr[iid]["asset_class"] == c and tradable(iid):
                    u = math.floor(q * SELL_CAP[instr[iid]["liquidity_tier"]])
                    if u > 0:
                        caps[iid] = u
            tcap = sum(u * inp["prices"][i]["price"] for i, u in caps.items())
            if tcap <= 0:
                res["notes"].append(f"{c}: overweight but no tradable position (restricted/stale/illiquid)."); continue
            amt = min(-delta, tcap)
            for iid, u in caps.items():
                px = inp["prices"][iid]["price"]
                q = min(math.floor(amt * (u * px / tcap) / px), u)
                sells.append((iid, q, px))
        else:
            if c in pol["risk_blocked_buy"].get(inp["risk_category"], []):
                res["notes"].append(f"{c}: underweight but buys blocked for {inp['risk_category']} risk category."); continue
            cands = sorted([i for i, d in instr.items() if d["asset_class"] == c and d["liquidity_tier"] != "Low"
                            and tradable(i)], key=lambda i: (LIQ_RANK[instr[i]["liquidity_tier"]], i))[:3]
            if not cands:
                res["notes"].append(f"{c}: underweight but no eligible instrument."); continue
            for iid in cands:
                px = inp["prices"][iid]["price"]
                buys.append((iid, math.floor(delta / len(cands) / px), px))

    trades = []
    for iid, q, px in sells:
        if q > 0 and q * px >= pol["min_trade"]:
            trades.append(_mk(iid, "SELL", q, px, instr[iid]["liquidity_tier"], fees))
        elif q > 0:
            res["skipped"].append({"instrument_id": iid, "reason": "BELOW_MIN_TRADE", "amount": round(q * px, 2)})
    proceeds = sum(t["notional"] - t["fee"] for t in trades)
    avail = inp["cash"] + proceeds - pol["min_cash_pct"] / 100 * total
    cost = sum(q * px + calc_fee(q * px, instr[i]["liquidity_tier"], fees) for i, q, px in buys if q > 0)
    scale = 1.0 if cost <= avail or cost == 0 else max(avail, 0) / cost * 0.999
    bl = []
    for iid, q, px in buys:
        q = math.floor(q * scale)
        if q > 0 and q * px >= pol["min_trade"]:
            bl.append([iid, q, px])
    def bcost(): return sum(q * px + calc_fee(q * px, instr[i]["liquidity_tier"], fees) for i, q, px in bl)
    while bl and bcost() > avail:
        b = max(bl, key=lambda x: x[1] * x[2]); b[1] -= 1
        if b[1] * b[2] < pol["min_trade"]:
            bl.remove(b)
    trades += [_mk(i, "BUY", q, px, instr[i]["liquidity_tier"], fees) for i, q, px in bl]
    if not trades:
        res["notes"].append("NO_TRADES_REQUIRED: all deviations are below policy thresholds or untradable.")
    return _finish(res, inp, pol, fees, trades)


def _finish(res, inp, pol, fees, trades):
    bsum = drift_summary(res["before"])
    res["metrics"] = {"drift_before_mean": bsum["mean"], "drift_before_max": bsum["max"], "drift_after_mean": bsum["mean"],
                      "drift_after_max": bsum["max"], "total_fees": 0.0, "total_volume": 0.0, "cash_after": round(inp["cash"], 2),
                      "effectiveness_pct": 0.0, "portfolio_value": round(total_value(inp), 2)}
    res["after"] = res["before"]
    if trades is not None:
        res["trades"] = trades
        issues = validate_trades(inp, trades, pol, fees)
        for i in issues:
            (res["failure_reasons"] if i["severity"] == "error" else res["warnings"]).append(
                {"code": i["code"], "message": i["message"]})
        after = apply_trades(inp, trades); res["after"] = drift_table(after); a = drift_summary(res["after"])
        vol = round(sum(t["notional"] for t in trades), 2); fee = round(sum(t["fee"] for t in trades), 2)
        m = res["metrics"]
        m.update(drift_after_mean=a["mean"], drift_after_max=a["max"], total_fees=fee, total_volume=vol,
                 cash_after=round(after["cash"], 2),
                 effectiveness_pct=round((bsum["mean"] - a["mean"]) / bsum["mean"] * 100, 2) if bsum["mean"] > 0 else 0.0)
        res["post_violations"] = policy_violations(after, pol)
    if res["failure_reasons"]:
        res["status"] = "FAILED"
    res["decision"] = "REJECT" if res["failure_reasons"] else ("WARN" if res["warnings"] else "ACCEPT")
    return res
