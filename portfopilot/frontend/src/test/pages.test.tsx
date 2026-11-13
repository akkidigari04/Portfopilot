import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { NAV } from '../layouts/AppLayout'

const drift = (d: number) => ['Equity', 'Fixed Income', 'Real Estate', 'Commodities', 'Alternatives', 'Cash'].map((c, i) => ({ asset_class: c, market_value: 1000, current: 10 + (i ? 0 : d), target: 10, drift: i ? 0 : d, abs_drift: i ? 0 : Math.abs(d) }))
const summary = { aum: 2_400_000_000, portfolio_count: 1000, avg_drift: 3.21, needs_rebalance: 412, policy_violations: 530, estimated_fees_pending: 18250,
  risk_distribution: [{ risk_category: 'Balanced', portfolios: 250, aum: 6e8, avg_drift: 3.1 }], allocation: [{ asset_class: 'Equity', weight: 52, target: 50, value: 1e9 }],
  performance: [{ date: '2026-10-01', aum: 1, indexed: 100 }, { date: '2026-10-02', aum: 2, indexed: 101 }], recent_activity: [], critical_exceptions: [], policy: { max_drift: 5 } }
const route = (url: string, init?: RequestInit) => {
  if (url.startsWith('/api/dashboard')) return summary
  if (url.startsWith('/api/portfolios')) return { items: [{ portfolio_id: 'PORT-INV-000001-01', investor_id: 'INV-000001', risk_category: 'Growth', total_value: 750000, holdings_count: 5, drift_mean: 2, drift_max: 7, violation_count: 1, rebalance_status: 'REBALANCE_REQUIRED', needs_rebalance: true, updated_on: '2026-10-22' }], total: 1, page: 1, page_size: 20 }
  if (url.startsWith('/api/constraints/')) return { old: '500', new: '750' }
  if (url.startsWith('/api/constraints')) return [{ constraint_id: 'CON-002', name: 'MIN_TRADE', value: '500', scope: 'GLOBAL', severity: 'LOW', description: 'Minimum order', effective_from: '2026-01-01' }]
  if (url.startsWith('/api/policy')) return { items: [{ portfolio_id: 'PORT-INV-000001-01', risk_category: 'Growth', code: 'RESTRICTED_HOLDING', severity: 'HIGH', message: '1 restricted', resolution: 'Escalate', approval_required: true }], total: 1, page: 1, page_size: 15, by_severity: { HIGH: 1 }, by_code: { RESTRICTED_HOLDING: 1 } }
  if (url.includes('/simulate')) return { proposal_id: 'RB-2026-000001', before: drift(8), after: drift(1), trades: [{ instrument_id: 'INS-000009', side: 'SELL', quantity: 10, price: 50, notional: 500, fee: 1 }], issues: [], compliance_status: 'COMPLIANT', total_volume: 500, total_fees: 1, cash_remaining: 1234, drift_before: { mean: 2, max: 8 }, drift_after: { mean: 0.5, max: 1 }, effectiveness_pct: 75 }
  if (url.startsWith('/api/rebalance/proposals')) return { items: [{ proposal_id: 'RB-2026-000001', portfolio_id: 'PORT-INV-000001-01', status: 'PROPOSED' }], total: 1, page: 1, page_size: 100 }
  if (url.startsWith('/api/rebalance/RB')) return { proposal_id: 'RB-2026-000001', portfolio_id: 'PORT-INV-000001-01', status: 'PROPOSED', trades: [], approvals: [], created_at: '2026-10-22T08:00:00', before_alloc: drift(8), after_alloc: drift(1), warnings: [], failure_reasons: [], approval_level: 'STANDARD', drift_before: 2, drift_after: 0.5, total_fees: 1, total_volume: 500 }
  if (url.includes('/holdings')) return []
  if (url.startsWith('/api/validation')) return { checks: [{ id: 'PK-001', name: 'Primary key uniqueness', category: 'Keys', status: 'PASS', checked: 10, failed: 0, detail: '' }, { id: 'STL-001', name: 'Stale prices', category: 'Market data', status: 'WARN', checked: 10, failed: 3, detail: '' }], pass_rate: 50, generated_at: '2026-10-22T00:00:00Z' }
  if (url.startsWith('/api/analytics/metrics')) return { metrics: [{ id: 'x', name: 'Policy compliance rate', value: 61.5, unit: '%', formula: 'Compliant ÷ all' }] }
  if (url.startsWith('/api/analytics/anomalies')) return []
  if (url.startsWith('/api/audit')) return { items: [], total: 0, page: 1, page_size: 20 }
  void init; return {}
}
beforeEach(() => { vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => Promise.resolve({ ok: true, status: 200, json: async () => route(url, init) }))) })
afterEach(() => vi.unstubAllGlobals())
const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)

describe('pages (mocked API)', () => {
  it('Dashboard shows API-driven KPIs', async () => {
    at('/'); expect(await screen.findByText('$2.40B')).toBeInTheDocument(); expect(screen.getByText('412')).toBeInTheDocument(); expect(screen.getByText('530')).toBeInTheDocument()
  })
  it('Portfolios lists rows and sends search to the API', async () => {
    at('/portfolios'); expect(await screen.findByText('PORT-INV-000001-01')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search portfolios'), { target: { value: 'INV-000001' } })
    await waitFor(() => expect((fetch as unknown as { mock: { calls: string[][] } }).mock.calls.some((c) => c[0].includes('q=INV-000001'))).toBe(true))
  })
  it('Policy edits a constraint through the API', async () => {
    at('/policy'); fireEvent.click(await screen.findByLabelText('Edit MIN_TRADE'))
    fireEvent.change(screen.getByLabelText('Edit MIN_TRADE'), { target: { value: '750' } }); fireEvent.click(screen.getByLabelText('Save'))
    expect(await screen.findByRole('status')).toHaveTextContent('500 → 750')
  })
  it('Simulation Studio runs a simulation and shows compliance', async () => {
    at('/simulation?proposal=RB-2026-000001'); const btn = await screen.findByText('Run simulation'); await waitFor(() => expect(btn.closest('button')).not.toBeDisabled())
    fireEvent.click(btn); expect(await screen.findByText(/Policy compliance: Compliant/)).toBeInTheDocument(); expect(screen.getByText('75.0%')).toBeInTheDocument()
  })
  it('Data Quality shows checks and export link', async () => {
    at('/data-quality'); expect(await screen.findByText('Primary key uniqueness')).toBeInTheDocument(); expect(screen.getByText('Export CSV').closest('a')).toHaveAttribute('href', '/api/validation/report?format=csv')
  })
  it('Analytics shows formula for each metric', async () => { at('/analytics'); expect(await screen.findByText('61.5%')).toBeInTheDocument(); expect(screen.getByText(/Compliant ÷ all/)).toBeInTheDocument() })
  it('sidebar links to every module', async () => {
    at('/'); await screen.findByText('$2.40B')
    for (const n of NAV) expect(screen.getAllByText(n.label).some((el) => el.closest('a')?.getAttribute('href') === n.to)).toBe(true)
    expect(NAV).toHaveLength(8)
  })
  it('shows an error state when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x'))); at('/audit'); expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach/)
  })
})
