# PortfoPilot — Intelligent Portfolio Rebalancing & Risk Analytics

A full-stack portfolio rebalancing platform built for the YottaFlex.ai Associate AI Forward Deployed Engineer challenge.
**Educational simulation — not financial advice. All data is synthetic (seed `20261022`).**

| | |
|---|---|
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS · Recharts · Framer Motion · Lucide (dark navy/teal institutional theme) |
| **Backend** | Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 · pandas / NumPy · SQLite |
| **Tests** | pytest (33) · Vitest (24 mocked + 8 live-API) |

## Problem
Portfolios drift from their target allocations as markets move. Advisors must find which portfolios breach policy, propose trades that respect holdings, restricted lists, liquidity and fees, prove the result is compliant, and keep an auditable record of every decision. PortfoPilot does this end-to-end with **deterministic business rules** (no randomness, no black box) and measurable evaluation.

## Key features
- **Executive dashboard** — AUM, drift, portfolios needing rebalance, violations, pending fees, performance chart with date filters, allocation, risk distribution, recent activity, critical exceptions.
- **Portfolio management & analysis** — searchable/sortable table; detail view with current-vs-target, drift, concentration (HHI), holdings, stale/missing prices, violations, history.
- **Rebalancing engine** — rule-based buys/sells with min-trade threshold, holdings and liquidity limits, restricted-instrument exclusion, risk-category restrictions, fees, cash reserve, post-trade recompute, retained failure reasons; approve/reject with role-based approval levels.
- **Policy & risk** — editable constraints (audited), violations with severity, resolution and approval requirement.
- **Simulation studio** — re-run a proposal or edit orders and see before/after allocation, fees, volume, cash, compliance, effectiveness.
- **Audit trail** — append-only (DB triggers block UPDATE/DELETE).
- **Data quality** — 12 validation checks, CSV export.
- **Analytics** — 10 metrics, each with its formula; ground-truth evaluation of labelled anomalies.

More: [`docs/architecture.md`](docs/architecture.md) · [`docs/business_rules.md`](docs/business_rules.md) · [`docs/data_dictionary.md`](docs/data_dictionary.md) · [`docs/evaluation.md`](docs/evaluation.md) · [`docs/REQUIREMENTS_CHECKLIST.md`](docs/REQUIREMENTS_CHECKLIST.md)

## Quick start (local)
Requires Python ≥ 3.11 and Node ≥ 20.
```bash
# 1. Backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m backend.data.generate --mode starter --seed 20261022   # creates data/generated/portfopilot.db
uvicorn backend.app.main:app --reload --port 8000                # API docs: http://localhost:8000/docs

# 2. Frontend (new terminal)
cd frontend && npm install && npm run dev                        # http://localhost:5173 (proxies /api → :8000)
```
Full-size dataset (1,000 portfolios · 5,000 instruments · 250 trading days): `python -m backend.data.generate --mode full --seed 20261022`.
**Stop the API before regenerating** (the generator replaces the database file); `scripts/dev_restart_api.sh --regen` does stop → regenerate → start.

### Docker
```bash
docker compose up --build      # UI http://localhost:8080 · API http://localhost:8000/docs
PORTFOPILOT_MODE=full docker compose up --build
```
(Compose files are provided but were not executed in the build environment, which had no Docker.)

## Tests
```bash
python -m pytest backend/tests -q                         # 33 backend tests
cd frontend && npm test                                   # 24 Vitest tests (mocked API)
npm run build                                             # type-check + production build
# Live frontend→API tests (API must be running on :8000):
npm run test:live
python scripts/verify_repro.py --mode starter             # generate twice, compare counts/checksums/validation
```

## Reproducibility
`python -m backend.data.generate --mode {starter|full} --seed 20261022` is the single generator command. `scripts/verify_repro.py` runs it twice into separate directories and compares row counts, SHA-256 of every CSV, the ground-truth checksum and the 12-check validation vector. The only intentionally variable output is `data/generated/run_metadata.json` (timestamp). Provenance: `data/generated/source_manifest.json`.

## API (OpenAPI at `/docs`)
| Method & path | Purpose |
|---|---|
| `GET /api/dashboard/summary?start&end` | KPIs, charts data, activity, exceptions |
| `GET /api/portfolios` · `/{id}` · `/{id}/holdings` · `/{id}/allocation` | Search/sort/paginate; detail; holdings; drift |
| `POST /api/rebalance/generate` | Generate a proposal (201) |
| `GET /api/rebalance/proposals` · `/{id}` | List (paginated) / detail |
| `POST /api/rebalance/{id}/simulate` | Re-validate and simulate stored or custom orders |
| `POST /api/rebalance/{id}/approve` · `/reject` | Decision (409 if already decided, 403 if senior required) |
| `GET /api/constraints` · `PUT /api/constraints/{id}` | Policies (updates audited) |
| `GET /api/policy/violations` | Active violations with severity/resolution |
| `GET /api/audit/events` | Append-only event log (filter, paginate) |
| `GET /api/validation/report?format=json\|csv` | 12 data-quality checks / export |
| `GET /api/analytics/metrics` · `/anomalies` | Metrics with formulas / ground-truth evaluation |

Errors: 404 unknown entity · 409 invalid state transition · 403 insufficient role · 422 request validation (Pydantic).

## Edge cases (labelled, evaluated)
Weights ≠ 100 %, sell > holdings, restricted instrument recommended, fee omitted, stale price without warning — plus clean controls. See [`docs/evaluation.md`](docs/evaluation.md); results in `data/ground_truth/`.

## Known limitations
- No authentication; approver/role are request fields (demo only).
- Aggregate endpoints recompute per call (≈1–3 s in full mode); no caching.
- SQLite, `create_all` initialisation (Alembic not used).
- Request bodies use Pydantic schemas; most responses are plain JSON (documented in this README rather than typed response models).
- UI primitives are shadcn-style (Tailwind + clsx + tailwind-merge) written in-repo; the shadcn CLI/Radix were not used.
- The UI was verified through type-checking, a production build, jsdom component/page tests (mocked and against the live API) and HTTP checks through the Vite proxy. No real browser was available, so there are no screenshots and responsive layout was not visually inspected.

## Screenshots
Not captured in the build environment (no browser available). To add them: run the app, capture each page, and save to `docs/screenshots/` (e.g. `dashboard.png`).

## Publish to GitHub
```bash
cd portfopilot
git init && git add . && git commit -m "PortfoPilot: portfolio rebalancing & risk analytics"
git branch -M main
git remote add origin https://github.com/<your-user>/portfopilot.git
git push -u origin main
```
`.gitignore` excludes virtualenvs, `node_modules`, build output and the large generated files (`*.db`, `market_prices.csv`); regenerate them with the commands above.

## Project layout
```
backend/app/{api,models,schemas,services,engines,validators,analytics,audit,data,database}   backend/tests   backend/data/generate.py
frontend/src/{pages,components,layouts,charts,hooks,services,types,utils,test}
data/{generated,ground_truth,exports}   docs/   scripts/   docker-compose.yml   .env.example
```
