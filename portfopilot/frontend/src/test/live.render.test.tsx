// Renders every page against the real backend (LIVE_API=1) and asserts real data appears.
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { api } from '../services/api'

const live = import.meta.env.VITE_LIVE_API === '1'
const at = (p: string) => render(<MemoryRouter initialEntries={[p]}><App /></MemoryRouter>)
const T = { timeout: 15000 }

describe.skipIf(!live)('pages rendered with live API data', () => {
  it('Dashboard KPIs equal API values', async () => {
    const d = await api.dashboard(); at('/')
    expect(await screen.findByText(String(d.portfolio_count), {}, T)).toBeInTheDocument()
    expect(screen.getByText(`${d.avg_drift.toFixed(2)} pp`)).toBeInTheDocument()
    expect(screen.getByText(String(d.needs_rebalance))).toBeInTheDocument()
  })
  it('Portfolios table shows API rows; row click opens detail', async () => {
    const l = await api.portfolios({ page_size: 20 }); at('/portfolios')
    fireEvent.click(await screen.findByText(l.items[0].portfolio_id, {}, T))
    expect(await screen.findByText(/Generate rebalance/, {}, T)).toBeInTheDocument()
    expect(screen.getByText(/Allocation & drift/)).toBeInTheDocument()
  })
  it('Policy lists real violations and constraints', async () => {
    const v = await api.violations({ page_size: 15 }); at('/policy')
    expect(await screen.findByText('Policy configuration', {}, T)).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(v.items[0].resolution).length).toBeGreaterThan(0), T)
  })
  it('Data Quality, Analytics and Audit render live content', async () => {
    const dq = at('/data-quality'); expect(await screen.findByText('Primary key uniqueness', {}, T)).toBeInTheDocument(); dq.unmount()
    const an = at('/analytics'); expect(await screen.findByText('Policy compliance rate', {}, T)).toBeInTheDocument(); expect(await screen.findByText('Ground-truth evaluation')).toBeInTheDocument(); an.unmount()
    at('/audit'); expect((await screen.findAllByText(/Portfolio Created|Rebalance Generated|Holdings Updated/, {}, T)).length).toBeGreaterThan(0)
  }, 40000)
})
