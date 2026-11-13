import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertOctagon, Banknote, Briefcase, Gauge, Scale, ShieldAlert } from 'lucide-react'
import { api } from '../services/api'
import { useApi } from '../hooks/useApi'
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, PageHeader, Skeleton, Stat, inputCls, statusTone } from '../components/ui'
import { AllocationDonut, PerformanceArea, SimpleBars } from '../charts/charts'
import { CLASS_COLORS, compactMoney, dateTime, money, num, pct, shortDate, titleCase } from '../utils/format'

const addDays = (iso: string, d: number) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }

export default function Dashboard() {
  const [start, setStart] = useState(''); const [end, setEnd] = useState('')
  const bounds = useRef<{ first: string; last: string } | null>(null)
  const { data, error, loading, reload } = useApi(async () => {
    const d = await api.dashboard(start || undefined, end || undefined)
    if (!bounds.current && d.performance.length) bounds.current = { first: d.performance[0].date, last: d.performance[d.performance.length - 1].date }
    return d
  }, [start, end])

  if (error && !data) return <ErrorState error={error} onRetry={reload} />
  const preset = (days: number | null) => { const b = bounds.current; if (!b) return; setEnd(''); setStart(days ? addDays(b.last, -days) : '') }
  const perf = data?.performance ?? []
  const change = perf.length > 1 ? (perf[perf.length - 1].aum / perf[0].aum - 1) * 100 : null

  return (
    <>
      <PageHeader title="Executive Dashboard" subtitle="Firm-wide view of assets, allocation drift, policy exposure and rebalancing activity."
        actions={<Link to="/rebalance"><Button variant="primary"><Scale className="h-4 w-4" />Rebalancing workbench</Button></Link>} />
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Stat label="Assets under mgmt" value={compactMoney(data.aum)} hint={money(data.aum)} icon={<Banknote className="h-4 w-4" />} />
          <Stat label="Portfolios" value={num(data.portfolio_count)} hint="Active mandates" icon={<Briefcase className="h-4 w-4" />} delay={0.04} />
          <Stat label="Avg drift" value={`${data.avg_drift.toFixed(2)} pp`} hint="Mean |current − target|" icon={<Gauge className="h-4 w-4" />} delay={0.08} tone="blue" />
          <Stat label="Need rebalancing" value={num(data.needs_rebalance)} hint={`Class drift > ±${data.policy.max_drift}pp`} icon={<Scale className="h-4 w-4" />} delay={0.12} tone="amber" />
          <Stat label="Policy violations" value={num(data.policy_violations)} hint={<Link className="text-teal-300 hover:underline" to="/policy">Review exceptions →</Link>} icon={<ShieldAlert className="h-4 w-4" />} delay={0.16} tone="red" />
          <Stat label="Est. fees pending" value={money(data.estimated_fees_pending)} hint="Open proposals" icon={<Banknote className="h-4 w-4" />} delay={0.2} />
        </div>
      )}

      {data && (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Portfolio performance overview" subtitle={change != null ? `Aggregate AUM, current holdings repriced daily · ${change >= 0 ? '+' : ''}${change.toFixed(2)}% over window` : 'Aggregate AUM'}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {[['1M', 30], ['3M', 90], ['All', null]].map(([l, d]) => <Button key={String(l)} size="sm" variant="ghost" onClick={() => preset(d as number | null)}>{l}</Button>)}
                  <input aria-label="Start date" type="date" className={`${inputCls} !h-8 !w-36 text-xs`} value={start} min={bounds.current?.first} max={bounds.current?.last} onChange={(e) => setStart(e.target.value)} />
                  <input aria-label="End date" type="date" className={`${inputCls} !h-8 !w-36 text-xs`} value={end} min={bounds.current?.first} max={bounds.current?.last} onChange={(e) => setEnd(e.target.value)} />
                </div>} />
            <div className="p-4">{perf.length ? <PerformanceArea data={perf} /> : <EmptyState title="No price history in this window" />}</div>
          </Card>
          <Card>
            <CardHeader title="Asset-class allocation" subtitle="Aggregate current weights vs. mandate targets" />
            <div className="p-4"><AllocationDonut data={data.allocation} />
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.allocation.map((a) => (
                  <li key={a.asset_class} className="flex items-center justify-between"><span className="flex items-center gap-2 text-slate-300"><i className="h-2 w-2 rounded-full" style={{ background: CLASS_COLORS[a.asset_class] }} />{a.asset_class}</span>
                    <span className="num text-slate-200">{pct(a.weight, 1)} <span className="text-faint">/ {pct(a.target, 1)}</span></span></li>))}
              </ul></div>
          </Card>
          <Card>
            <CardHeader title="Portfolio risk distribution" subtitle="Portfolios by investor risk category" />
            <div className="p-4"><SimpleBars data={data.risk_distribution} x="risk_category" bars={[{ key: 'portfolios', name: 'Portfolios', color: '#14B8A6' }]} /></div>
          </Card>
          <Card>
            <CardHeader title="Recent rebalance activity" action={<Link to="/audit" className="text-xs text-teal-300 hover:underline">Full history</Link>} />
            {data.recent_activity.length ? <ul className="divide-y divide-line/50">
              {data.recent_activity.map((e) => (
                <li key={e.event_id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div><Badge tone={e.event_type.includes('REJECT') ? 'red' : e.event_type.includes('APPROVED') ? 'emerald' : 'blue'}>{titleCase(e.event_type)}</Badge>
                    <div className="mt-1 text-xs text-muted">{e.entity_id} · {e.actor}</div></div>
                  <span className="num text-xs text-faint">{dateTime(e.created_at)}</span></li>))}
            </ul> : <EmptyState title="No rebalance activity yet" />}
          </Card>
          <Card>
            <CardHeader title="Critical exceptions" subtitle="Restricted holdings, missing prices, 2× drift breaches" />
            <DataTable rows={data.critical_exceptions} rowKey={(r) => r.portfolio_id} empty="No critical exceptions"
              columns={[
                { key: 'p', header: 'Portfolio', render: (r) => <Link className="text-teal-300 hover:underline" to={`/portfolios/${r.portfolio_id}`}>{r.portfolio_id.replace('PORT-INV-', '')}</Link> },
                { key: 'd', header: 'Max drift', align: 'right', render: (r) => `${r.drift_max.toFixed(1)} pp` },
                { key: 'x', header: 'Flags', render: (r) => <span className="flex flex-wrap gap-1">{r.restricted_held > 0 && <Badge tone="red">Restricted</Badge>}{r.missing_prices > 0 && <Badge tone="red">No price</Badge>}{!r.weights_ok && <Badge tone="red">Weights</Badge>}{r.drift_max > data.policy.max_drift * 2 && <Badge tone="amber">Drift 2×</Badge>}</span> },
              ]} />
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader title="Risk-category summary" subtitle={`As of ${shortDate(perf[perf.length - 1]?.date)}`} />
            <DataTable rows={data.risk_distribution} rowKey={(r) => r.risk_category}
              columns={[{ key: 'r', header: 'Risk category', render: (r) => <Badge tone={statusTone('')}>{r.risk_category}</Badge> }, { key: 'n', header: 'Portfolios', align: 'right', render: (r) => num(r.portfolios) },
                { key: 'a', header: 'AUM', align: 'right', render: (r) => compactMoney(r.aum) }, { key: 'd', header: 'Avg drift', align: 'right', render: (r) => `${r.avg_drift.toFixed(2)} pp` }]} />
          </Card>
        </div>
      )}
      {error && data && <div className="mt-4 flex items-center gap-2 text-xs text-red-300"><AlertOctagon className="h-4 w-4" />{error.message}</div>}
    </>
  )
}
