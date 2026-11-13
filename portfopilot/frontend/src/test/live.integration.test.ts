// Runs against a real backend only when LIVE_API=1 (see README: `npm run test:live`).
import { api } from '../services/api'

const live = import.meta.env.VITE_LIVE_API === '1'
describe.skipIf(!live)('live API integration (frontend service layer → FastAPI)', () => {
  it('dashboard returns real, internally consistent data', async () => {
    const d = await api.dashboard()
    expect(d.portfolio_count).toBeGreaterThan(0); expect(d.aum).toBeGreaterThan(0)
    expect(Math.abs(d.allocation.reduce((a, x) => a + x.weight, 0) - 100)).toBeLessThan(0.1)
    expect(d.performance.length).toBeGreaterThan(10)
    const narrowed = await api.dashboard(d.performance[d.performance.length - 6].date)
    expect(narrowed.performance.length).toBeLessThan(d.performance.length)
  })
  it('portfolio list, detail, holdings and allocation agree', async () => {
    const list = await api.portfolios({ page_size: 5, sort: 'drift_max', desc: true })
    const id = list.items[0].portfolio_id
    const [d, h, a] = await Promise.all([api.portfolio(id), api.holdings(id), api.allocation(id)])
    expect(d.holdings.length).toBe(h.length); expect(a.weights_reconcile).toBe(true)
    expect(Math.abs(a.rows.reduce((s, r) => s + r.current, 0) - 100)).toBeLessThan(0.01)
    await expect(api.portfolio('PORT-INV-999999-01')).rejects.toMatchObject({ status: 404 })
  })
  it('generate → simulate → approve/reject workflow', async () => {
    const cands = await api.portfolios({ needs_rebalance: true, page_size: 30 })
    let prop = null
    for (const c of cands.items) { const p = await api.generate(c.portfolio_id, 'vitest'); if (p.status === 'PROPOSED' && p.trades && p.trades.length) { prop = p; break } }
    expect(prop).not.toBeNull()
    const sim = await api.simulate(prop!.proposal_id)
    expect(sim.drift_after.mean).toBeLessThan(sim.drift_before.mean); expect(sim.cash_remaining).toBeGreaterThanOrEqual(0)
    const bad = await api.simulate(prop!.proposal_id, [{ instrument_id: prop!.trades![0].instrument_id, side: 'SELL', quantity: 999999999 }])
    expect(bad.compliance_status).toBe('NON_COMPLIANT')
    const done = await api.reject(prop!.proposal_id, { actor: 'vitest', role: 'senior', note: 'integration test' })
    expect(done.status).toBe('REJECTED')
    await expect(api.approve(prop!.proposal_id, { actor: 'vitest', role: 'senior' })).rejects.toMatchObject({ status: 409 })
    const ev = await api.audit({ event_type: 'TRADE_REJECTED', page_size: 5 }); expect(ev.total).toBeGreaterThan(0)
  })
  it('policy, validation, analytics and ground truth endpoints are populated', async () => {
    const [c, v, val, m, gt] = await Promise.all([api.constraints(), api.violations({ page_size: 5 }), api.validation(), api.metrics(), api.anomalies()])
    expect(c.length).toBeGreaterThanOrEqual(7); expect(v.total).toBeGreaterThan(0); expect(val.checks.length).toBeGreaterThanOrEqual(12)
    expect(m.metrics.length).toBe(10); expect(m.metrics.every((x) => x.formula.length > 10)).toBe(true)
    expect(gt.length).toBeGreaterThan(0); expect(gt.every((x) => x.passed)).toBe(true)
  })
})
