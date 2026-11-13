# Architecture

```
┌──────────────────────────┐   /api (proxy / nginx)   ┌─────────────────────────────────────────┐
│ React + TS + Vite (SPA)  │ ───────────────────────▶ │ FastAPI  backend/app/main.py            │
│ Tailwind · Recharts      │ ◀─────────────────────── │  api/routes.py  (REST + validation)     │
│ Framer Motion · Lucide   │        JSON              │  schemas/       (Pydantic v2 requests)  │
└──────────────────────────┘                          │  services/      (load snapshots, proposals)
                                                      │  engines/rebalance.py  (pure, no I/O)   │
                                                      │  validators/    (12 data-quality checks)│
                                                      │  analytics/     (metrics, anomaly eval) │
                                                      │  audit/         (append-only event log) │
                                                      └───────────────┬─────────────────────────┘
                                                                      │ SQLAlchemy 2 ORM (+ pandas for bulk reads)
                                                              ┌───────▼────────┐
                                                              │ SQLite (FK ON) │  data/generated/portfopilot.db
                                                              └────────────────┘
```

## Design decisions
| Decision | Rationale |
|---|---|
| **Engine is a pure function** (`generate_proposal(snapshot, policy, fees)`) | Deterministic, trivially unit-testable, no DB/clock/randomness. The same function validates anomaly cases and powers simulation. |
| **Snapshot dict as the engine boundary** | `services/portfolio_service.load_inputs` is the only place that translates DB rows into engine input; anomalies mutate the snapshot, never the DB. |
| **Vectorised portfolio snapshot** (`snapshot_df`) | Dashboard / list / policy views for 1,000 portfolios are computed with pandas pivots, not N+1 queries. |
| **Hard rules vs. warnings** | `validate_trades` returns `error` (blocks proposal → `FAILED`, reasons retained) or `warning` (proposal stays `PROPOSED` but needs SENIOR approval). |
| **Append-only history** | `audit_events` and `approval_history` have SQLite `BEFORE UPDATE/DELETE` triggers that abort. Decisions create new rows; failed proposals keep `failure_reasons`. |
| **Ground truth separated from inputs** | `anomaly_inputs.json` (mutations only) vs `ground_truth.json/csv` (labels, expected & actual decision). The engine never reads labels. |
| **Frontend ↔ backend contract** | One typed service layer (`frontend/src/services/api.ts`, types in `types/api.ts`); every page fetches through it. |

## Request flow: generate → simulate → decide
1. `POST /api/rebalance/generate` → `load_inputs` → `generate_proposal` → persist `RebalanceProposal` + `Trade` rows → audit events (`REBALANCE_GENERATED`, `TRADE_PROPOSED`, `POLICY_VIOLATION_DETECTED`).
2. `POST /api/rebalance/{id}/simulate` re-validates the stored (or user-edited) orders against **current** holdings/prices and returns before/after allocation, fees, cash, compliance.
3. `POST …/approve|reject` → status transition guarded (only `PROPOSED`; SENIOR proposals need `role=senior`) → `ApprovalHistory` + audit event.

## Entity relationships (cardinalities)
```
InvestorProfile 1 ──< Portfolio 1 ──< Holding >── 1 Instrument 1 ──< MarketPrice
                          │ 1                                  │
                          ├──< TargetAllocation                │
                          └──< RebalanceProposal 1 ──< Trade >─┘ (N:1 Instrument)
                                     │ 1
                                     └──< ApprovalHistory
FeeSchedule (by liquidity tier) and Constraint are reference tables; AuditEvent references entities by id.
```
Holding is the Portfolio↔Instrument association (unique pair). `Trade` doubles as the proposal↔instrument mapping.

## Frontend structure
`pages/` (9 routed modules) · `components/ui.tsx` (design primitives: Card, Button, Badge, DataTable, Tabs, …) · `components/shared.tsx` (DriftTable, TradesTable, Reasons) · `charts/charts.tsx` (Recharts) · `layouts/AppLayout.tsx` (sidebar, mobile drawer) · `hooks/useApi.ts` · `services/api.ts`.
Design tokens live in `tailwind.config.js` (navy `#0A101C`, slate surfaces `#111A2C`, teal/emerald accents). Dark is the only theme.

## Known limits
SQLite single-writer; aggregate endpoints recompute on each call (1–3 s in full mode, no cache); no authentication (approver identity/role is a request field, for demonstration).
