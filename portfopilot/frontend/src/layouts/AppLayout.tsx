import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, BarChart3, Briefcase, FlaskConical, History, LayoutDashboard, Menu, Scale, ShieldAlert, ShieldCheck, X } from 'lucide-react'
import { cn } from '../components/ui'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portfolios', label: 'Portfolios', icon: Briefcase },
  { to: '/rebalance', label: 'Rebalancing', icon: Scale },
  { to: '/simulation', label: 'Simulation Studio', icon: FlaskConical },
  { to: '/policy', label: 'Policy & Risk', icon: ShieldAlert },
  { to: '/audit', label: 'Audit History', icon: History },
  { to: '/data-quality', label: 'Data Quality', icon: ShieldCheck },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="#0E1627" stroke="#223250" /><path d="M8 22 16 7l8 15-8-4z" fill="#14B8A6" /><path d="M16 18l8 4-8 3-8-3z" fill="#10B981" opacity=".7" /></svg>
      <div className="leading-tight"><div className="text-[15px] font-semibold tracking-tight text-white">PortfoPilot</div><div className="text-[10px] uppercase tracking-[0.14em] text-faint">Wealth Analytics</div></div>
    </div>
  )
}

function SideNav({ onNav }: { onNav?: () => void }) {
  return (
    <nav className="mt-6 flex flex-col gap-0.5" aria-label="Primary">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNav}
          className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-teal-500/10 text-teal-300' : 'text-muted hover:bg-raised hover:text-white')}>
          {({ isActive }) => (<>
            {isActive && <motion.span layoutId="nav-pill" className="absolute inset-y-1.5 left-0 w-0.5 rounded bg-teal-400" />}
            <Icon className="h-4 w-4" />{label}
          </>)}
        </NavLink>
      ))}
    </nav>
  )
}

function SideFooter() {
  return (
    <div className="mt-auto rounded-lg border border-line bg-raised/50 p-3 text-[11px] leading-relaxed text-muted">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-slate-300"><Activity className="h-3.5 w-3.5 text-emerald-400" />Educational simulation</div>
      Synthetic data · seed 20261022. Not financial advice.
    </div>
  )
}

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-[#0B1322]/90 p-4 backdrop-blur lg:flex">
        <Logo /><SideNav /><SideFooter />
      </aside>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: -260 }} animate={{ x: 0 }} exit={{ x: -260 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-[#0B1322] p-4">
              <div className="flex items-center justify-between"><Logo /><button aria-label="Close menu" onClick={() => setOpen(false)} className="text-muted"><X className="h-5 w-5" /></button></div>
              <SideNav onNav={() => setOpen(false)} /><SideFooter />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur lg:px-8">
          <button aria-label="Open menu" className="text-muted lg:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="hidden text-xs text-muted lg:block">Institutional portfolio rebalancing &amp; risk analytics</div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live API</span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 text-xs font-semibold text-white">JM</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname.split('/')[1] || 'home'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
