# Data Dictionary

IDs are deterministic and immutable (derived from generation order, never random).

| ID | Pattern | Example |
|---|---|---|
| Investor | `INV-NNNNNN` | `INV-000001` |
| Portfolio | `PORT-INV-NNNNNN-NN` | `PORT-INV-000001-01` |
| Instrument | `INS-NNNNNN` | `INS-000001` |
| Holding | `HOLD-<portfolio_id>-<instrument_id>` | `HOLD-PORT-INV-000001-01-INS-000001` |
| Proposal | `RB-YYYY-NNNNNN` | `RB-2026-000001` |
| Trade | `<proposal_id>-Tnn` | `RB-2026-000001-T01` |

## Tables
**investor_profiles** — PK `investor_id`; `full_name`; `risk_category` ∈ {Conservative, Moderate, Balanced, Growth, Aggressive}; `created_on`.
**portfolios** — PK `portfolio_id`; FK `investor_id`; `base_currency`; `cash_balance` ≥ 0; `status` ∈ {ACTIVE, CLOSED}; `created_on`, `updated_on`.
**instruments** — PK `instrument_id`; unique `symbol`; `asset_class` ∈ {Equity, Fixed Income, Real Estate, Commodities, Alternatives}; `liquidity_tier` ∈ {High, Medium, Low}; `restricted` bool; `status`.
**holdings** — PK `holding_id`; FK `portfolio_id`, `instrument_id`; unique (portfolio, instrument); `quantity` ≥ 0; `updated_on`.
**market_prices** — PK `price_id`; FK `instrument_id`; unique (instrument, `price_date`); `close_price` > 0.
**target_allocations** — PK `target_id`; FK `portfolio_id`; `asset_class` (incl. Cash); `target_weight` 0–100; `effective_from`, `effective_to` (NULL = active); unique (portfolio, class, effective_from).
**fee_schedules** — PK `fee_id`; `tier`; `bps`; `min_fee`; `effective_from`; unique (tier, effective_from).
**constraints** — PK `constraint_id`; unique `name` (MAX_DRIFT, MIN_TRADE, MAX_FEE_PCT, MIN_CASH_PCT, STALE_DAYS, STALE_POLICY, RISK_BLOCKED_BUY_<RISK>); `value`; `scope`; `severity`; `description`.
**rebalance_proposals** — PK `proposal_id`; FK `portfolio_id`; `status` ∈ {PROPOSED, FAILED, APPROVED, REJECTED}; `drift_before/after`, `total_fees`, `total_volume`; `approval_level` ∈ {STANDARD, SENIOR}; JSON `warnings`, `failure_reasons`, `before_alloc`, `after_alloc`.
**trades** — PK `trade_id`; FK `proposal_id`, `portfolio_id`, `instrument_id`; `side` ∈ {BUY, SELL}; `quantity`; `price`; `notional`; `fee`.
**audit_events** *(append-only)* — `event_type`, `entity_type`, `entity_id`, `portfolio_id`, `actor`, JSON `payload`, `created_at`.
**approval_history** *(append-only)* — FK `proposal_id`; `decision`; `actor`; `role`; `note`; `decided_at`.

## Lifecycle
`PROPOSED → APPROVED | REJECTED` (terminal). `FAILED` is terminal and keeps `failure_reasons`.

## Generated files (`data/generated/`)
`investors.csv, portfolios.csv, instruments.csv, holdings.csv, market_prices.csv, target_allocations.csv, fee_schedules.csv, constraints.csv, portfopilot.db, source_manifest.json` (deterministic: counts + SHA-256) and `run_metadata.json` (the only intentionally variable file: generation timestamp).
`data/ground_truth/`: `anomaly_inputs.json` (mutations, no labels), `ground_truth.csv`, `ground_truth.json`.

## Synthetic data methodology (source manifest)
100 % synthetic, `numpy.random.default_rng(20261022)`. Order: instruments → price paths (geometric random walk, class-specific volatility) → investors → portfolios (weights = risk template × bounded noise) → holdings **derived** from value ÷ last price → target allocations (template) → reference tables. Planted realities: ~2 % instruments with stale prices (7–14 trailing days missing), ~0.4 % with no prices, ~3 % restricted instruments (some held), ~3 % of class holdings omitted. Modes: `test` (24 portfolios), `starter` (100 / 500 / 60 days), `full` (1,000 / 5,000 / 250 days).
