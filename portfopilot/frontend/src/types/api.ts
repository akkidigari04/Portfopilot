export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface DriftRow { asset_class: string; market_value: number; current: number; target: number; drift: number; abs_drift: number }
export interface Violation { code: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; message: string; resolution: string; approval_required: boolean; asset_class?: string; instrument_id?: string }
export interface Issue { code: string; severity: 'error' | 'warning'; message: string; instrument_id: string | null }
export interface Reason { code: string; message: string }
export interface TradeRow { trade_id?: string; instrument_id: string; side: 'BUY' | 'SELL'; quantity: number; price: number; notional: number; fee: number }
export interface DashboardSummary {
  aum: number; portfolio_count: number; avg_drift: number; needs_rebalance: number; policy_violations: number; estimated_fees_pending: number
  risk_distribution: { risk_category: string; portfolios: number; aum: number; avg_drift: number }[]
  allocation: { asset_class: string; weight: number; target: number; value: number }[]
  performance: { date: string; aum: number; indexed: number }[]
  recent_activity: { event_id: number; event_type: string; entity_id: string; portfolio_id: string | null; actor: string; created_at: string }[]
  critical_exceptions: { portfolio_id: string; risk_category: string; drift_max: number; restricted_held: number; missing_prices: number; weights_ok: boolean }[]
  policy: { max_drift: number }
}
export interface PortfolioRow {
  portfolio_id: string; investor_id: string; risk_category: string; total_value: number; holdings_count: number; drift_mean: number; drift_max: number
  violation_count: number; rebalance_status: string; needs_rebalance: boolean; updated_on: string
}
export interface HoldingRow {
  instrument_id: string; symbol: string; name: string; asset_class: string; liquidity_tier: string; restricted: boolean; quantity: number
  price: number | null; price_date: string | null; price_status: 'OK' | 'STALE' | 'MISSING'; market_value: number; weight: number
}
export interface ProposalRow {
  proposal_id: string; portfolio_id: string; status: 'PROPOSED' | 'FAILED' | 'APPROVED' | 'REJECTED'; created_at: string; drift_before: number; drift_after: number
  total_fees: number; total_volume: number; approval_level: 'STANDARD' | 'SENIOR'; warnings: Reason[]; failure_reasons: Reason[]
  before_alloc: DriftRow[]; after_alloc: DriftRow[]; trades?: TradeRow[]
}
export interface ProposalDetail extends ProposalRow {
  approvals: { decision: string; actor: string; role: string; note: string | null; decided_at: string }[]
  decision?: string; notes?: string[]; skipped?: { asset_class?: string; instrument_id?: string; reason: string; amount: number }[]
}
export interface PortfolioDetail {
  portfolio_id: string; investor_id: string; risk_category: string; cash: number; total_value: number; as_of: string
  drift: DriftRow[]; drift_summary: { mean: number; max: number }
  concentration: { hhi: number; top_holding_pct: number; holdings: number }
  price_issues: HoldingRow[]; violations: Violation[]; holdings: HoldingRow[]; proposals: ProposalRow[]
  history: { event_type: string; actor: string; created_at: string; payload: Record<string, unknown> }[]
}
export interface Simulation {
  proposal_id: string; before: DriftRow[]; after: DriftRow[]; trades: TradeRow[]; issues: Issue[]
  compliance_status: 'COMPLIANT' | 'COMPLIANT_WITH_WARNINGS' | 'NON_COMPLIANT'; total_volume: number; total_fees: number; cash_remaining: number
  drift_before: { mean: number; max: number }; drift_after: { mean: number; max: number }; effectiveness_pct: number
}
export interface ConstraintRow { constraint_id: string; name: string; value: string; scope: string; severity: string; description: string; effective_from: string }
export interface PolicyViolation { portfolio_id: string; risk_category: string; code: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; message: string; resolution: string; approval_required: boolean }
export interface PolicyViolations { items: PolicyViolation[]; total: number; page: number; page_size: number; by_severity: Record<string, number>; by_code: Record<string, number> }
export interface AuditEvent { event_id: number; event_type: string; entity_type: string; entity_id: string; portfolio_id: string | null; actor: string; payload: Record<string, unknown>; created_at: string }
export interface Check { id: string; name: string; category: string; status: 'PASS' | 'WARN' | 'FAIL'; checked: number; failed: number; detail: string }
export interface ValidationReport { checks: Check[]; pass_rate: number; generated_at: string }
export interface Metric { id: string; name: string; value: number | null; unit: string; formula: string }
export interface AnomalyCase {
  case_id: string; portfolio_id: string; issue_type: string; ground_truth: string; expected_decision: string; expected_code: string | null
  actual_decision: string; actual_codes: string; passed: boolean; explanation: string
}
