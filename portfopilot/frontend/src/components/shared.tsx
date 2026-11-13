import { Link } from 'react-router-dom'
import type { DriftRow, Issue, Reason, TradeRow } from '../types/api'
import { Badge, DataTable, Notice, type Column } from './ui'
import { CLASS_COLORS, money, num, pct, pp } from '../utils/format'

export function DriftTable({ rows, after }: { rows: DriftRow[]; after?: DriftRow[] }) {
  const cols: Column<DriftRow>[] = [
    { key: 'c', header: 'Asset class', render: (r) => <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: CLASS_COLORS[r.asset_class] }} />{r.asset_class}</span> },
    { key: 'mv', header: 'Market value', align: 'right', render: (r) => money(r.market_value) },
    { key: 'cur', header: 'Current', align: 'right', render: (r) => pct(r.current, 2) },
    { key: 'tgt', header: 'Target', align: 'right', render: (r) => pct(r.target, 2) },
    { key: 'd', header: 'Drift', align: 'right', render: (r) => <span className={Math.abs(r.drift) > 5 ? 'text-amber-300' : 'text-slate-200'}>{pp(r.drift)}</span> },
  ]
  if (after) cols.push({ key: 'a', header: 'Drift after', align: 'right', render: (r) => { const a = after.find((x) => x.asset_class === r.asset_class); return <span className="text-emerald-300">{a ? pp(a.drift) : '—'}</span> } })
  return <DataTable columns={cols} rows={rows} rowKey={(r) => r.asset_class} />
}

export function TradesTable({ trades, empty = 'No trades required — all deviations are within policy thresholds.' }: { trades: TradeRow[]; empty?: string }) {
  const cols: Column<TradeRow>[] = [
    { key: 's', header: 'Side', render: (t) => <Badge tone={t.side === 'BUY' ? 'emerald' : 'amber'}>{t.side}</Badge> },
    { key: 'i', header: 'Instrument', render: (t) => t.instrument_id },
    { key: 'q', header: 'Quantity', align: 'right', render: (t) => num(t.quantity) },
    { key: 'p', header: 'Price', align: 'right', render: (t) => money(t.price, 2) },
    { key: 'n', header: 'Notional', align: 'right', render: (t) => money(t.notional, 2) },
    { key: 'f', header: 'Fee', align: 'right', render: (t) => money(t.fee, 2) },
  ]
  return <DataTable columns={cols} rows={trades} rowKey={(t) => `${t.side}${t.instrument_id}`} empty={empty} />
}

export function Reasons({ failures = [], warnings = [], issues = [] }: { failures?: Reason[]; warnings?: Reason[]; issues?: Issue[] }) {
  const errs = [...failures, ...issues.filter((i) => i.severity === 'error')]
  const warns = [...warnings, ...issues.filter((i) => i.severity === 'warning')]
  if (!errs.length && !warns.length) return null
  return (
    <div className="space-y-2">
      {errs.length > 0 && <Notice tone="red" title={`${errs.length} blocking issue${errs.length > 1 ? 's' : ''}`}><ul className="list-disc space-y-0.5 pl-4">{errs.map((e, i) => <li key={i}><b>{e.code}</b> — {e.message}</li>)}</ul></Notice>}
      {warns.length > 0 && <Notice tone="amber" title={`${warns.length} warning${warns.length > 1 ? 's' : ''}`}><ul className="list-disc space-y-0.5 pl-4">{warns.map((e, i) => <li key={i}><b>{e.code}</b> — {e.message}</li>)}</ul></Notice>}
    </div>
  )
}

export const PortfolioLink = ({ id }: { id: string }) => <Link to={`/portfolios/${id}`} className="text-teal-300 hover:underline" onClick={(e) => e.stopPropagation()}>{id}</Link>
