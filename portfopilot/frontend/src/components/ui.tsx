import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion } from 'framer-motion'
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export const cn = (...a: Parameters<typeof clsx>) => twMerge(clsx(a))

export function Card({ className, children, hover }: { className?: string; children: ReactNode; hover?: boolean }) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface shadow-card', hover && 'transition-colors hover:border-teal-600/50', className)}>
      {children}
    </section>
  )
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/70 px-5 py-4">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean }
export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: 'bg-gradient-to-b from-teal-500 to-teal-600 text-white shadow-[0_6px_16px_-8px_rgba(20,184,166,0.9)] hover:from-teal-400 hover:to-teal-500',
    secondary: 'border border-line bg-raised text-slate-100 hover:border-teal-600/60 hover:bg-[#1a2842]',
    ghost: 'text-muted hover:bg-raised hover:text-white',
    danger: 'border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20',
  }[variant]
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm', v, className)}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
}

const TONES = {
  neutral: 'bg-slate-500/10 text-slate-300 ring-slate-500/20',
  teal: 'bg-teal-500/10 text-teal-300 ring-teal-500/25',
  emerald: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/25',
  red: 'bg-red-500/10 text-red-300 ring-red-500/25',
  blue: 'bg-blue-500/10 text-blue-300 ring-blue-500/25',
}
export type Tone = keyof typeof TONES
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', TONES[tone], className)}>{children}</span>
}

export const statusTone = (s: string): Tone =>
  ({ APPROVED: 'emerald', PASS: 'emerald', COMPLIANT: 'emerald', OK: 'emerald', IN_TOLERANCE: 'emerald', ACCEPT: 'emerald', PROPOSED: 'blue', REBALANCE_REQUIRED: 'amber',
    WARN: 'amber', MEDIUM: 'amber', STALE: 'amber', COMPLIANT_WITH_WARNINGS: 'amber', FAILED: 'red', FAIL: 'red', REJECTED: 'red', HIGH: 'red', MISSING: 'red', NON_COMPLIANT: 'red',
    REJECT: 'red', LOW: 'neutral', SENIOR: 'amber', STANDARD: 'neutral' } as Record<string, Tone>)[s] ?? 'neutral'

export function Stat({ label, value, hint, icon, tone = 'teal', delay = 0 }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'teal' | 'amber' | 'red' | 'blue'; delay?: number }) {
  const t = { teal: 'text-teal-300 bg-teal-500/10', amber: 'text-amber-300 bg-amber-500/10', red: 'text-red-300 bg-red-500/10', blue: 'text-blue-300 bg-blue-500/10' }[tone]
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }}>
      <Card hover className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
          {icon && <span className={cn('rounded-md p-1.5', t)}>{icon}</span>}
        </div>
        <div className="num mt-2 text-2xl font-semibold tracking-tight text-white">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
      </Card>
    </motion.div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-lg bg-raised/70', className)} />

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center" >
      <AlertTriangle className="h-6 w-6 text-red-300" />
      <p className="text-sm text-red-200" role="alert">{error.message}</p>
      {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
    </Card>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Inbox className="h-6 w-6 text-faint" />
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export interface Column<T> { key: string; header: ReactNode; render: (r: T) => ReactNode; align?: 'left' | 'right'; className?: string }
export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty = 'No records', loading }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: string; loading?: boolean
}) {
  if (loading && !rows.length) return <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
  if (!rows.length) return <EmptyState title={empty} />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-line/70 text-[11px] uppercase tracking-wider text-faint">
            {columns.map((c) => <th key={c.key} className={cn('px-4 py-2.5 font-medium', c.align === 'right' ? 'text-right' : 'text-left')}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r) } : undefined} tabIndex={onRowClick ? 0 : undefined}
              className={cn('border-b border-line/40 transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-raised/70')}>
              {columns.map((c) => <td key={c.key} className={cn('num px-4 py-3 text-slate-200', c.align === 'right' && 'text-right', c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between border-t border-line/70 px-4 py-3 text-xs text-muted">
      <span className="num">{total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="num px-2">Page {page} / {pages}</span>
        <Button size="sm" variant="ghost" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

export const inputCls = 'h-9 w-full rounded-lg border border-line bg-bg/60 px-3 text-sm text-slate-100 placeholder:text-faint focus:border-teal-500/70 focus:outline-none'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-muted">{label}</span>{children}</label>
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors', value === t.id ? 'text-teal-300' : 'text-muted hover:text-white')}>
          {t.label}
          {value === t.id && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-teal-400" />}
        </button>
      ))}
    </div>
  )
}

export function Notice({ tone = 'amber', title, children }: { tone?: 'amber' | 'red' | 'emerald' | 'blue'; title: string; children?: ReactNode }) {
  const c = { amber: 'border-amber-500/30 bg-amber-500/5 text-amber-200', red: 'border-red-500/30 bg-red-500/5 text-red-200', emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200', blue: 'border-blue-500/30 bg-blue-500/5 text-blue-200' }[tone]
  return <div className={cn('rounded-lg border px-4 py-3 text-sm', c)}><p className="font-medium">{title}</p>{children && <div className="mt-1 text-xs opacity-90">{children}</div>}</div>
}
