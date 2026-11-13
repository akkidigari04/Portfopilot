import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { useApi } from '../hooks/useApi'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Notice, PageHeader, Skeleton, Stat, inputCls, statusTone } from '../components/ui'
import { DriftCompare } from '../charts/charts'
import { DriftTable, Reasons, TradesTable } from '../components/shared'
import type { Simulation } from '../types/api'
import { money, pp, titleCase } from '../utils/format'

type Draft = { instrument_id: string; side: 'BUY' | 'SELL'; quantity: number }

export default function SimulationStudio() {
  const [sp, setSp] = useSearchParams(); const pid = sp.get('proposal') ?? ''
  const [res, setRes] = useState<Simulation | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [custom, setCustom] = useState<Draft[] | null>(null)
  const list = useApi(() => api.proposals({ page_size: 100 }), [])
  const det = useApi(() => (pid ? api.proposal(pid) : Promise.resolve(null)), [pid])
  const hold = useApi(() => (det.data ? api.holdings(det.data.portfolio_id) : Promise.resolve([])), [det.data?.portfolio_id])

  useEffect(() => { setRes(null); setCustom(null); setErr('') }, [pid])

  const run = async () => {
    if (!pid) return
    setBusy(true); setErr('')
    try {
      const drafts = custom?.filter((t) => t.instrument_id && t.quantity > 0)
      setRes(await api.simulate(pid, custom ? drafts : undefined))
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const startCustom = () => setCustom((det.data?.trades ?? []).map((t) => ({ instrument_id: t.instrument_id, side: t.side, quantity: t.quantity })))
  const upd = (i: number, patch: Partial<Draft>) => setCustom((c) => c!.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  return (
    <>
      <PageHeader title="Simulation Studio" subtitle="Re-run any proposal against current holdings and prices, or edit the orders to test what-if scenarios. Nothing is executed." />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader title="Scenario" subtitle="Choose a proposal to simulate" />
          <div className="space-y-3 p-5">
            <Field label="Proposal"><select aria-label="Proposal" className={inputCls} value={pid} onChange={(e) => setSp(e.target.value ? { proposal: e.target.value } : {})}>
              <option value="">Select a proposal…</option>{list.data?.items.map((p) => <option key={p.proposal_id} value={p.proposal_id}>{p.proposal_id} · {p.portfolio_id.replace('PORT-INV-', '')} · {p.status}</option>)}</select></Field>
            {det.data && <div className="rounded-lg border border-line bg-bg/40 p-3 text-xs text-muted">Portfolio <span className="text-slate-200">{det.data.portfolio_id}</span><br />Status <Badge tone={statusTone(det.data.status)}>{det.data.status}</Badge> · {det.data.trades?.length ?? 0} stored orders</div>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={busy} disabled={!pid} onClick={run}><Play className="h-4 w-4" />Run simulation</Button>
              {pid && !custom && <Button onClick={startCustom}><Plus className="h-4 w-4" />Edit orders</Button>}
              {custom && <Button variant="ghost" onClick={() => setCustom(null)}><RotateCcw className="h-4 w-4" />Use proposal orders</Button>}
            </div>
            {err && <p role="alert" className="text-xs text-red-300">{err}</p>}
          </div>
          {custom && <div className="border-t border-line/70 p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Custom orders</p>
            <datalist id="held">{hold.data?.map((h) => <option key={h.instrument_id} value={h.instrument_id}>{h.symbol}</option>)}</datalist>
            <div className="space-y-2">{custom.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_72px_84px_32px] gap-2">
                <input aria-label={`Instrument ${i + 1}`} list="held" className={inputCls} value={t.instrument_id} placeholder="INS-000001" onChange={(e) => upd(i, { instrument_id: e.target.value })} />
                <select aria-label={`Side ${i + 1}`} className={inputCls} value={t.side} onChange={(e) => upd(i, { side: e.target.value as 'BUY' | 'SELL' })}><option>BUY</option><option>SELL</option></select>
                <input aria-label={`Quantity ${i + 1}`} type="number" min={1} className={inputCls} value={t.quantity} onChange={(e) => upd(i, { quantity: Math.floor(Number(e.target.value)) })} />
                <button aria-label={`Remove order ${i + 1}`} className="text-faint hover:text-red-300" onClick={() => setCustom(custom.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
              </div>))}</div>
            <Button size="sm" className="mt-3" onClick={() => setCustom([...custom, { instrument_id: '', side: 'BUY', quantity: 1 }])}><Plus className="h-3.5 w-3.5" />Add order</Button>
          </div>}
        </Card>
        <div className="space-y-4 xl:col-span-2">
          {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
          {!res && !busy && <Card><EmptyState title={pid ? 'Ready to simulate' : 'Pick a proposal to begin'} hint="Results show before/after allocation, fees, remaining cash and policy compliance." /></Card>}
          {busy && <Skeleton className="h-96" />}
          {res && !busy && <>
            <Notice tone={res.compliance_status === 'COMPLIANT' ? 'emerald' : res.compliance_status === 'NON_COMPLIANT' ? 'red' : 'amber'} title={`Policy compliance: ${titleCase(res.compliance_status)}`}>
              {res.compliance_status === 'NON_COMPLIANT' ? 'One or more hard rules are violated; these orders cannot be approved as submitted.' : res.compliance_status === 'COMPLIANT' ? 'All hard rules pass and residual drift is within policy.' : 'Hard rules pass, but warnings or residual drift need review.'}</Notice>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Trading volume" value={money(res.total_volume)} tone="blue" /><Stat label="Est. fees" value={money(res.total_fees, 2)} delay={0.04} />
              <Stat label="Cash remaining" value={money(res.cash_remaining)} delay={0.08} /><Stat label="Effectiveness" value={`${res.effectiveness_pct.toFixed(1)}%`} hint={`${res.drift_before.mean.toFixed(2)} → ${res.drift_after.mean.toFixed(2)} pp mean drift`} delay={0.12} />
            </div>
            <Reasons issues={res.issues} />
            <Card><CardHeader title="Before vs. after allocation" subtitle={`Max class drift ${res.drift_before.max.toFixed(2)} → ${res.drift_after.max.toFixed(2)} pp (${pp(res.drift_after.max - res.drift_before.max)})`} /><div className="p-4"><DriftCompare before={res.before} after={res.after} /></div><DriftTable rows={res.before} after={res.after} /></Card>
            <Card><CardHeader title="Simulated orders" /><TradesTable trades={res.trades} /></Card>
          </>}
        </div>
      </div>
    </>
  )
}
