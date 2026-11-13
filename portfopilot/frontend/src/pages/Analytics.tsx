import { useMemo } from 'react'
import { api } from '../services/api'
import { useApi } from '../hooks/useApi'
import { Badge, Card, CardHeader, DataTable, ErrorState, PageHeader, Skeleton, statusTone, type Column } from '../components/ui'
import { SimpleBars } from '../charts/charts'
import type { AnomalyCase } from '../types/api'
import { num, titleCase } from '../utils/format'

export default function Analytics() {
  const m = useApi(api.metrics, []); const an = useApi(api.anomalies, []); const pr = useApi(() => api.proposals({ page_size: 200 }), [])
  const status = useMemo(() => ['PROPOSED', 'APPROVED', 'REJECTED', 'FAILED'].map((s) => ({ status: titleCase(s), count: pr.data?.items.filter((p) => p.status === s).length ?? 0 })), [pr.data])
  const bytype = useMemo(() => Object.entries((an.data ?? []).reduce<Record<string, { t: number; p: number }>>((a, c) => { (a[c.issue_type] ??= { t: 0, p: 0 }).t++; if (c.passed) a[c.issue_type].p++; return a }, {})).map(([k, v]) => ({ issue: titleCase(k).replace('Unwarned', ''), passed: v.p, failed: v.t - v.p })), [an.data])
  const fmt = (v: number | null, u: string) => (v == null ? 'n/a' : u === 'USD' ? `$${num(v, 2)}` : u === 'count' ? num(v) : `${v.toFixed(u === 'pp' ? 2 : 1)}${u === '%' ? '%' : ' pp'}`)
  const acols: Column<AnomalyCase>[] = [
    { key: 'i', header: 'Case', render: (c) => <div><div className="text-white">{titleCase(c.issue_type)}</div><div className="text-xs text-faint">{c.case_id} · {c.portfolio_id.replace('PORT-INV-', '')}</div></div> },
    { key: 'g', header: 'Ground truth', render: (c) => <Badge>{c.ground_truth}</Badge> },
    { key: 'e', header: 'Expected', render: (c) => <Badge tone={statusTone(c.expected_decision)}>{c.expected_decision}</Badge> },
    { key: 'a', header: 'Actual', render: (c) => <Badge tone={statusTone(c.actual_decision)}>{c.actual_decision}</Badge> },
    { key: 'r', header: 'Result', render: (c) => <Badge tone={c.passed ? 'emerald' : 'red'}>{c.passed ? 'PASS' : 'FAIL'}</Badge> },
    { key: 'x', header: 'Explanation', render: (c) => <span className="text-xs text-muted">{c.explanation}</span> },
  ]
  return (
    <>
      <PageHeader title="Analytics & Evaluation" subtitle="Measurable quality metrics. Each card shows exactly how the number is calculated." />
      {m.error ? <ErrorState error={m.error} onRetry={m.reload} /> : !m.data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div> :
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{m.data.metrics.map((x) => (
          <Card key={x.id} hover className="p-5"><div className="text-xs font-medium uppercase tracking-wider text-muted">{x.name}</div>
            <div className="num mt-2 text-3xl font-semibold tracking-tight text-white">{fmt(x.value, x.unit)}</div>
            <p className="mt-3 border-t border-line/60 pt-3 text-xs leading-relaxed text-muted"><span className="font-medium text-slate-300">How it&apos;s calculated: </span>{x.formula}</p></Card>))}</div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card><CardHeader title="Proposal outcomes" subtitle="Lifecycle distribution (up to 200 most recent)" /><div className="p-4"><SimpleBars data={status} x="status" bars={[{ key: 'count', name: 'Proposals', color: '#14B8A6' }]} /></div></Card>
        <Card><CardHeader title="Edge-case detection by scenario" subtitle="Labelled anomalies: system decision vs. ground truth" /><div className="p-4"><SimpleBars data={bytype} x="issue" bars={[{ key: 'passed', name: 'Passed', color: '#10B981' }, { key: 'failed', name: 'Failed', color: '#EF4444' }]} /></div></Card>
      </div>
      <Card className="mt-4"><CardHeader title="Ground-truth evaluation" subtitle="From data/ground_truth/ground_truth.json — labels are never fed to the engine" />
        {an.error ? <ErrorState error={an.error} onRetry={an.reload} /> : <DataTable columns={acols} rows={an.data ?? []} rowKey={(c) => c.case_id} loading={an.loading} empty="Run the dataset generator to create ground-truth cases" />}</Card>
    </>
  )
}
