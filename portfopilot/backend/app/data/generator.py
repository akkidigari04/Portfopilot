"""Seeded synthetic data generator. Master data -> dependent records -> derived values. No clocks in data."""
import hashlib, json, math, shutil
from datetime import date, datetime, timedelta
from pathlib import Path
import numpy as np
import pandas as pd
from sqlalchemy.orm import sessionmaker
from backend.app.database.db import Base, make_engine, ROOT
from backend.app.models import models as M
from backend.app.engines.rebalance import CLASSES, ALL_CLASSES
from backend.app.audit.log import log_event
from backend.app.services import proposal_service as ps
from backend.app.analytics import anomaly_eval

AS_OF = date(2026, 10, 22)
CFG = {"test": dict(n_port=24, n_ins=160, days=30, n_prop=8, n_anom=2),
       "starter": dict(n_port=100, n_ins=500, days=60, n_prop=30, n_anom=5),
       "full": dict(n_port=1000, n_ins=5000, days=250, n_prop=150, n_anom=20)}
TEMPLATES = {"Conservative": [20, 50, 8, 5, 2, 15], "Moderate": [35, 40, 10, 5, 3, 7], "Balanced": [50, 30, 8, 5, 4, 3],
             "Growth": [65, 15, 8, 5, 4, 3], "Aggressive": [78, 5, 6, 4, 5, 2]}
CODE = {"Equity": "EQ", "Fixed Income": "FI", "Real Estate": "RE", "Commodities": "CM", "Alternatives": "AL"}
VOL = {"Equity": .014, "Fixed Income": .004, "Real Estate": .009, "Commodities": .012, "Alternatives": .010}
FIRST = ["Amelia", "Noah", "Priya", "Liam", "Sofia", "Arjun", "Mei", "Lucas", "Fatima", "Oliver", "Hana", "Mateo"]
LAST = ["Sharma", "Chen", "Okafor", "Novak", "Silva", "Kapoor", "Reyes", "Haddad", "Larsen", "Tanaka", "Moreau", "Singh"]
CSV_FILES = ["investors", "portfolios", "instruments", "holdings", "market_prices", "target_allocations", "fee_schedules", "constraints"]


def build_frames(cfg, seed):
    rng = np.random.default_rng(seed)
    n_p, n_i, days = cfg["n_port"], cfg["n_ins"], cfg["days"]
    # ---- master data: instruments
    cls = rng.choice(CLASSES, size=n_i, p=[.45, .25, .10, .08, .12])
    liq = rng.choice(["High", "Medium", "Low"], size=n_i, p=[.5, .35, .15])
    rst = rng.random(n_i) < 0.03
    for c in CLASSES:  # guarantee a liquid, unrestricted core per class
        for j in np.where(cls == c)[0][:4]:
            liq[j], rst[j] = "High", False
    ids = [f"INS-{k + 1:06d}" for k in range(n_i)]
    ins = pd.DataFrame({"instrument_id": ids, "symbol": [f"{CODE[c]}{k + 1:04d}" for k, c in enumerate(cls)],
                        "name": [f"{c} Holding {k + 1:04d}" for k, c in enumerate(cls)], "asset_class": cls,
                        "liquidity_tier": liq, "restricted": rst, "status": "ACTIVE"})
    # ---- prices
    p0 = np.clip(rng.lognormal(np.log(60), 0.6, n_i), 5, 900)
    vol = np.array([VOL[c] for c in cls])[:, None]
    paths = np.round(np.maximum(p0[:, None] * np.exp(np.cumsum(rng.normal(0.0002, vol, (n_i, days)), axis=1)), 0.5), 2)
    last = paths[:, -1].copy()                                 # holdings are derived from these prices
    valid = np.ones((n_i, days), bool)
    stale = rng.choice(n_i, max(1, int(.02 * n_i)), replace=False)
    for j in stale:
        valid[j, days - int(rng.integers(7, 15)):] = False
    rest = np.setdiff1d(np.arange(n_i), stale)
    valid[rng.choice(rest, max(1, int(.004 * n_i)), replace=False), :] = False
    dates = pd.bdate_range(end=pd.Timestamp(AS_OF), periods=days).strftime("%Y-%m-%d").to_numpy()
    jj, kk = np.where(valid)
    prices = pd.DataFrame({"instrument_id": np.array(ids)[jj], "price_date": dates[kk], "close_price": paths[jj, kk]})
    # ---- investors, portfolios
    n_inv = math.ceil(n_p * 0.85)
    inv_risk = rng.choice(list(TEMPLATES), size=n_inv, p=[.2, .25, .25, .2, .1])
    inv = pd.DataFrame({"investor_id": [f"INV-{k + 1:06d}" for k in range(n_inv)],
                        "full_name": [f"{FIRST[int(a)]} {LAST[int(b)]}" for a, b in rng.integers(0, 12, (n_inv, 2))],
                        "risk_category": inv_risk,
                        "created_on": [(AS_OF - timedelta(days=int(d))).isoformat() for d in rng.integers(400, 2500, n_inv)]})
    ok = {c: [j for j in np.where(cls == c)[0] if liq[j] != "Low" and not rst[j]] for c in CLASSES}
    bad = {c: list(np.where((cls == c) & rst)[0]) for c in CLASSES}
    pf, hold, tgt = [], [], []
    for i in range(n_p):
        inv_id = inv.investor_id[i % n_inv]; pid = f"PORT-{inv_id}-{i // n_inv + 1:02d}"; risk = inv_risk[i % n_inv]
        tmpl = np.array(TEMPLATES[risk], float)
        total = float(np.clip(rng.lognormal(np.log(600000), 0.9), 50000, 25_000_000))
        w = tmpl * rng.uniform(0.75, 1.3, 6); w /= w.sum()
        created = AS_OF - timedelta(days=int(rng.integers(30, 1200)))
        pf.append({"portfolio_id": pid, "investor_id": inv_id, "base_currency": "USD", "cash_balance": round(total * w[5], 2),
                   "status": "ACTIVE", "created_on": created.isoformat(), "updated_on": AS_OF.isoformat()})
        for k, c in enumerate(CLASSES):
            pool = bad[c] if (rng.random() < 0.02 and bad[c]) else ok[c]
            j = int(rng.choice(pool))
            if rng.random() < 0.03:
                continue
            hold.append({"holding_id": f"HOLD-{pid}-{ids[j]}", "portfolio_id": pid, "instrument_id": ids[j],
                         "quantity": float(max(1, int(total * w[k] // last[j]))), "updated_on": AS_OF.isoformat()})
        for k, c in enumerate(ALL_CLASSES):
            tgt.append({"portfolio_id": pid, "asset_class": c, "target_weight": float(tmpl[k]),
                        "effective_from": (AS_OF - timedelta(days=365)).isoformat(), "effective_to": None})
    fees = pd.DataFrame([{"tier": t, "bps": b, "min_fee": m, "effective_from": "2026-01-01"}
                         for t, b, m in [("High", 5.0, 1.0), ("Medium", 12.0, 2.0), ("Low", 25.0, 5.0)]])
    con = [("MAX_DRIFT", "5.0", "HIGH", "Maximum absolute asset-class drift (percentage points)."),
           ("MIN_TRADE", "500", "LOW", "Minimum order notional in USD."),
           ("MAX_FEE_PCT", "0.5", "MEDIUM", "Max total fees as % of trading volume."),
           ("MIN_CASH_PCT", "1.0", "MEDIUM", "Minimum cash reserve after trading (% of portfolio)."),
           ("STALE_DAYS", "5", "MEDIUM", "Calendar days after which a price is stale."),
           ("STALE_POLICY", "WARN", "HIGH", "WARN or BLOCK when held instruments have stale prices."),
           ("RISK_BLOCKED_BUY_CONSERVATIVE", "Alternatives", "HIGH", "Asset classes Conservative portfolios may not buy ('|' separated).")]
    conf = pd.DataFrame([{"constraint_id": f"CON-{n + 1:03d}", "name": a, "value": b, "scope": "RISK" if a.startswith("RISK") else "GLOBAL",
                          "severity": s, "description": d, "effective_from": "2026-01-01"} for n, (a, b, s, d) in enumerate(con)])
    return {"investors": inv, "portfolios": pd.DataFrame(pf), "instruments": ins, "holdings": pd.DataFrame(hold),
            "market_prices": prices, "target_allocations": pd.DataFrame(tgt), "fee_schedules": fees, "constraints": conf}


def sha256(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def generate(mode="starter", seed=20261022, out_dir=None, gt_dir=None):
    cfg = CFG[mode]; out_dir = Path(out_dir or ROOT / "data/generated"); gt_dir = Path(gt_dir or ROOT / "data/ground_truth")
    out_dir.mkdir(parents=True, exist_ok=True); gt_dir.mkdir(parents=True, exist_ok=True)
    f = build_frames(cfg, seed)
    for n in CSV_FILES:
        f[n].to_csv(out_dir / f"{n}.csv", index=False, lineterminator="\n")
    dbp = out_dir / "portfopilot.db"
    for s in ("", "-wal", "-shm"):
        Path(str(dbp) + s).unlink(missing_ok=True)
    eng = make_engine(f"sqlite:///{dbp}"); Base.metadata.create_all(eng)
    for tbl in ["investors", "instruments", "fee_schedules", "constraints"]:
        name = {"investors": "investor_profiles", "fee_schedules": "fee_schedules"}.get(tbl, tbl)
        f[tbl].to_sql(name, eng, if_exists="append", index=False)
    f["portfolios"].to_sql("portfolios", eng, if_exists="append", index=False)
    for t in ("holdings", "target_allocations"):
        f[t].to_sql(t, eng, if_exists="append", index=False)
    f["market_prices"].to_sql("market_prices", eng, if_exists="append", index=False, chunksize=20000)
    Session = sessionmaker(bind=eng, expire_on_commit=False); db = Session()
    t0 = datetime.combine(AS_OF, datetime.min.time()).replace(hour=8)
    for r in f["portfolios"].itertuples():
        log_event(db, "PORTFOLIO_CREATED", "portfolio", r.portfolio_id, "system", r.portfolio_id, {"investor_id": r.investor_id},
                  datetime.fromisoformat(r.created_on))
        log_event(db, "HOLDINGS_UPDATED", "portfolio", r.portfolio_id, "system", r.portfolio_id, {"as_of": r.updated_on}, t0)
    log_event(db, "MARKET_PRICE_UPDATED", "market_prices", AS_OF.isoformat(), "system", None,
              {"instruments": int(f["market_prices"].instrument_id.nunique()), "rows": len(f["market_prices"])}, t0)
    db.commit()
    # seeded proposal history (so lifecycle / acceptance metrics are meaningful)
    from backend.app.services.portfolio_service import snapshot_df
    snap = snapshot_df(db)["out"]
    todo = list(snap[snap.needs_rebalance].sort_index().index[:cfg["n_prop"]])
    for n, pid in enumerate(todo):
        now = t0 + timedelta(minutes=10 * n)
        prop, res = ps.create_proposal(db, pid, "system", now)
        if prop.status == "PROPOSED" and res["trades"]:
            if n % 10 < 6:
                ps.decide(db, prop.proposal_id, "APPROVED", "j.marsh", "senior", "Within mandate.", now + timedelta(minutes=5))
            elif n % 10 < 8:
                ps.decide(db, prop.proposal_id, "REJECTED", "j.marsh", "senior", "Client requested hold.", now + timedelta(minutes=5))
    # anomaly scenarios
    cases = anomaly_eval.build_inputs(db, list(snap.sort_index().index), cfg["n_anom"])
    results = anomaly_eval.evaluate(db, cases)
    db.close()
    inputs = [{k: v for k, v in c.items() if k != "_type"} for c in cases]
    (gt_dir / "anomaly_inputs.json").write_text(json.dumps(inputs, indent=1, default=str))
    gt = pd.DataFrame(results); gt.to_csv(gt_dir / "ground_truth.csv", index=False, lineterminator="\n")
    (gt_dir / "ground_truth.json").write_text(json.dumps(results, indent=1))
    manifest = {"project": "PortfoPilot", "mode": mode, "seed": seed, "as_of": AS_OF.isoformat(), "provenance": "100% synthetic; numpy default_rng(seed)",
                "row_counts": {n: int(len(f[n])) for n in CSV_FILES}, "checksums_sha256": {f"{n}.csv": sha256(out_dir / f"{n}.csv") for n in CSV_FILES},
                "ground_truth_checksum": sha256(gt_dir / "ground_truth.csv")}
    (out_dir / "source_manifest.json").write_text(json.dumps(manifest, indent=1))
    # intentionally variable metadata kept apart from the deterministic manifest
    (out_dir / "run_metadata.json").write_text(json.dumps({"generated_at": datetime.utcnow().isoformat() + "Z"}))
    eng.dispose()
    return {"manifest": manifest, "ground_truth": results, "db_path": str(dbp), "gt_dir": str(gt_dir), "out_dir": str(out_dir)}
