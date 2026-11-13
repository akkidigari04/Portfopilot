import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DriftRow } from '../types/api'
import { CLASS_COLORS, compactMoney } from '../utils/format'

const axis = { stroke: '#5D7194', fontSize: 11, tickLine: false, axisLine: false } as const
const tip = {
  contentStyle: { background: '#0E1627', border: '1px solid #223250', borderRadius: 10, fontSize: 12, color: '#E2E8F0' },
  labelStyle: { color: '#8CA0BF' }, itemStyle: { color: '#E2E8F0' }, cursor: { fill: 'rgba(148,163,184,0.06)' },
}

export function AllocationDonut({ data }: { data: { asset_class: string; weight: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="weight" nameKey="asset_class" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="#111A2C" strokeWidth={3}>
          {data.map((d) => <Cell key={d.asset_class} fill={CLASS_COLORS[d.asset_class] ?? '#64748B'} />)}
        </Pie>
        <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(2)}%`} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function PerformanceArea({ data }: { data: { date: string; aum: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="aumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14B8A6" stopOpacity={0.35} /><stop offset="100%" stopColor="#14B8A6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#223250" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="date" {...axis} minTickGap={48} tickFormatter={(d: string) => d.slice(5)} />
        <YAxis {...axis} width={64} domain={['auto', 'auto']} tickFormatter={compactMoney} />
        <Tooltip {...tip} formatter={(v: number) => compactMoney(v)} />
        <Area type="monotone" dataKey="aum" name="AUM" stroke="#2DD4BF" strokeWidth={2} fill="url(#aumFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DriftCompare({ before, after, height = 260 }: { before: DriftRow[]; after?: DriftRow[]; height?: number }) {
  const data = before.map((b, i) => ({ asset_class: b.asset_class, before: b.drift, after: after?.[i]?.drift }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#223250" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="asset_class" {...axis} interval={0} tickFormatter={(s: string) => s.replace('Fixed Income', 'Fixed Inc.').replace('Alternatives', 'Alts').replace('Commodities', 'Commod.').replace('Real Estate', 'R. Estate')} />
        <YAxis {...axis} tickFormatter={(v: number) => `${v}pp`} />
        <Tooltip {...tip} formatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)} pp`} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#8CA0BF' }} />
        <Bar dataKey="before" name="Before" fill="#F59E0B" radius={[4, 4, 0, 0]} />
        {after && <Bar dataKey="after" name="After" fill="#10B981" radius={[4, 4, 0, 0]} />}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CurrentVsTarget({ rows }: { rows: DriftRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#223250" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="asset_class" {...axis} interval={0} tickFormatter={(s: string) => s.replace('Fixed Income', 'Fixed Inc.').replace('Alternatives', 'Alts').replace('Commodities', 'Commod.').replace('Real Estate', 'R. Estate')} />
        <YAxis {...axis} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(2)}%`} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#8CA0BF' }} />
        <Bar dataKey="current" name="Current" fill="#14B8A6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="target" name="Target" fill="#475A7C" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SimpleBars({ data, x, bars, height = 240 }: { data: Record<string, unknown>[]; x: string; bars: { key: string; name: string; color: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#223250" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey={x} {...axis} interval={0} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tip} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: '#8CA0BF' }} />}
        {bars.map((b) => <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  )
}
