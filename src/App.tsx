import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import {
  ProtectedRoute,
  RequireAdmin,
  RequireSuperAdmin,
  RequireMfaVerified,
  RequirePasswordSet,
  DefaultLanding,
} from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/Layout/AppLayout'
import { Login } from '@/pages/Login'
import { RequestAccess } from '@/pages/RequestAccess'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { MfaChallenge } from '@/pages/MfaChallenge'
import { MfaLockedOut } from '@/pages/MfaLockedOut'
import { SetNewPassword } from '@/pages/SetNewPassword'
import { LeadsList } from '@/pages/Leads/LeadsList'
import { LeadForm } from '@/pages/Leads/LeadForm'
import { LeadDetail } from '@/pages/Leads/LeadDetail'
import { Settings } from '@/pages/Settings'
import { TeamList } from '@/pages/Team/TeamList'
import { OrganizationsOverview } from '@/pages/Organizations/OrganizationsOverview'
import { SignupRequestsPage } from '@/pages/SignupRequests/SignupRequestsPage'
import { PasswordResetRequestsPage } from '@/pages/PasswordResetRequests/PasswordResetRequestsPage'
import { MfaResetRequestsPage } from '@/pages/MfaResetRequests/MfaResetRequestsPage'
import { SupportContactsPage } from '@/pages/SupportContacts/SupportContactsPage'
import { AuditLogPage } from '@/pages/AuditLog/AuditLogPage'
import { BillingPage } from '@/pages/Billing/BillingPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { SubscriptionExpired } from '@/pages/SubscriptionExpired'
import { OfflineBanner } from '@/components/OfflineBanner'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'
import { InstallAppBanner } from '@/components/InstallAppBanner'
import { SubscriptionGuard } from '@/components/SubscriptionGuard'

// Charting (recharts) is only needed here — code-split so it doesn't bloat every route.
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const DealsList = lazy(() => import('@/pages/Deals/DealsList').then((m) => ({ default: m.DealsList })))
const ReportsPage = lazy(() => import('@/pages/Reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))

function PageFallback() {
  return <div className="p-12 text-center text-base-400">Loading…</div>
}

export default function App() {
  return (
    <>
      <OfflineBanner />
      <PwaUpdatePrompt />
      <InstallAppBanner />
      <SubscriptionGuard />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/request-access" element={<RequestAccess />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/mfa-locked-out" element={<MfaLockedOut />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/set-new-password" element={<SetNewPassword />} />
          <Route path="/mfa-challenge" element={<MfaChallenge />} />
          <Route path="/subscription-expired" element={<SubscriptionExpired />} />
          <Route element={<RequireMfaVerified />}>
            <Route element={<RequirePasswordSet />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DefaultLanding />} />
                <Route element={<RequireSuperAdmin />}>
                  <Route path="/organizations" element={<OrganizationsOverview />} />
                  <Route path="/signup-requests" element={<SignupRequestsPage />} />
                  <Route path="/password-reset-requests" element={<PasswordResetRequestsPage />} />
                  <Route path="/mfa-reset-requests" element={<MfaResetRequestsPage />} />
                  <Route path="/support-contacts" element={<SupportContactsPage />} />
                  <Route path="/audit-log" element={<AuditLogPage />} />
                  <Route path="/billing" element={<BillingPage />} />
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
                <Route
                  path="/reports"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <ReportsPage />
                    </Suspense>
                  }
                />
                <Route path="/settings" element={<Settings />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/team" element={<TeamList />} />
                </Route>
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/leads" replace />} />
      </Routes>
    </>
  )
}
