import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../services/api'
import { useApi, useDebounced } from '../hooks/useApi'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, inputCls } from '../components/ui'
import { dateTime, titleCase } from '../utils/format'

const TYPES = ['PORTFOLIO_CREATED', 'HOLDINGS_UPDATED', 'MARKET_PRICE_UPDATED', 'REBALANCE_GENERATED', 'TRADE_PROPOSED', 'TRADE_APPROVED', 'TRADE_REJECTED', 'POLICY_VIOLATION_DETECTED', 'SIMULATION_RUN', 'CONSTRAINT_UPDATED']
const tone = (t: string) => (t.includes('REJECT') || t.includes('VIOLATION') ? 'red' : t.includes('APPROVED') ? 'emerald' : t.includes('REBALANCE') || t.includes('PROPOSED') ? 'blue' : t.includes('CONSTRAINT') ? 'amber' : 'teal') as 'red' | 'emerald' | 'blue' | 'amber' | 'teal'

export default function Audit() {
  const [type, setType] = useState(''); const [pf, setPf] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState<number | null>(null)
  const dpf = useDebounced(pf)
  const { data, error, loading, reload } = useApi(() => api.audit({ event_type: type || undefined, portfolio_id: dpf || undefined, page, page_size: 20 }), [type, dpf, page])
  return (
    <>
      <PageHeader title="Audit & Event History" subtitle="Append-only record of portfolio, pricing, proposal and approval events. Database triggers block edits and deletes." />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line/70 p-4">
          <select aria-label="Event type" className={`${inputCls} !w-64`} value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}><option value="">All event types</option>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select>
          <input aria-label="Portfolio filter" className={`${inputCls} !w-64`} placeholder="Filter by portfolio ID" value={pf} onChange={(e) => { setPf(e.target.value); setPage(1) }} />
        </div>
        {error ? <div className="p-6"><ErrorState error={error} onRetry={reload} /></div> : loading && !data ? <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div> :
          !data?.items.length ? <EmptyState title="No events match" /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-max text-sm"><thead><tr className="border-b border-line/70 text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="w-8" /><th className="px-4 py-2.5">Event</th><th className="px-4 py-2.5">Entity</th><th className="px-4 py-2.5">Portfolio</th><th className="px-4 py-2.5">Actor</th><th className="px-4 py-2.5 text-right">Time</th></tr></thead>
              <tbody>{data.items.map((e) => (
                <Fragment key={e.event_id}>
                  <tr className="cursor-pointer border-b border-line/40 hover:bg-raised/70" onClick={() => setOpen(open === e.event_id ? null : e.event_id)}>
                    <td className="pl-4 text-faint">{open === e.event_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="px-4 py-3"><Badge tone={tone(e.event_type)}>{titleCase(e.event_type)}</Badge></td><td className="px-4 py-3 text-slate-300">{e.entity_id}</td>
                    <td className="px-4 py-3 text-slate-300">{e.portfolio_id ?? '—'}</td><td className="px-4 py-3 text-slate-300">{e.actor}</td><td className="num px-4 py-3 text-right text-muted">{dateTime(e.created_at)}</td></tr>
                  {open === e.event_id && <tr className="border-b border-line/40 bg-bg/40"><td /><td colSpan={5} className="px-4 py-3"><pre className="overflow-x-auto text-xs text-muted">{JSON.stringify(e.payload, null, 2)}</pre></td></tr>}
                </Fragment>))}</tbody></table></div>)}
        {data && <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />}
      </Card>
    </>
  )
}
