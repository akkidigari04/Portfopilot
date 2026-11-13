import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, FlaskConical, Scale, XCircle } from 'lucide-react'
import { api } from '../services/api'
import { useApi } from '../hooks/useApi'
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Field, Notice, PageHeader, Pagination, Skeleton, Stat, inputCls, statusTone, type Column } from '../components/ui'
import { DriftCompare } from '../charts/charts'
import { DriftTable, PortfolioLink, Reasons, TradesTable } from '../components/shared'
import type { ProposalDetail, ProposalRow } from '../types/api'
import { dateTime, money, pp } from '../utils/format'

export default function Rebalance() {
  const [sp, setSp] = useSearchParams(); const pid = sp.get('proposal')
  const [portfolio, setPortfolio] = useState(sp.get('portfolio') ?? ''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [fresh, setFresh] = useState<ProposalDetail | null>(null)
  const [actor, setActor] = useState('j.marsh'); const [role, setRole] = useState<'analyst' | 'senior'>('analyst'); const [note, setNote] = useState(''); const [acting, setActing] = useState('')

  const list = useApi(() => api.proposals({ status: status || undefined, page, page_size: 8 }), [status, page])
  const cand = useApi(() => api.portfolios({ needs_rebalance: true, sort: 'drift_max', desc: true, page_size: 40 }), [])
  const det = useApi(() => (pid ? api.proposal(pid) : Promise.resolve(null)), [pid])

  const generate = async () => {
    setBusy(true); setErr('')
    try { const p = await api.generate(portfolio.trim(), actor); setFresh(p); setSp({ proposal: p.proposal_id }); list.reload() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const decide = async (kind: 'approve' | 'reject') => {
    if (!pid) return
    setActing(kind); setErr('')
    try { await api[kind](pid, { actor, role, note: note || undefined }); setNote(''); det.reload(); list.reload() } catch (e) { setErr((e as Error).message) } finally { setActing('') }
  }
  const p = det.data ? { ...det.data, notes: fresh?.proposal_id === pid ? fresh.notes : undefined, skipped: fresh?.proposal_id === pid ? fresh.skipped : undefined } as ProposalDetail : null
  const lcols: Column<ProposalRow>[] = [
    { key: 'id', header: 'Proposal', render: (r) => <span className="font-medium text-teal-300">{r.proposal_id}</span> },
    { key: 'p', header: 'Portfolio', render: (r) => r.portfolio_id.replace('PORT-INV-', '') },
    { key: 's', header: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
  ]

  return (
    <>
      <PageHeader title="Rebalancing Engine" subtitle="Deterministic, constraint-aware recommendations. Every proposal retains its trades, warnings and failure reasons." />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Generate recommendation" subtitle="Runs the rule-based engine against live holdings and prices" />
            <div className="space-y-3 p-5">
              <Field label="Portfolio ID"><input aria-label="Portfolio ID" list="cand" className={inputCls} placeholder="PORT-INV-000001-01" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} />
                <datalist id="cand">{cand.data?.items.map((r) => <option key={r.portfolio_id} value={r.portfolio_id}>{`${r.risk_category} · drift ${r.drift_max.toFixed(1)}pp`}</option>)}</datalist></Field>
              <p className="text-xs text-muted">Suggestions are the 40 portfolios with the largest drift.</p>
              <Button variant="primary" className="w-full" loading={busy} disabled={!portfolio.trim()} onClick={generate}><Scale className="h-4 w-4" />Generate proposal</Button>
              {err && <p role="alert" className="text-xs text-red-300">{err}</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Proposals" action={<select aria-label="Status filter" className={`${inputCls} !h-8 !w-32 text-xs`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">All</option>{['PROPOSED', 'APPROVED', 'REJECTED', 'FAILED'].map((s) => <option key={s}>{s}</option>)}</select>} />
            {list.error ? <div className="p-4"><ErrorState error={list.error} onRetry={list.reload} /></div> : <>
              <DataTable columns={lcols} rows={list.data?.items ?? []} rowKey={(r) => r.proposal_id} loading={list.loading} onRowClick={(r) => setSp({ proposal: r.proposal_id })} empty="No proposals" />
              {list.data && <Pagination page={list.data.page} pageSize={list.data.page_size} total={list.data.total} onPage={setPage} />}</>}
          </Card>
        </div>
        <div className="space-y-4 xl:col-span-2">
          {!pid && <Card><EmptyState title="Select or generate a proposal" hint="The recommendation report appears here." /></Card>}
          {pid && det.loading && !p && <Skeleton className="h-96" />}
          {det.error && <ErrorState error={det.error} onRetry={det.reload} />}
          {p && <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{p.proposal_id}</h2><Badge tone={statusTone(p.status)}>{p.status}</Badge><Badge tone={statusTone(p.approval_level)}>{p.approval_level} approval</Badge>
              <span className="text-sm text-muted">· <PortfolioLink id={p.portfolio_id} /> · {dateTime(p.created_at)}</span>
              <Link className="ml-auto" to={`/simulation?proposal=${p.proposal_id}`}><Button size="sm"><FlaskConical className="h-4 w-4" />Open in Simulation Studio</Button></Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Drift before" value={`${p.drift_before.toFixed(2)} pp`} tone="amber" /><Stat label="Drift after" value={`${p.drift_after.toFixed(2)} pp`} delay={0.04} />
              <Stat label="Trading volume" value={money(p.total_volume)} delay={0.08} tone="blue" /><Stat label="Est. fees" value={money(p.total_fees, 2)} delay={0.12} />
            </div>
            <Reasons failures={p.failure_reasons} warnings={p.warnings} />
            {p.notes && p.notes.length > 0 && <Notice tone="blue" title="Engine notes"><ul className="list-disc pl-4">{p.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Notice>}
            {p.skipped && p.skipped.length > 0 && <Notice tone="blue" title="Skipped by threshold"><ul className="list-disc pl-4">{p.skipped.map((s, i) => <li key={i}>{s.asset_class ?? s.instrument_id}: {money(s.amount)} ({s.reason})</li>)}</ul></Notice>}
            <Card><CardHeader title="Allocation drift: before vs. after" subtitle="Post-trade allocation recomputed from updated holdings, cash and valid prices" /><div className="p-4"><DriftCompare before={p.before_alloc} after={p.after_alloc} /></div><DriftTable rows={p.before_alloc} after={p.after_alloc} /></Card>
            <Card><CardHeader title="Recommended orders" subtitle="Sells execute first and fund buys; fees = max(min fee, notional × bps)" /><TradesTable trades={p.trades ?? []} /></Card>
            {p.status === 'PROPOSED' && <Card><CardHeader title="Decision" subtitle={p.approval_level === 'SENIOR' ? 'Senior approval required (volume > $250K, warnings or HIGH violations)' : 'Standard approval'} />
              <div className="grid gap-3 p-5 sm:grid-cols-3"><Field label="Approver"><input className={inputCls} value={actor} onChange={(e) => setActor(e.target.value)} /></Field>
                <Field label="Role"><select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as 'analyst' | 'senior')}><option value="analyst">Analyst</option><option value="senior">Senior</option></select></Field>
                <Field label="Note"><input className={inputCls} placeholder="Optional rationale" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <div className="flex gap-2 sm:col-span-3"><Button variant="primary" loading={acting === 'approve'} onClick={() => decide('approve')}><CheckCircle2 className="h-4 w-4" />Approve</Button><Button variant="danger" loading={acting === 'reject'} onClick={() => decide('reject')}><XCircle className="h-4 w-4" />Reject</Button></div></div></Card>}
            {p.approvals.length > 0 && <Card><CardHeader title="Approval history" /><ul className="divide-y divide-line/50">{p.approvals.map((a, i) => <li key={i} className="flex items-center justify-between px-5 py-3 text-sm"><span><Badge tone={statusTone(a.decision)}>{a.decision}</Badge> <span className="ml-2 text-slate-300">{a.actor} ({a.role})</span>{a.note && <span className="ml-2 text-muted">— {a.note}</span>}</span><span className="num text-xs text-faint">{dateTime(a.decided_at)}</span></li>)}</ul></Card>}
            <p className="text-xs text-faint">Drift change: {pp(p.drift_after - p.drift_before)} (mean across asset classes).</p>
          </>}
        </div>
      </div>
    </>
  )
}
