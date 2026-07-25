import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute, RequireAdmin, RequireSuperAdmin, DefaultLanding } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/Layout/AppLayout'
import { Login } from '@/pages/Login'
import { LeadsList } from '@/pages/Leads/LeadsList'
import { LeadForm } from '@/pages/Leads/LeadForm'
import { LeadDetail } from '@/pages/Leads/LeadDetail'
import { Settings } from '@/pages/Settings'
import { TeamList } from '@/pages/Team/TeamList'
import { OrganizationsOverview } from '@/pages/Organizations/OrganizationsOverview'

// Charting (recharts) is only needed here — code-split so it doesn't bloat every route.
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const DealsList = lazy(() => import('@/pages/Deals/DealsList').then((m) => ({ default: m.DealsList })))

function PageFallback() {
  return <div className="p-12 text-center text-base-400">Loading…</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DefaultLanding />} />
          <Route element={<RequireSuperAdmin />}>
            <Route path="/organizations" element={<OrganizationsOverview />} />
          </Route>
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<PageFallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route path="/leads" element={<LeadsList />} />
          <Route path="/leads/new" element={<LeadForm />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/leads/:id/edit" element={<LeadForm />} />
          <Route
            path="/deals"
            element={
              <Suspense fallback={<PageFallback />}>
                <DealsList />
              </Suspense>
            }
          />
          <Route path="/settings" element={<Settings />} />
          <Route element={<RequireAdmin />}>
            <Route path="/team" element={<TeamList />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/leads" replace />} />
    </Routes>
  )
}
