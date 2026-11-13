import { Download, RefreshCw } from 'lucide-react'
import { api } from '../services/api'
import { useApi } from '../hooks/useApi'
import { Badge, Button, Card, CardHeader, DataTable, ErrorState, PageHeader, Skeleton, Stat, statusTone, type Column } from '../components/ui'
import type { Check } from '../types/api'
import { dateTime, downloadCsv, num } from '../utils/format'

export default function DataQuality() {
  const { data, error, loading, reload } = useApi(api.validation, [])
  const cols: Column<Check>[] = [
    { key: 'id', header: 'Check', render: (c) => <span className="font-medium text-teal-300">{c.id}</span> },
    { key: 'n', header: 'Validation', render: (c) => <div><div className="text-white">{c.name}</div>{c.detail && <div className="text-xs text-muted">{c.detail}</div>}</div> },
    { key: 'c', header: 'Category', render: (c) => <Badge>{c.category}</Badge> },
    { key: 'k', header: 'Checked', align: 'right', render: (c) => num(c.checked) },
    { key: 'f', header: 'Failed', align: 'right', render: (c) => <span className={c.failed ? 'text-amber-300' : 'text-slate-400'}>{num(c.failed)}</span> },
    { key: 's', header: 'Result', render: (c) => <Badge tone={statusTone(c.status)}>{c.status}</Badge> },
  ]
  return (
    <>
      <PageHeader title="Data Quality & Validation" subtitle="Keys, referential integrity, completeness, reconciliation, trade validity, market-data freshness, fee accuracy and lifecycle consistency."
        actions={<><Button onClick={reload} loading={loading}><RefreshCw className="h-4 w-4" />Re-run checks</Button>
          <a href={api.validationCsvUrl()} download="validation_report.csv"><Button><Download className="h-4 w-4" />Export CSV</Button></a>
          <Button disabled={!data} onClick={() => data && downloadCsv('validation_report.csv', data.checks as unknown as Record<string, unknown>[])} variant="ghost">Client export</Button></>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : !data ? <Skeleton className="h-96" /> : <>
        <div className="mb-4 grid gap-4 sm:grid-cols-4">
          <Stat label="Pass rate" value={`${data.pass_rate.toFixed(1)}%`} hint="PASS ÷ total checks" />
          <Stat label="Passed" value={data.checks.filter((c) => c.status === 'PASS').length} delay={0.04} /><Stat label="Warnings" value={data.checks.filter((c) => c.status === 'WARN').length} tone="amber" delay={0.08} />
          <Stat label="Failed" value={data.checks.filter((c) => c.status === 'FAIL').length} tone="red" delay={0.12} /></div>
        <Card><CardHeader title="Validation results" subtitle={`Generated ${dateTime(data.generated_at)}`} /><DataTable columns={cols} rows={data.checks} rowKey={(c) => c.id} /></Card></>}
    </>
  )
}
