import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../services/api'
import { useApi, useDebounced } from '../hooks/useApi'
import { Badge, Card, DataTable, ErrorState, PageHeader, Pagination, inputCls, statusTone, type Column } from '../components/ui'
import type { PortfolioRow } from '../types/api'
import { money, pp, shortDate, titleCase } from '../utils/format'

const RISKS = ['Conservative', 'Moderate', 'Balanced', 'Growth', 'Aggressive']

export default function Portfolios() {
  const nav = useNavigate()
  const [q, setQ] = useState(''); const [risk, setRisk] = useState(''); const [flag, setFlag] = useState('')
  const [sort, setSort] = useState('portfolio_id'); const [desc, setDesc] = useState(false); const [page, setPage] = useState(1)
  const dq = useDebounced(q)
  const { data, error, loading, reload } = useApi(() => api.portfolios({ q: dq || undefined, risk: risk || undefined, needs_rebalance: flag === '' ? undefined : flag === 'yes', sort, desc, page, page_size: 20 }), [dq, risk, flag, sort, desc, page])

  const head = (label: string, key: string) => (
    <button className="uppercase tracking-wider hover:text-white" onClick={() => { if (sort === key) setDesc(!desc); else { setSort(key); setDesc(false) } setPage(1) }}>{label}{sort === key ? (desc ? ' ↓' : ' ↑') : ''}</button>)
  const cols: Column<PortfolioRow>[] = [
    { key: 'id', header: head('Portfolio ID', 'portfolio_id'), render: (r) => <span className="font-medium text-teal-300">{r.portfolio_id}</span> },
    { key: 'inv', header: 'Investor ID', render: (r) => r.investor_id },
    { key: 'risk', header: 'Risk', render: (r) => <Badge tone="blue">{r.risk_category}</Badge> },
    { key: 'val', header: head('Value', 'total_value'), align: 'right', render: (r) => money(r.total_value) },
    { key: 'h', header: 'Holdings', align: 'right', render: (r) => r.holdings_count },
    { key: 'd', header: head('Drift (max)', 'drift_max'), align: 'right', render: (r) => <span className={r.needs_rebalance ? 'text-amber-300' : ''}>{pp(r.drift_max, 2).replace('+', '')}</span> },
    { key: 'v', header: head('Violations', 'violation_count'), align: 'right', render: (r) => r.violation_count || <span className="text-faint">0</span> },
    { key: 's', header: 'Status', render: (r) => <Badge tone={statusTone(r.rebalance_status)}>{titleCase(r.rebalance_status)}</Badge> },
    { key: 'u', header: 'Updated', render: (r) => shortDate(r.updated_on) },
  ]
  return (
    <>
      <PageHeader title="Portfolio Management" subtitle="Search, filter and open any portfolio to inspect holdings, targets, drift and history." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line/70 p-4">
          <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
            <input aria-label="Search portfolios" className={`${inputCls} pl-9`} placeholder="Search by portfolio or investor ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} /></div>
          <select aria-label="Risk category" className={`${inputCls} !w-44`} value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1) }}><option value="">All risk categories</option>{RISKS.map((r) => <option key={r}>{r}</option>)}</select>
          <select aria-label="Rebalance filter" className={`${inputCls} !w-48`} value={flag} onChange={(e) => { setFlag(e.target.value); setPage(1) }}><option value="">All statuses</option><option value="yes">Needs rebalancing</option><option value="no">Within tolerance</option></select>
        </div>
        {error ? <div className="p-6"><ErrorState error={error} onRetry={reload} /></div> :
          <><DataTable columns={cols} rows={data?.items ?? []} rowKey={(r) => r.portfolio_id} loading={loading} onRowClick={(r) => nav(`/portfolios/${r.portfolio_id}`)} empty="No portfolios match these filters" />
            {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}</>}
      </Card>
    </>
  )
}
