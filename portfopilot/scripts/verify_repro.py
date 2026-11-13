"""Generate the dataset twice with the same seed; compare row counts, checksums and validation results."""
import argparse, json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pathlib import Path
from sqlalchemy.orm import sessionmaker
from backend.app.data.generator import generate
from backend.app.database.db import make_engine
from backend.app.validators.validation_service import run_all

ap = argparse.ArgumentParser(); ap.add_argument("--mode", default="starter"); ap.add_argument("--seed", type=int, default=20261022)
a = ap.parse_args(); runs = []
with tempfile.TemporaryDirectory() as t:
    for n in (1, 2):
        r = generate(a.mode, a.seed, Path(t) / f"run{n}", Path(t) / f"gt{n}")
        s = sessionmaker(bind=make_engine(f"sqlite:///{r['db_path']}"))()
        runs.append((r["manifest"], [(c["id"], c["status"], c["failed"]) for c in run_all(s)])); s.close()
(m1, v1), (m2, v2) = runs
res = {"row_counts_equal": m1["row_counts"] == m2["row_counts"], "checksums_equal": m1["checksums_sha256"] == m2["checksums_sha256"],
       "ground_truth_equal": m1["ground_truth_checksum"] == m2["ground_truth_checksum"], "validation_equal": v1 == v2}
print(json.dumps(res, indent=1)); sys.exit(0 if all(res.values()) else 1)
