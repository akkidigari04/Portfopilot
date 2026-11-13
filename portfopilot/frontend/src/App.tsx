import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import Dashboard from './pages/Dashboard'
import Portfolios from './pages/Portfolios'
import PortfolioDetail from './pages/PortfolioDetail'
import Rebalance from './pages/Rebalance'
import Simulation from './pages/Simulation'
import Policy from './pages/Policy'
import Audit from './pages/Audit'
import DataQuality from './pages/DataQuality'
import Analytics from './pages/Analytics'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="portfolios" element={<Portfolios />} />
        <Route path="portfolios/:id" element={<PortfolioDetail />} />
        <Route path="rebalance" element={<Rebalance />} />
        <Route path="simulation" element={<Simulation />} />
        <Route path="policy" element={<Policy />} />
        <Route path="audit" element={<Audit />} />
        <Route path="data-quality" element={<DataQuality />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
