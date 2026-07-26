import type { Handler, HandlerEvent } from '@netlify/functions'
import { requireUser, AuthError } from './lib/auth.js'
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
  updateLeadStage,
  getKanbanLeads,
  getLeadActivities,
  bulkAction,
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
} from './routes/team.js'
import {
  listOrganizations,
  getOrganization,
  createOrganizationWithAdmin,
  updateOrganizationStatus,
  deleteOrganization,
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

    if (resource === 'leads') {
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
      } else if (sub === 'status') {
        if (method === 'PATCH') response = await updateLeadStatus(id, event, user)
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
