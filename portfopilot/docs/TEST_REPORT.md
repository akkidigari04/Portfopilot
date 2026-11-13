# Test & Verification Report

Environment: Linux, Python 3.12, Node 22. No browser and no Docker were available.

| Check | Command | Result |
|---|---|---|
| Backend unit + API + DB + reproducibility | `python -m pytest backend/tests -q` | **33 passed** |
| Frontend unit/component/page (mocked API) | `cd frontend && npm test` | **24 passed** (8 live tests skipped without a server) |
| Frontend ↔ real API (service layer + rendered pages) | `npm run test:live` (API running) | **8 passed** |
| Type-check + production build | `npm run build` | **OK** (code-split bundles, largest 424 kB / 114 kB gzip: Recharts) |
| Vite dev proxy → FastAPI | `curl localhost:5173/api/portfolios` | **OK** |
| Reproducibility, starter mode | `python scripts/verify_repro.py --mode starter` | **row counts, CSV checksums, ground truth, validation: all equal** |
| Reproducibility, full mode (1,000 portfolios / 5,000 instruments / 250 days) | `python scripts/verify_repro.py --mode full` | **all equal** |
| Anomaly ground truth | generated with every dataset | **30/30 starter, 120/120 full passed** |

## Reference metrics (clean starter dataset, seed 20261022)
AUM $96.4M · 100 portfolios · 51 need rebalancing · 72 active violation flags · mean drift 4.27 → 0.12 pp after rebalancing · 100 % of proposed portfolios improved · compliance rate 40 % · 2 failed proposals (reasons retained) · acceptance rate 78.3 % · validation pass rate 91.7 % (11/12 PASS; `STL-001` WARN = 6 held instruments with stale/missing prices, planted by design) · anomaly pass rate 100 %.
Numbers change with mode; regenerate to reproduce.

## Not verified
Visual appearance and responsive behaviour in a real browser; `docker compose up`.

## Operational note found during testing
The generator replaces the SQLite file. A running API holding the old file returns HTTP 500 on writes after regeneration: stop the API first (`scripts/dev_restart_api.sh --regen` does this).
