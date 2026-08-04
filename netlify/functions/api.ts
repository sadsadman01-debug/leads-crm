import type { Handler, HandlerEvent } from '@netlify/functions'
import { requireUser, AuthError, SubscriptionExpiredError } from './lib/auth.js'
import { HttpError, json } from './lib/http.js'
import { resolveOrganizationId } from './lib/permissions.js'
import {
  listLeads,
  createLead,
  getLead,
  updateLead,
  deleteLead,
  checkDuplicate,
  updateLeadStatus,
  updateOutreachProgress,
  updateLeadStage,
  getKanbanLeads,
  getLeadActivities,
  bulkAction,
  findLeadDuplicates,
  dismissLeadDuplicate,
  mergeLeads,
} from './routes/leads.js'
import { listTags } from './routes/tags.js'
import {
  createSignedUpload,
  saveAttachmentMetadata,
  getSignedDownloadUrl,
  deleteAttachment,
} from './routes/attachments.js'
import { importRows, importFromSheet, exportLeads } from './routes/importExport.js'
import { getDashboardSummary } from './routes/dashboard.js'
import { listStages, createStage, renameStage, reorderStages, deleteStage } from './routes/pipelineStages.js'
import { getSettings, updateSettings } from './routes/settings.js'
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from './routes/templates.js'
import { listIndustries, createIndustry, renameIndustry, deleteIndustry } from './routes/industries.js'
import {
  listDealStages,
  createDealStage,
  updateDealStage as updateDealStageConfig,
  reorderDealStages,
  deleteDealStage,
} from './routes/dealStages.js'
import {
  listOutreachStages,
  createOutreachStage,
  updateOutreachStage,
  deactivateOutreachStage,
} from './routes/outreachSequences.js'
import {
  listWinLossReasons,
  createWinLossReason,
  renameWinLossReason,
  deleteWinLossReason,
} from './routes/winLossReasons.js'
import {
  listDeals,
  getDeal,
  createDeal,
  updateDeal,
  updateDealStage,
  deleteDeal,
  getDealsKanban,
  findDealDuplicates,
  dismissDealDuplicate,
  mergeDeals,
} from './routes/deals.js'
import { getRevenueSummary } from './routes/revenue.js'
import {
  getMyProfile,
  listRoster,
  listTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  getTeamMemberPermissions,
  updateTeamMemberPermissions,
  clearForcePasswordChange,
  resetTeamMemberPassword,
} from './routes/team.js'
import {
  createSignupRequest,
  listSignupRequests,
  approveSignupRequest,
  rejectSignupRequest,
  updateSignupRequestPaymentStatus,
  getPublicSignupRequestForPayment,
  submitPaymentMethodSelection,
} from './routes/signupRequests.js'
import {
  listPaymentAccounts,
  getPublicPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
  deletePaymentAccount,
  reorderPaymentAccounts,
} from './routes/receivingPaymentAccounts.js'
import {
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  validatePromoCode,
} from './routes/promoCodes.js'
import { listAnnouncements, createAnnouncement, deactivateAnnouncement } from './routes/announcements.js'
import {
  createRenewalPaymentRequest,
  getMyPendingRenewal,
  getPublicRenewalForPayment,
  listPendingRenewalPayments,
  confirmRenewalPayment,
} from './routes/renewalPayments.js'
import {
  createPasswordResetRequest,
  listPasswordResetRequests,
  resolvePasswordResetRequest,
} from './routes/passwordResetRequests.js'
import {
  createMfaResetRequest,
  listMfaResetRequests,
  resolveMfaResetRequest,
} from './routes/mfaResetRequests.js'
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './routes/notifications.js'
import {
  listOrganizations,
  getOrganization,
  createOrganizationWithAdmin,
  updateOrganizationStatus,
  deleteOrganization,
  setOrganizationCancelled,
  reactivateOrganizationSubscription,
  resetOrgAdminPassword,
} from './routes/organizations.js'
import {
  listCustomFields,
  createCustomField,
  updateCustomField,
  reorderCustomFields,
  deleteCustomField,
} from './routes/customFields.js'
import {
  listSavedReports,
  createSavedReport,
  updateSavedReport,
  deleteSavedReport,
  runReport,
} from './routes/reports.js'
import { getForecast } from './routes/forecast.js'
import { getTrends, getPeriodComparisons } from './routes/trends.js'
import { listQuotas, upsertQuota, deleteQuota } from './routes/quotas.js'
import { getBranding, createLogoSignedUpload, updateBranding, resetBranding } from './routes/branding.js'
import {
  getPlatformBranding,
  createPlatformLogoSignedUpload,
  updatePlatformBranding,
  resetPlatformBranding,
} from './routes/platformBranding.js'
import { getOnboardingStatus, dismissOnboarding } from './routes/onboarding.js'
import { globalSearch } from './routes/search.js'
import {
  createSupportContact,
  createPublicSupportContact,
  listSupportContacts,
  deleteAllSupportContacts,
} from './routes/supportContacts.js'
import { generateFullExport, listExportLog } from './routes/dataExport.js'
import { logAuthEvent, logSecurityEvent } from './routes/auditEvents.js'
import { listAuditLog, exportAuditLogCsv } from './routes/auditLog.js'
import { listMergeSnapshots, restoreMergeSnapshot } from './routes/mergeSnapshots.js'
import {
  getPublicPricing,
  getBillingSettings,
  updateBillingSettings,
  listBilling,
  recordPayment,
  getMyOrgBilling,
  getOrganizationBillingHistory,
} from './routes/billing.js'
import { recordRefund } from './routes/refunds.js'
import {
  createCancellationRequest,
  listCancellationRequests,
  acknowledgeCancellationRequest,
} from './routes/cancellationRequests.js'
import {
  getEarningsSummary,
  getEarningsTrend,
  getEarningsByPaymentMethod,
  getEarningsByTier,
  getPromoCodePerformance,
  listEarningsTransactions,
  exportEarningsTransactionsCsv,
} from './routes/earnings.js'
import {
  createAffiliateApplication,
  listAffiliateApplications,
  approveAffiliateApplication,
  rejectAffiliateApplication,
} from './routes/affiliateApplications.js'
import {
  getMyAffiliateProfile,
  getMyDashboardSummary,
  listMyReferrals,
  listAffiliates,
  getAffiliateDetail,
  updateAffiliateStatus,
} from './routes/affiliates.js'
import {
  listMyPayoutMethods,
  createPayoutMethod,
  updatePayoutMethod,
  deletePayoutMethod,
} from './routes/payoutMethods.js'
import {
  createWithdrawal,
  listMyWithdrawals,
  listWithdrawalRequests,
  getWithdrawalDetail,
  updateWithdrawalStatus,
} from './routes/withdrawals.js'
import {
  submitReview,
  listMyReviews,
  listAllReviews,
  getReviewStats,
  replyToReview,
} from './routes/productReviews.js'
import { logReferralClick } from './routes/referralClicks.js'
import { logPageView, getPageViewCount } from './routes/pageViews.js'
import {
  getOrgReferralSettings,
  updateOrgReferralSettings,
  getMyReferralInfo,
  logOrgReferralClick,
} from './routes/orgReferrals.js'
import {
  getMyMarketingMaterials,
  getAffiliateSettings,
  updateAffiliateSettings,
  getPublicAffiliateProgramInfo,
} from './routes/affiliateMarketing.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

// Path arrives as /.netlify/functions/api/<segments...> (or /api/<segments...> via redirect)
function getSegments(event: HandlerEvent): string[] {
  const path = event.path
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '')
  return path.split('/').filter(Boolean)
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  try {
    const segments = getSegments(event)
    const method = event.httpMethod

    // [resource, id, subresource]
    const [resource, id, sub] = segments

    let response

    if (resource === 'signup-requests') {
      // The only unauthenticated write in this entire API: a public "Request
      // Access" submission never creates an Auth account or an Organization,
      // so it needs no session. Every other action on this resource (viewing,
      // approving, rejecting) is Super-Admin-only, enforced inside each function.
      // The /pay page also needs two unauthenticated calls: reading its own
      // request's amount (id + sub 'public') and submitting a payment method
      // pre-fill (id + sub 'payment-method') — both public, same reasoning.
      if (!id && method === 'POST') {
        response = await createSignupRequest(event)
      } else if (id && sub === 'public' && method === 'GET') {
        response = await getPublicSignupRequestForPayment(id)
      } else if (id && sub === 'payment-method' && method === 'POST') {
        response = await submitPaymentMethodSelection(id, event)
      } else {
        const user = await requireUser(event)
        if (!id && method === 'GET') response = await listSignupRequests(user)
        else if (id && sub === 'approve' && method === 'POST') response = await approveSignupRequest(id, event, user)
        else if (id && sub === 'reject' && method === 'POST') response = await rejectSignupRequest(id, event, user)
        else if (id && sub === 'payment-status' && method === 'PATCH') response = await updateSignupRequestPaymentStatus(id, event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'renewal-payments') {
      // Same shape as signup-requests: the /pay page's own-request read is
      // public (looked up by token, never id); everything else needs a
      // session, with per-function role checks inside (any org member can
      // request/view their own org's renewal; confirming is Super-Admin-only).
      if (id && sub === 'public' && method === 'GET') {
        response = await getPublicRenewalForPayment(id)
      } else {
        const user = await requireUser(event)
        if (!id && method === 'GET') response = await listPendingRenewalPayments(user)
        else if (!id && method === 'POST') response = await createRenewalPaymentRequest(event, user)
        else if (id === 'my-pending' && method === 'GET') response = await getMyPendingRenewal(event, user)
        else if (id && method === 'PATCH') response = await confirmRenewalPayment(id, event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'password-reset-requests') {
      // Same shape as signup-requests: the public "Forgot Password" submission
      // needs no session; viewing/resolving is Admin-or-above, scoped per role
      // inside each function (an Admin only ever sees their own org's User
      // requests; only the Super Admin can see/resolve an Admin-role request).
      if (!id && method === 'POST') {
        response = await createPasswordResetRequest(event)
      } else {
        const user = await requireUser(event)
        if (!id && method === 'GET') response = await listPasswordResetRequests(event, user)
        else if (id && sub === 'resolve' && method === 'POST') response = await resolvePasswordResetRequest(id, event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'platform-branding') {
      // GET is the only unauthenticated read in this API — the Login/Request
      // Access/Forgot Password pages need Platform Default Branding before any
      // session exists. Every write is Super-Admin-only, enforced inside each function.
      if (!id && method === 'GET') {
        response = await getPlatformBranding()
      } else {
        const user = await requireUser(event)
        if (!id && method === 'PATCH') response = await updatePlatformBranding(event, user)
        else if (id === 'logo' && sub === 'sign' && method === 'POST') response = await createPlatformLogoSignedUpload(event, user)
        else if (id === 'reset' && method === 'POST') response = await resetPlatformBranding(event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'mfa-reset-requests') {
      // Same public/authenticated split as password-reset-requests: the
      // "Locked out of Two-Factor Authentication?" submission needs no
      // session; viewing/resolving is Admin-or-above, scoped per role inside.
      if (!id && method === 'POST') {
        response = await createMfaResetRequest(event)
      } else {
        const user = await requireUser(event)
        if (!id && method === 'GET') response = await listMfaResetRequests(event, user)
        else if (id && sub === 'resolve' && method === 'POST') response = await resolveMfaResetRequest(id, event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'notifications') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listNotifications(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'unread-count') {
        if (method === 'GET') response = await getUnreadCount(user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'mark-all-read') {
        if (method === 'POST') response = await markAllNotificationsRead(user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'read') {
        if (method === 'POST') response = await markNotificationRead(id, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'leads') {
      const user = await requireUser(event)

      if (!id) {
        if (method === 'GET') response = await listLeads(event, user)
        else if (method === 'POST') response = await createLead(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'check-duplicate') {
        response = await checkDuplicate(event, user)
      } else if (id === 'bulk') {
        if (method === 'POST') response = await bulkAction(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'import' && sub === 'sheet') {
        response = await importFromSheet(event, user)
      } else if (id === 'import') {
        response = await importRows(event, user)
      } else if (id === 'export') {
        if (method === 'GET') response = await exportLeads(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'kanban') {
        if (method === 'GET') response = await getKanbanLeads(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'duplicates' && sub === 'dismiss') {
        if (method === 'POST') response = await dismissLeadDuplicate(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'duplicates') {
        if (method === 'GET') response = await findLeadDuplicates(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'merge') {
        if (method === 'POST') response = await mergeLeads(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'status') {
        if (method === 'PATCH') response = await updateLeadStatus(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'outreach-progress') {
        if (method === 'PATCH') response = await updateOutreachProgress(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'stage') {
        if (method === 'PATCH') response = await updateLeadStage(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'activities') {
        if (method === 'GET') response = await getLeadActivities(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'GET') response = await getLead(id, resolveOrganizationId(user, event), user)
        else if (method === 'PUT') response = await updateLead(id, event, user)
        else if (method === 'DELETE') response = await deleteLead(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'organizations') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listOrganizations(user)
        else if (method === 'POST') response = await createOrganizationWithAdmin(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'status') {
        if (method === 'PATCH') response = await updateOrganizationStatus(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'reset-admin-password') {
        if (method === 'POST') response = await resetOrgAdminPassword(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'GET') response = await getOrganization(id, user)
        else if (method === 'DELETE') response = await deleteOrganization(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'team-members') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listTeamMembers(event, user)
        else if (method === 'POST') response = await createTeamMember(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'me' && sub === 'clear-force-password-change') {
        if (method === 'POST') response = await clearForcePasswordChange(user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'me') {
        if (method === 'GET') response = await getMyProfile(user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'roster') {
        if (method === 'GET') response = await listRoster(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'permissions') {
        if (method === 'GET') response = await getTeamMemberPermissions(id, event, user)
        else if (method === 'PUT') response = await updateTeamMemberPermissions(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'reset-password') {
        if (method === 'POST') response = await resetTeamMemberPassword(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await updateTeamMember(id, event, user)
        else if (method === 'DELETE') response = await deleteTeamMember(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'tags') {
      const user = await requireUser(event)
      if (method === 'GET') response = await listTags(event, user)
      else throw new HttpError(405, 'Method not allowed')
    } else if (resource === 'dashboard') {
      const user = await requireUser(event)
      if (id === 'summary' && method === 'GET') response = await getDashboardSummary(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'pipeline-stages') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listStages(event, user)
        else if (method === 'POST') response = await createStage(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'reorder') {
        if (method === 'PATCH') response = await reorderStages(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await renameStage(id, event, user)
        else if (method === 'DELETE') response = await deleteStage(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'custom-fields') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listCustomFields(event, user)
        else if (method === 'POST') response = await createCustomField(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'reorder') {
        if (method === 'PATCH') response = await reorderCustomFields(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await updateCustomField(id, event, user)
        else if (method === 'DELETE') response = await deleteCustomField(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'settings') {
      const user = await requireUser(event)
      if (method === 'GET') response = await getSettings(event, user)
      else if (method === 'PUT') response = await updateSettings(event, user)
      else throw new HttpError(405, 'Method not allowed')
    } else if (resource === 'templates') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listTemplates(event, user)
        else if (method === 'POST') response = await createTemplate(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await updateTemplate(id, event, user)
        else if (method === 'DELETE') response = await deleteTemplate(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'industries') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listIndustries(event, user)
        else if (method === 'POST') response = await createIndustry(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await renameIndustry(id, event, user)
        else if (method === 'DELETE') response = await deleteIndustry(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'deal-stages') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listDealStages(event, user)
        else if (method === 'POST') response = await createDealStage(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'reorder') {
        if (method === 'PATCH') response = await reorderDealStages(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await updateDealStageConfig(id, event, user)
        else if (method === 'DELETE') response = await deleteDealStage(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'outreach-sequence-stages') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listOutreachStages(event, user)
        else if (method === 'POST') response = await createOutreachStage(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'deactivate') {
        if (method === 'POST') response = await deactivateOutreachStage(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await updateOutreachStage(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'win-loss-reasons') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listWinLossReasons(event, user)
        else if (method === 'POST') response = await createWinLossReason(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await renameWinLossReason(id, event, user)
        else if (method === 'DELETE') response = await deleteWinLossReason(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'deals') {
      const user = await requireUser(event)

      if (!id) {
        if (method === 'GET') response = await listDeals(event, user)
        else if (method === 'POST') response = await createDeal(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'kanban') {
        if (method === 'GET') response = await getDealsKanban(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'duplicates' && sub === 'dismiss') {
        if (method === 'POST') response = await dismissDealDuplicate(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'duplicates') {
        if (method === 'GET') response = await findDealDuplicates(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'merge') {
        if (method === 'POST') response = await mergeDeals(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'stage') {
        if (method === 'PATCH') response = await updateDealStage(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'GET') response = await getDeal(id, resolveOrganizationId(user, event), user)
        else if (method === 'PUT') response = await updateDeal(id, event, user)
        else if (method === 'DELETE') response = await deleteDeal(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'revenue') {
      const user = await requireUser(event)
      if (id === 'summary' && method === 'GET') response = await getRevenueSummary(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'reports') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listSavedReports(event, user)
        else if (method === 'POST') response = await createSavedReport(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'run') {
        if (method === 'POST') response = await runReport(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await updateSavedReport(id, event, user)
        else if (method === 'DELETE') response = await deleteSavedReport(id, event, user)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'forecast') {
      const user = await requireUser(event)
      if (method === 'GET') response = await getForecast(event, user)
      else throw new HttpError(405, 'Method not allowed')
    } else if (resource === 'trends') {
      const user = await requireUser(event)
      if (id === 'period-comparisons' && method === 'GET') response = await getPeriodComparisons(event, user)
      else if (!id && method === 'GET') response = await getTrends(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'quotas') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listQuotas(event, user)
        else if (method === 'POST') response = await upsertQuota(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (method === 'DELETE') response = await deleteQuota(id, event, user)
      else throw new HttpError(405, 'Method not allowed')
    } else if (resource === 'branding') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await getBranding(event, user)
        else if (method === 'PATCH') response = await updateBranding(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'logo' && sub === 'sign') {
        if (method === 'POST') response = await createLogoSignedUpload(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'reset') {
        if (method === 'POST') response = await resetBranding(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'onboarding') {
      const user = await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await getOnboardingStatus(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'dismiss') {
        if (method === 'POST') response = await dismissOnboarding(event, user)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'search') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await globalSearch(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'support-contacts') {
      // Public — reachable from Login/Request Access/Forgot Password before
      // any session exists. Everything else on this resource is authenticated.
      if (id === 'public' && method === 'POST') {
        response = await createPublicSupportContact(event)
      } else {
        const user = await requireUser(event)
        if (!id && method === 'POST') response = await createSupportContact(event, user)
        else if (!id && method === 'GET') response = await listSupportContacts(user)
        else if (!id && method === 'DELETE') response = await deleteAllSupportContacts(user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'data-export') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await generateFullExport(event, user)
      else if (id === 'log' && method === 'GET') response = await listExportLog(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'merge-snapshots') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await listMergeSnapshots(event, user)
      else if (id && sub === 'restore' && method === 'POST') response = await restoreMergeSnapshot(id, event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'billing') {
      // GET pricing is the only unauthenticated read here — the Request
      // Access page needs the current price before any session exists.
      if (id === 'pricing' && method === 'GET') {
        response = await getPublicPricing()
      } else {
        const user = await requireUser(event)
        if (id === 'settings' && method === 'GET') response = await getBillingSettings(event, user)
        else if (id === 'settings' && method === 'PATCH') response = await updateBillingSettings(event, user)
        else if (id === 'my-organization' && method === 'GET') response = await getMyOrgBilling(event, user)
        else if (!id && method === 'GET') response = await listBilling(event, user)
        else if (id && sub === 'record-payment' && method === 'POST') response = await recordPayment(id, event, user)
        else if (id && sub === 'record-refund' && method === 'POST') response = await recordRefund(id, event, user)
        else if (id && sub === 'history' && method === 'GET') response = await getOrganizationBillingHistory(id, user)
        else if (id && sub === 'cancel-subscription' && method === 'POST') response = await setOrganizationCancelled(id, event, user)
        else if (id && sub === 'reactivate-subscription' && method === 'POST') response = await reactivateOrganizationSubscription(id, event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'cancellation-requests') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await listCancellationRequests(user)
      else if (!id && method === 'POST') response = await createCancellationRequest(event, user)
      else if (id && sub === 'acknowledge' && method === 'POST') response = await acknowledgeCancellationRequest(id, event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'earnings') {
      // The Super Admin's own subscription-sales earnings — entirely
      // Super-Admin-only, never reachable by an Organization's own users.
      const user = await requireUser(event)
      if (id === 'summary') response = await getEarningsSummary(event, user)
      else if (id === 'trend') response = await getEarningsTrend(event, user)
      else if (id === 'by-payment-method') response = await getEarningsByPaymentMethod(event, user)
      else if (id === 'by-tier') response = await getEarningsByTier(event, user)
      else if (id === 'promo-performance') response = await getPromoCodePerformance(event, user)
      else if (id === 'transactions' && sub === 'export') response = await exportEarningsTransactionsCsv(event, user)
      else if (id === 'transactions') response = await listEarningsTransactions(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'auth-events') {
      // Public — reached from the Login page right after
      // supabase.auth.signInWithPassword() resolves, success or failure alike;
      // a failed attempt never has a session to authenticate with.
      if (!id && method === 'POST') response = await logAuthEvent(event)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'security-events') {
      const user = await requireUser(event)
      if (!id && method === 'POST') response = await logSecurityEvent(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'audit-log') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await listAuditLog(event, user)
      else if (id === 'export' && method === 'GET') response = await exportAuditLogCsv(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'affiliate-applications') {
      // Public — the "Become an Affiliate" form never creates an account
      // itself; everything else here is Super-Admin-only.
      if (!id && method === 'POST') {
        response = await createAffiliateApplication(event)
      } else {
        const user = await requireUser(event)
        if (!id && method === 'GET') response = await listAffiliateApplications(user)
        else if (id && sub === 'approve' && method === 'POST') response = await approveAffiliateApplication(id, event, user)
        else if (id && sub === 'reject' && method === 'POST') response = await rejectAffiliateApplication(id, event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'affiliates') {
      const user = await requireUser(event)
      if (id === 'me' && sub === 'dashboard' && method === 'GET') response = await getMyDashboardSummary(event, user)
      else if (id === 'me' && sub === 'referrals' && method === 'GET') response = await listMyReferrals(user)
      else if (id === 'me' && method === 'GET') response = await getMyAffiliateProfile(user)
      else if (!id && method === 'GET') response = await listAffiliates(user)
      else if (id && sub === 'status' && method === 'PATCH') response = await updateAffiliateStatus(id, event, user)
      else if (id && method === 'GET') response = await getAffiliateDetail(id, event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'payout-methods') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await listMyPayoutMethods(user)
      else if (!id && method === 'POST') response = await createPayoutMethod(event, user)
      else if (id && method === 'PUT') response = await updatePayoutMethod(id, event, user)
      else if (id && method === 'DELETE') response = await deletePayoutMethod(id, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'withdrawals') {
      const user = await requireUser(event)
      if (!id && method === 'POST') response = await createWithdrawal(event, user)
      else if (id === 'mine' && method === 'GET') response = await listMyWithdrawals(user)
      else if (!id && method === 'GET') response = await listWithdrawalRequests(event, user)
      else if (id && sub === 'status' && method === 'PATCH') response = await updateWithdrawalStatus(id, event, user)
      else if (id && method === 'GET') response = await getWithdrawalDetail(id, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'product-reviews') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await listAllReviews(event, user)
      else if (!id && method === 'POST') response = await submitReview(event, user)
      else if (id === 'mine' && method === 'GET') response = await listMyReviews(user)
      else if (id === 'stats' && method === 'GET') response = await getReviewStats(event, user)
      else if (id && sub === 'reply' && method === 'PUT') response = await replyToReview(id, event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'promo-codes') {
      // Same shape as signup-requests: validating a code from the public
      // Request Access form needs no session; everything else is Super-Admin-only.
      if (id === 'validate' && method === 'POST') {
        response = await validatePromoCode(event)
      } else {
        const user = await requireUser(event)
        if (!id && method === 'GET') response = await listPromoCodes(user)
        else if (!id && method === 'POST') response = await createPromoCode(event, user)
        else if (id && method === 'PUT') response = await updatePromoCode(id, event, user)
        else if (id && method === 'DELETE') response = await deletePromoCode(id, event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'announcements') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await listAnnouncements(user)
      else if (!id && method === 'POST') response = await createAnnouncement(event, user)
      else if (id && method === 'PATCH') response = await deactivateAnnouncement(id, event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'payment-accounts') {
      // Same shape again: the public /pay page's account list needs no
      // session; everything else (managing the accounts) is Super-Admin-only.
      if (id === 'public' && method === 'GET') {
        response = await getPublicPaymentAccounts()
      } else {
        const user = await requireUser(event)
        if (!id && method === 'GET') response = await listPaymentAccounts(user)
        else if (!id && method === 'POST') response = await createPaymentAccount(event, user)
        else if (id === 'reorder' && method === 'POST') response = await reorderPaymentAccounts(event, user)
        else if (id && method === 'PUT') response = await updatePaymentAccount(id, event, user)
        else if (id && method === 'DELETE') response = await deletePaymentAccount(id, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'referral-clicks') {
      // Public — logged on every Request Access page load with a valid ?ref=.
      if (!id && method === 'POST') response = await logReferralClick(event)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'page-views') {
      // POST is public (logged on every Request Access / Become an Affiliate
      // page load); the count read-back is Super Admin only.
      if (!id && method === 'POST') {
        response = await logPageView(event)
      } else if (id === 'count' && method === 'GET') {
        const user = await requireUser(event)
        response = await getPageViewCount(event, user)
      } else {
        throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'affiliate-marketing') {
      const user = await requireUser(event)
      if (!id && method === 'GET') response = await getMyMarketingMaterials(event, user)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'affiliate-settings') {
      if (id === 'public' && method === 'GET') {
        response = await getPublicAffiliateProgramInfo()
      } else {
        const user = await requireUser(event)
        if (!id && method === 'GET') response = await getAffiliateSettings(event, user)
        else if (!id && method === 'PATCH') response = await updateAffiliateSettings(event, user)
        else throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'org-referrals') {
      // Business Referral Program — entirely separate from the Affiliate
      // Program above. Clicks are public; settings are Super-Admin-only;
      // "my referral info" is any authenticated org member's own org.
      if (id === 'clicks' && method === 'POST') {
        response = await logOrgReferralClick(event)
      } else if (id === 'settings') {
        const user = await requireUser(event)
        if (method === 'GET') response = await getOrgReferralSettings(event, user)
        else if (method === 'PATCH') response = await updateOrgReferralSettings(event, user)
        else throw new HttpError(404, 'Not found')
      } else if (id === 'my-info' && method === 'GET') {
        const user = await requireUser(event)
        response = await getMyReferralInfo(event, user)
      } else {
        throw new HttpError(404, 'Not found')
      }
    } else if (resource === 'attachments') {
      const user = await requireUser(event)
      if (!id && method === 'POST') response = await saveAttachmentMetadata(event, user)
      else if (id === 'sign' && method === 'POST') response = await createSignedUpload(event, user)
      else if (id && sub === 'download' && method === 'GET') response = await getSignedDownloadUrl(id, event, user)
      else if (id && method === 'DELETE') response = await deleteAttachment(id, event, user)
      else throw new HttpError(405, 'Method not allowed')
    } else {
      throw new HttpError(404, 'Not found')
    }

    return { ...response, headers: { ...response.headers, ...CORS_HEADERS } }
  } catch (err) {
    if (err instanceof SubscriptionExpiredError) {
      return { ...json(402, { error: 'subscription_expired', ...err.details }), headers: CORS_HEADERS }
    }
    if (err instanceof AuthError) {
      return { ...json(401, { error: err.message }), headers: CORS_HEADERS }
    }
    if (err instanceof HttpError) {
      return { ...json(err.statusCode, { error: err.message }), headers: CORS_HEADERS }
    }
    console.error(err)
    return { ...json(500, { error: 'Internal server error' }), headers: CORS_HEADERS }
  }
}
