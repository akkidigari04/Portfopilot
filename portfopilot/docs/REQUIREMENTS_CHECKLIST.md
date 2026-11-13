# Requirement → Implementation Checklist

Legend: ✅ implemented & verified · ◐ implemented with a stated deviation · ❌ not done

## §1–2 Vision & stack
| Requirement | Status | Where |
|---|---|---|
| Monitor portfolios, compare to targets, calculate drift | ✅ | `engines/rebalance.py::drift_table`, Portfolios + Detail pages |
| Identify risks / policy violations | ✅ | `policy_violations`, `GET /api/policy/violations`, Policy page |
| Constraint-aware recommendations, fees, post-trade simulation | ✅ | `generate_proposal`, `/simulate`, Simulation Studio |
| Audit history; evaluation metrics | ✅ | `audit/log.py`, Audit page; `analytics/metrics.py`, Analytics page |
| React + Vite + TypeScript + Tailwind + Recharts + Lucide + Framer Motion | ✅ | `frontend/` |
| shadcn/ui | ◐ | shadcn-style primitives hand-written in `components/ui.tsx` (CLI/Radix not used) |
| FastAPI, Pydantic, Pandas/NumPy, SQLAlchemy, SQLite + FKs | ✅ | `backend/app` (FK pragma ON, CHECK/UNIQUE constraints) |
| Alembic migrations "if practical" | ❌ | `Base.metadata.create_all` used |
| Pytest, Vitest, API integration tests | ✅ | `backend/tests` (33), `frontend/src/test` (24 + 8 live) |

## §3 Premium UI/UX
| Requirement | Status | Where |
|---|---|---|
| Navy/charcoal, slate cards, teal/emerald, white type, dark default | ✅ | `tailwind.config.js`, `index.css` (dark is the only theme) |
| Sidebar, professional tables/charts, micro-interactions | ✅ | `layouts/AppLayout.tsx`, `components/ui.tsx`, `charts/charts.tsx` |
| Responsive desktop/tablet/mobile | ◐ | Responsive grid classes + mobile drawer; not visually inspected in a real browser |
| No emoji nav / fake buttons / random charts | ✅ | Every control calls the API or navigates (see page tests) |

## §4 Modules
| Module | Status | Page / endpoint |
|---|---|---|
| A. Executive Dashboard (all listed KPIs, charts, date filters, activity, exceptions) | ✅ | `pages/Dashboard.tsx`, `GET /api/dashboard/summary` |
| B. Portfolio Management (searchable table, detail, holdings, targets, differences, history) | ✅ | `Portfolios.tsx`, `PortfolioDetail.tsx` |
| C. Portfolio Analysis (weight, drift, absolute drift, concentration, exposure, stale/missing prices) | ✅ | Detail tabs; `/allocation` |
| D. Rebalancing Engine (all 11 steps) | ✅ | `engines/rebalance.py`; `Rebalance.tsx` |
| E. Policy & Risk (configurable policies, violations, severity, resolution, approval requirement) | ✅ | `Policy.tsx`, `PUT /api/constraints/{id}` |
| F. Simulation Studio (before/after, orders, fees, volume, cash, compliance, effectiveness, button) | ✅ | `Simulation.tsx`, `/simulate` |
| G. Audit & Event History (all 7 event types, never overwritten) | ✅ | `Audit.tsx`; SQLite append-only triggers (test_audit_is_append_only) |
| H. Data Quality (PK, FK, missing, duplicates, weights, quantities, stale, fees, lifecycle; export) | ✅ | `validators/validation_service.py`, `DataQuality.tsx`, CSV export |
| I. Analytics (7 metrics + formulas) | ✅ | `analytics/metrics.py`, `Analytics.tsx` |

## §5 Data model
| Requirement | Status | Where |
|---|---|---|
| 10 entities + audit/approval/proposal-trade tables | ✅ | `models/models.py` (`Trade` serves as proposal-trade mapping) |
| "Portfolio allocation mappings where required" | ◐ | Not required: `TargetAllocation` + `Holding` cover it |
| PK/FK/unique/enums/effective dates/lifecycle | ✅ | CHECK constraints, `effective_from/to`, status enum |
| ID conventions, deterministic & immutable | ✅ | `ID-001` validation check; generator |
| Cardinalities documented | ✅ | `docs/architecture.md` |

## §6–7 Synthetic data & edge cases
| Requirement | Status | Where |
|---|---|---|
| Seed 20261022; starter + full modes | ✅ | `data/generator.py` |
| 1,000 portfolios / 5,000 instruments / ~5,000 holdings / 250 days | ✅ | full mode (holdings ≈ 4.8K because ~3 % of class positions are intentionally omitted) |
| Master data first; derived values not independently randomised | ✅ | holdings from value ÷ price; fees/valuations computed |
| 5 labelled anomalies with issue_type, ground_truth, expected & actual decision, pass/fail explanation | ✅ | `analytics/anomaly_eval.py` |
| ground_truth separate from inputs; `.csv` + `.json` | ✅ | `data/ground_truth/` |

## §8 Business rules
All eight rules ✅ — `docs/business_rules.md`, `tests/test_engine.py`.

## §9 API
All 14 listed endpoints ✅ (+ proposal detail, constraint update, policy violations, anomalies). Validation, error handling, pagination, OpenAPI docs ✅. Response models ◐ (request schemas typed; responses plain JSON).

## §10 Tests
Allocation, drift, buy/sell, minimum trade, exclusions, fees, stale prices, invalid weights, insufficient holdings, post-trade reconciliation, DB relationships, API validation, reproducibility, negative & boundary tests ✅.

## §11 Reproducibility
Single generator command ✅ · generate twice & compare counts/checksums/validation ✅ (`scripts/verify_repro.py`) · variable metadata separated ✅ (`run_metadata.json`).

## §12–13 Structure & documentation
Structure ✅ (frontend `charts/`, `hooks/`, `layouts/`… present; backend uses `backend/app/{…}` as specified). `docs/` four files ✅, README sections ✅, source manifest ✅ (`source_manifest.json` + methodology in data dictionary). Screenshots ❌ (no browser available; instructions in README). docker-compose ✅ (not executed: no Docker in build environment).

## §14 Execution requirements
Working functionality ✅ · FE/BE communicate ✅ (live tests) · DB init ✅ · generator valid ✅ · all tests run ✅ · routes & UI workflows verified through jsdom + live API (not a real browser) ◐.
