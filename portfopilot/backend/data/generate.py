import argparse, json
from backend.app.data.generator import generate


def main():
    ap = argparse.ArgumentParser(description="PortfoPilot synthetic data generator")
    ap.add_argument("--mode", choices=["test", "starter", "full"], default="starter")
    ap.add_argument("--seed", type=int, default=20261022)
    ap.add_argument("--out-dir"); ap.add_argument("--gt-dir")
    a = ap.parse_args()
    r = generate(a.mode, a.seed, a.out_dir, a.gt_dir)
    gt = r["ground_truth"]; passed = sum(x["passed"] for x in gt)
    print(json.dumps(r["manifest"]["row_counts"], indent=1))
    print(f"DB: {r['db_path']}\nAnomaly cases: {passed}/{len(gt)} passed")


if __name__ == "__main__":
    main()
