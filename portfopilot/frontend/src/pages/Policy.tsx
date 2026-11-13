import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, X } from 'lucide-react'
import { api } from '../services/api'
import { useApi } from '../hooks/useApi'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, PageHeader, Pagination, Stat, inputCls, statusTone, type Column } from '../components/ui'
import type { ConstraintRow, PolicyViolation } from '../types/api'
import { titleCase } from '../utils/format'

const LABEL: Record<string, string> = { MAX_DRIFT: 'Maximum allocation drift (pp)', MIN_TRADE: 'Minimum trade amount (USD)', MAX_FEE_PCT: 'Maximum fees (% of volume)', MIN_CASH_PCT: 'Liquidity: minimum cash reserve (%)', STALE_DAYS: 'Stale price threshold (days)', STALE_POLICY: 'Stale price policy (WARN / BLOCK)', RISK_BLOCKED_BUY_CONSERVATIVE: 'Risk restriction: Conservative may not buy' }

export default function Policy() {
  const [sev, setSev] = useState(''); const [code, setCode] = useState(''); const [page, setPage] = useState(1)
  const cons = useApi(api.constraints, []); const viol = useApi(() => api.violations({ severity: sev || undefined, code: code || undefined, page, page_size: 15 }), [sev, code, page])
  const [edit, setEdit] = useState<string | null>(null); const [val, setVal] = useState(''); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const save = async (c: ConstraintRow) => {
    try { const r = await api.updateConstraint(c.constraint_id, val); setMsg({ ok: true, t: `${c.name}: ${r.old} → ${r.new} (audited)` }); setEdit(null); cons.reload(); viol.reload() } catch (e) { setMsg({ ok: false, t: (e as Error).message }) }
  }
  const ccols: Column<ConstraintRow>[] = [
    { key: 'n', header: 'Policy', render: (c) => <div><div className="font-medium text-white">{LABEL[c.name] ?? titleCase(c.name)}</div><div className="text-xs text-faint">{c.description}</div></div> },
    { key: 's', header: 'Severity', render: (c) => <Badge tone={statusTone(c.severity)}>{c.severity}</Badge> },
    { key: 'v', header: 'Value', align: 'right', render: (c) => edit === c.constraint_id
      ? <input aria-label={`Edit ${c.name}`} autoFocus className={`${inputCls} !h-8 !w-32 text-right`} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(c); if (e.key === 'Escape') setEdit(null) }} />
      : <span className="font-medium text-teal-300">{c.value}</span> },
    { key: 'a', header: '', align: 'right', render: (c) => edit === c.constraint_id
      ? <span className="flex justify-end gap-1"><Button size="sm" variant="primary" aria-label="Save" onClick={() => save(c)}><Check className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" aria-label="Cancel" onClick={() => setEdit(null)}><X className="h-3.5 w-3.5" /></Button></span>
      : <Button size="sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => { setEdit(c.constraint_id); setVal(c.value); setMsg(null) }}><Pencil className="h-3.5 w-3.5" /></Button> },
  ]
  const vcols: Column<PolicyViolation>[] = [
    { key: 's', header: 'Severity', render: (v) => <Badge tone={statusTone(v.severity)}>{v.severity}</Badge> },
    { key: 'p', header: 'Portfolio', render: (v) => <Link className="text-teal-300 hover:underline" to={`/portfolios/${v.portfolio_id}`}>{v.portfolio_id.replace('PORT-INV-', '')}</Link> },
    { key: 'c', header: 'Exception', render: (v) => <div><div className="text-white">{titleCase(v.code)}</div><div className="text-xs text-muted">{v.message}</div></div> },
    { key: 'r', header: 'Recommended resolution', render: (v) => <span className="text-slate-300">{v.resolution}</span> },
    { key: 'a', header: 'Approval', render: (v) => v.approval_required ? <Badge tone="amber">Required</Badge> : <span className="text-faint">Standard</span> },
  ]
  return (
    <>
      <PageHeader title="Policy & Risk Management" subtitle="Configurable constraints drive the rebalancing engine. Changes take effect immediately and are written to the audit log." />
      {msg && <div role="status" className={`mb-4 text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.t}</div>}
      <Card className="mb-4"><CardHeader title="Policy configuration" subtitle="Click the pencil to edit; press Enter to save" />
        {cons.error ? <ErrorState error={cons.error} onRetry={cons.reload} /> : <DataTable columns={ccols} rows={cons.data ?? []} rowKey={(c) => c.constraint_id} loading={cons.loading} />}</Card>
      {viol.data && <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Stat label="High severity" value={viol.data.by_severity.HIGH ?? 0} tone="red" /><Stat label="Medium severity" value={viol.data.by_severity.MEDIUM ?? 0} tone="amber" delay={0.04} />
        <Stat label="Total exceptions" value={Object.values(viol.data.by_severity).reduce((a, b) => a + b, 0)} hint="One row per active flag per portfolio" delay={0.08} /></div>}
      <Card><CardHeader title="Policy violations & exceptions" action={<div className="flex gap-2">
        <select aria-label="Severity" className={`${inputCls} !h-8 !w-32 text-xs`} value={sev} onChange={(e) => { setSev(e.target.value); setPage(1) }}><option value="">All severities</option><option>HIGH</option><option>MEDIUM</option></select>
        <select aria-label="Exception type" className={`${inputCls} !h-8 !w-44 text-xs`} value={code} onChange={(e) => { setCode(e.target.value); setPage(1) }}><option value="">All types</option>{Object.keys(viol.data?.by_code ?? {}).map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></div>} />
        {viol.error ? <ErrorState error={viol.error} onRetry={viol.reload} /> : <><DataTable columns={vcols} rows={viol.data?.items ?? []} rowKey={(v) => v.portfolio_id + v.code} loading={viol.loading} empty="No violations" />
          {viol.data && <Pagination page={viol.data.page} pageSize={viol.data.page_size} total={viol.data.total} onPage={setPage} />}</>}
      </Card>
    </>
  )
}
