# Business Rules

All rules live in `backend/app/engines/rebalance.py` and are covered by `backend/tests/test_engine.py`.

## Core formulas
- **Current weight** = instrument/asset-class market value ÷ total portfolio value × 100 (total includes cash).
- **Drift** = current weight − target weight. **Portfolio drift** = mean of |drift| over the 6 classes (5 asset classes + Cash). **Max drift** = largest |class drift| (used for policy checks).
- **Fee** = `max(min_fee, notional × bps / 10,000)` by the instrument's liquidity tier (High 5 bps/$1, Medium 12 bps/$2, Low 25 bps/$5), rounded to cents.
- **Effectiveness** = (drift_before − drift_after) ÷ drift_before × 100.

## Validation rules (never silently accepted)
| Rule | Code | Result |
|---|---|---|
| Target weights must sum to 100 ± 0.01 pp | `INVALID_TARGET_WEIGHTS` | Proposal `FAILED`, no trades |
| Sell quantity ≤ available holdings | `INSUFFICIENT_HOLDINGS` | error |
| Sell ≤ liquidity cap (High 100 %, Medium 75 %, Low 25 % of position) | `LIQUIDITY_LIMIT` | error |
| Low-liquidity instruments cannot be bought | `LIQUIDITY_RESTRICTION` | error |
| Restricted instruments never traded | `RESTRICTED_INSTRUMENT` | error |
| Risk-category restriction (Conservative may not buy Alternatives; configurable) | `RISK_CATEGORY_RESTRICTION` | error |
| Fee must equal schedule (omitted/incorrect fee) | `FEE_MISMATCH` | error |
| Quantity positive whole number | `INVALID_QUANTITY` | error |
| Trade price equals latest market price | `PRICE_MISMATCH` | error |
| Post-trade cash ≥ 0 | `INSUFFICIENT_CASH` | error |
| Missing price on a held instrument | `MISSING_PRICE` | `FAILED` |
| Stale price (> `STALE_DAYS`) | `STALE_PRICE` / `STALE_PRICE_BLOCK` | `WARN`: valued at last price, excluded from trading, warning retained. `BLOCK`: proposal `FAILED` |
| Fees ≤ `MAX_FEE_PCT` of volume | `FEE_CAP_EXCEEDED` | warning |

## Order construction (deterministic)
1. Per asset class, `delta$ = (target − current) × total value`. Skip if `|delta$| < MIN_TRADE` (recorded under *skipped*).
2. **Overweight → sells**: eligible = held, unrestricted, fresh price. Capacity by liquidity cap; allocate proportionally to capacity; whole units (floor).
3. **Underweight → buys**: up to 3 eligible instruments (unrestricted, fresh price, not Low liquidity) ordered by (liquidity rank, id); equal split; whole units.
4. Orders below `MIN_TRADE` are dropped. Buy budget = cash + net sell proceeds − `MIN_CASH_PCT` reserve; if exceeded, buys scale down, then the largest buy is trimmed one unit at a time.
5. The final order list is re-validated by `validate_trades`; any error marks the proposal `FAILED` while retaining the trades and reasons.
6. Post-trade holdings/cash are applied (`apply_trades`) and allocation is recomputed from valid prices.

## Approval
`approval_level = SENIOR` when volume > $250,000, any warning exists, or any HIGH violation exists. Only `PROPOSED` proposals can be decided (else HTTP 409); approving SENIOR proposals requires `role=senior` (else 403).

## Policy severities (current-state violations)
HIGH: restricted holding, missing price, invalid weights, drift > 2× limit. MEDIUM: drift above limit, stale price.
