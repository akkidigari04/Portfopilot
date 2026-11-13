import type {
  AnomalyCase, AuditEvent, ConstraintRow, DashboardSummary, Metric, Page, PolicyViolations, PortfolioDetail, PortfolioRow, ProposalDetail,
  ProposalRow, Simulation, ValidationReport, HoldingRow, DriftRow,
} from '../types/api'

export const API_BASE: string = (import.meta.env?.VITE_API_URL as string | undefined) ?? ''

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function formatDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => (d?.loc ? `${d.loc.slice(1).join('.')}: ${d.msg}` : JSON.stringify(d))).join('; ')
  return 'Request failed'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init })
  } catch {
    throw new ApiError(0, 'Cannot reach the PortfoPilot API. Is the backend running on port 8000?')
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { msg = formatDetail((await res.json()).detail) } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams()
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)) })
  const s = p.toString()
  return s ? `?${s}` : ''
}
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  dashboard: (start?: string, end?: string) => request<DashboardSummary>(`/api/dashboard/summary${qs({ start, end })}`),
  portfolios: (p: { q?: string; risk?: string; needs_rebalance?: boolean; sort?: string; desc?: boolean; page?: number; page_size?: number }) =>
    request<Page<PortfolioRow>>(`/api/portfolios${qs(p)}`),
  portfolio: (id: string) => request<PortfolioDetail>(`/api/portfolios/${id}`),
  holdings: (id: string) => request<HoldingRow[]>(`/api/portfolios/${id}/holdings`),
  allocation: (id: string) => request<{ rows: DriftRow[]; summary: { mean: number; max: number }; target_sum: number; weights_reconcile: boolean }>(`/api/portfolios/${id}/allocation`),
  generate: (portfolio_id: string, actor = 'analyst') => post<ProposalDetail>('/api/rebalance/generate', { portfolio_id, actor }),
  proposals: (p: { status?: string; portfolio_id?: string; page?: number; page_size?: number }) => request<Page<ProposalRow>>(`/api/rebalance/proposals${qs(p)}`),
  proposal: (id: string) => request<ProposalDetail>(`/api/rebalance/${id}`),
  simulate: (id: string, trades?: { instrument_id: string; side: 'BUY' | 'SELL'; quantity: number }[]) =>
    post<Simulation>(`/api/rebalance/${id}/simulate`, trades ? { trades } : {}),
  approve: (id: string, body: { actor: string; role: 'analyst' | 'senior'; note?: string }) => post<ProposalRow>(`/api/rebalance/${id}/approve`, body),
  reject: (id: string, body: { actor: string; role: 'analyst' | 'senior'; note?: string }) => post<ProposalRow>(`/api/rebalance/${id}/reject`, body),
  constraints: () => request<ConstraintRow[]>('/api/constraints'),
  updateConstraint: (id: string, value: string, actor = 'admin') =>
    request<{ old: string; new: string }>(`/api/constraints/${id}`, { method: 'PUT', body: JSON.stringify({ value, actor }) }),
  violations: (p: { severity?: string; code?: string; page?: number; page_size?: number }) => request<PolicyViolations>(`/api/policy/violations${qs(p)}`),
  audit: (p: { event_type?: string; portfolio_id?: string; page?: number; page_size?: number }) => request<Page<AuditEvent>>(`/api/audit/events${qs(p)}`),
  validation: () => request<ValidationReport>('/api/validation/report'),
  validationCsvUrl: () => `${API_BASE}/api/validation/report?format=csv`,
  metrics: () => request<{ metrics: Metric[] }>('/api/analytics/metrics'),
  anomalies: () => request<AnomalyCase[]>('/api/analytics/anomalies'),
}
