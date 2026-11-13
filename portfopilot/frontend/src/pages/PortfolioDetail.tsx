import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Scale } from 'lucide-react'
import { api } from '../services/api'
import { useApi } from '../hooks/useApi'
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, PageHeader, Skeleton, Stat, Tabs, statusTone, type Column } from '../components/ui'
import { CurrentVsTarget } from '../charts/charts'
import { DriftTable } from '../components/shared'
import type { HoldingRow, ProposalRow, PortfolioDetail as PD } from '../types/api'
import { dateTime, money, num, pct, pp, shortDate, titleCase } from '../utils/format'

export default function PortfolioDetail() {
  const { id = '' } = useParams(); const nav = useNavigate()
  const { data, error, loading, reload } = useApi(() => api.portfolio(id), [id])
  const [tab, setTab] = useState('allocation'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  if (error) return <><Link to="/portfolios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white"><ArrowLeft className="h-4 w-4" />Portfolios</Link><ErrorState error={error} onRetry={reload} /></>
  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-28" /><Skeleton className="h-72" /></div>
  const d: PD = data

  const generate = async () => {
    setBusy(true); setErr('')
    try { const p = await api.generate(id); nav(`/rebalance?proposal=${p.proposal_id}`) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const hcols: Column<HoldingRow>[] = [
    { key: 'i', header: 'Instrument', render: (h) => <div><div className="font-medium text-white">{h.symbol}</div><div className="text-xs text-faint">{h.instrument_id}</div></div> },
    { key: 'c', header: 'Class', render: (h) => h.asset_class },
    { key: 'l', header: 'Liquidity', render: (h) => <Badge tone={h.liquidity_tier === 'High' ? 'emerald' : h.liquidity_tier === 'Medium' ? 'blue' : 'amber'}>{h.liquidity_tier}</Badge> },
    { key: 'q', header: 'Quantity', align: 'right', render: (h) => num(h.quantity) },
    { key: 'p', header: 'Price', align: 'right', render: (h) => (h.price == null ? '—' : money(h.price, 2)) },
    { key: 'pd', header: 'Price date', render: (h) => shortDate(h.price_date) },
    { key: 'v', header: 'Market value', align: 'right', render: (h) => money(h.market_value) },
    { key: 'w', header: 'Weight', align: 'right', render: (h) => pct(h.weight, 2) },
    { key: 's', header: 'Flags', render: (h) => <span className="flex gap-1">{h.price_status !== 'OK' && <Badge tone={statusTone(h.price_status)}>{h.price_status}</Badge>}{h.restricted && <Badge tone="red">Restricted</Badge>}{h.price_status === 'OK' && !h.restricted && <span className="text-faint">—</span>}</span> },
  ]
  const pcols: Column<ProposalRow>[] = [
    { key: 'id', header: 'Proposal', render: (p) => <Link className="text-teal-300 hover:underline" to={`/rebalance?proposal=${p.proposal_id}`}>{p.proposal_id}</Link> },
    { key: 's', header: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
    { key: 'd', header: 'Drift', align: 'right', render: (p) => `${p.drift_before.toFixed(2)} → ${p.drift_after.toFixed(2)} pp` },
    { key: 'f', header: 'Fees', align: 'right', render: (p) => money(p.total_fees, 2) },
    { key: 'c', header: 'Created', render: (p) => dateTime(p.created_at) },
  ]
  return (
    <>
      <Link to="/portfolios" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-white"><ArrowLeft className="h-4 w-4" />Portfolios</Link>
      <PageHeader title={d.portfolio_id} subtitle={`Investor ${d.investor_id} · ${d.risk_category} mandate · valued as of ${shortDate(d.as_of)}`}
        actions={<><Badge tone="blue">{d.risk_category}</Badge><Button variant="primary" loading={busy} onClick={generate}><Scale className="h-4 w-4" />Generate rebalance</Button></>} />
      {err && <div role="alert" className="mb-4 text-sm text-red-300">{err}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Portfolio value" value={money(d.total_value)} hint={`Cash ${money(d.cash)}`} />
        <Stat label="Mean drift" value={`${d.drift_summary.mean.toFixed(2)} pp`} tone="blue" delay={0.04} />
        <Stat label="Max class drift" value={`${d.drift_summary.max.toFixed(2)} pp`} tone={d.drift_summary.max > 5 ? 'amber' : 'teal'} delay={0.08} />
        <Stat label="Concentration (HHI)" value={d.concentration.hhi.toFixed(3)} hint={`Top holding ${pct(d.concentration.top_holding_pct, 1)}`} delay={0.12} />
        <Stat label="Open violations" value={d.violations.length} tone={d.violations.length ? 'red' : 'teal'} hint={`${d.price_issues.length} price issue(s)`} delay={0.16} />
      </div>
      <div className="mt-6">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'allocation', label: 'Allocation & drift' }, { id: 'holdings', label: `Holdings (${d.holdings.length})` }, { id: 'risk', label: 'Risk & policy' }, { id: 'history', label: 'History' }]} />
        {tab === 'allocation' && <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader title="Current vs. target allocation" subtitle="Weight = market value ÷ total portfolio value × 100" /><div className="p-4"><CurrentVsTarget rows={d.drift} /></div></Card>
          <Card><CardHeader title="Allocation differences" subtitle="Drift = current weight − target weight" /><DriftTable rows={d.drift} /></Card>
        </div>}
        {tab === 'holdings' && <Card><CardHeader title="Holdings" subtitle="Valued at each instrument's latest available price" /><DataTable columns={hcols} rows={d.holdings} rowKey={(h) => h.instrument_id} /></Card>}
        {tab === 'risk' && <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader title="Policy violations" subtitle="Severity, description and recommended resolution" />
            {d.violations.length ? <ul className="divide-y divide-line/50">{d.violations.map((v, i) => <li key={i} className="px-5 py-3 text-sm"><div className="flex items-center gap-2"><Badge tone={statusTone(v.severity)}>{v.severity}</Badge><span className="font-medium text-white">{titleCase(v.code)}</span>{v.approval_required && <Badge tone="amber">Approval required</Badge>}</div>
              <p className="mt-1 text-slate-300">{v.message}</p><p className="mt-0.5 text-xs text-muted">Resolution: {v.resolution}</p></li>)}</ul> : <EmptyState title="No active violations" hint="This portfolio is compliant with all policies." />}</Card>
          <Card><CardHeader title="Missing / stale market prices" />{d.price_issues.length ? <DataTable columns={hcols.slice(0, 1).concat(hcols.slice(4, 6), hcols.slice(8, 9))} rows={d.price_issues} rowKey={(h) => h.instrument_id} /> : <EmptyState title="All holdings priced within the freshness window" />}</Card>
        </div>}
        {tab === 'history' && <div className="grid gap-4 xl:grid-cols-2">
          <Card><CardHeader title="Rebalance proposals" /><DataTable columns={pcols} rows={d.proposals} rowKey={(p) => p.proposal_id} empty="No proposals yet for this portfolio" /></Card>
          <Card><CardHeader title="Audit trail" subtitle="Most recent events (append-only)" />{d.history.length ? <ul className="divide-y divide-line/50">{d.history.map((e, i) => <li key={i} className="flex items-center justify-between px-5 py-3 text-sm"><div><Badge tone="teal">{titleCase(e.event_type)}</Badge><span className="ml-2 text-xs text-muted">{e.actor}</span></div><span className="num text-xs text-faint">{dateTime(e.created_at)}</span></li>)}</ul> : <EmptyState title="No events" />}</Card>
        </div>}
      </div>
      <p className="mt-6 text-xs text-faint">Drift deltas: {d.drift.map((r) => `${r.asset_class} ${pp(r.drift)}`).join(' · ')}</p>
    </>
  )
}
