# Evaluation

Metrics are served by `GET /api/analytics/metrics` (code: `backend/app/analytics/metrics.py`) and shown on the Analytics page with their formulas.

| Metric | Definition |
|---|---|
| Drift before / after | Mean over non-failed proposals of mean(\|current − target\|) over 6 classes; "after" recomputed from post-trade holdings, cash and latest valid prices |
| Portfolios successfully rebalanced | Portfolios with ≥1 non-failed proposal whose after-drift < before-drift ÷ portfolios with ≥1 non-failed proposal |
| Policy compliance rate | Portfolios with zero active violation flags ÷ all portfolios |
| Constraint violation count | Σ active flags (drift breach, restricted holding, stale price, missing price, weight mismatch) |
| Failed proposals | Count of `FAILED` proposals (reasons retained) |
| Estimated fees | Σ fee over trades of non-failed proposals |
| Recommendation acceptance rate | APPROVED ÷ (APPROVED + REJECTED) |
| Data validation pass rate | PASS checks ÷ total checks (WARN counts as not passed) |
| Anomaly scenario pass rate | Labelled cases where decision **and** detection code match ground truth |

## Ground-truth protocol
Five injected anomaly types plus clean controls, `n` per type (`test` 2, `starter` 5, `full` 20):

| issue_type | ground_truth | expected decision | expected code |
|---|---|---|---|
| WEIGHTS_NOT_100 | INVALID | REJECT | INVALID_TARGET_WEIGHTS |
| SELL_EXCEEDS_HOLDINGS | INVALID | REJECT | INSUFFICIENT_HOLDINGS |
| EXCLUDED_INSTRUMENT_RECOMMENDED | INVALID | REJECT | RESTRICTED_INSTRUMENT |
| FEE_OMITTED | INVALID | REJECT | FEE_MISMATCH |
| STALE_PRICE_UNWARNED | WARNING_REQUIRED | WARN | STALE_PRICE |
| CONTROL_CLEAN | VALID | ACCEPT | — |

Cases are built on portfolios that are clean at baseline so a failure cannot be confounded by planted data issues. A case passes only if the actual decision matches **and** the expected code is among the detected codes. Controls guard against false positives. Results: `data/ground_truth/ground_truth.{csv,json}`.

## Reproducibility protocol
`python scripts/verify_repro.py --mode starter|full` generates the dataset twice (same seed, separate directories) and compares row counts, SHA-256 of every CSV, ground-truth checksum and the full validation-result vector. A different seed is asserted to change the checksums (`test_reproducibility`). `run_metadata.json` (timestamp) is excluded by design; the SQLite file is not byte-compared (page layout is an implementation detail) — its content is covered through the CSV and validation comparisons.

## Test inventory
Backend (pytest, 33): allocation & drift maths, buy/sell direction, minimum-trade threshold & boundary, restricted exclusion, fee schedule & floor, stale WARN/BLOCK, missing price, weight-tolerance boundaries (100.005 ok / 100.02 fail / 95 fail), insufficient holdings, negative & fractional quantity, omitted fee, insufficient cash, risk/liquidity restrictions, liquidity sell cap, post-trade reconciliation & value conservation, determinism, FK & unique constraints, append-only audit, validation checks, ground truth, reproducibility, API pagination/validation/404/409, simulate/approve flow, constraint audit, CSV export.
Frontend (Vitest): 24 unit/component/page tests with mocked fetch + 8 live tests (`npm run test:live`) that call the real API and render pages with real data.
