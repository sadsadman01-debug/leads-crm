import type { Handler, HandlerEvent } from '@netlify/functions'
import { requireUser, AuthError } from './lib/auth.js'
import { HttpError, json } from './lib/http.js'
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
      if (!id) {
        await requireUser(event)
        if (method === 'GET') response = await listLeads(event)
        else if (method === 'POST') response = await createLead(event, await requireUser(event))
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'check-duplicate') {
        await requireUser(event)
        response = await checkDuplicate(event)
      } else if (id === 'bulk') {
        await requireUser(event)
        if (method === 'POST') response = await bulkAction(event)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'import' && sub === 'sheet') {
        response = await importFromSheet(event, await requireUser(event))
      } else if (id === 'import') {
        response = await importRows(event, await requireUser(event))
      } else if (id === 'export') {
        await requireUser(event)
        if (method === 'GET') response = await exportLeads(event)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'kanban') {
        await requireUser(event)
        if (method === 'GET') response = await getKanbanLeads()
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'status') {
        await requireUser(event)
        if (method === 'PATCH') response = await updateLeadStatus(id, event)
        else throw new HttpError(405, 'Method not allowed')
      } else if (sub === 'stage') {
        await requireUser(event)
        if (method === 'PATCH') response = await updateLeadStage(id, event)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        await requireUser(event)
        if (method === 'GET') response = await getLead(id)
        else if (method === 'PUT') response = await updateLead(id, event)
        else if (method === 'DELETE') response = await deleteLead(id)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'tags') {
      await requireUser(event)
      if (method === 'GET') response = await listTags()
      else throw new HttpError(405, 'Method not allowed')
    } else if (resource === 'dashboard') {
      await requireUser(event)
      if (id === 'summary' && method === 'GET') response = await getDashboardSummary(event)
      else throw new HttpError(404, 'Not found')
    } else if (resource === 'pipeline-stages') {
      await requireUser(event)
      if (!id) {
        if (method === 'GET') response = await listStages()
        else if (method === 'POST') response = await createStage(event)
        else throw new HttpError(405, 'Method not allowed')
      } else if (id === 'reorder') {
        if (method === 'PATCH') response = await reorderStages(event)
        else throw new HttpError(405, 'Method not allowed')
      } else {
        if (method === 'PUT') response = await renameStage(id, event)
        else if (method === 'DELETE') response = await deleteStage(id)
        else throw new HttpError(405, 'Method not allowed')
      }
    } else if (resource === 'settings') {
      await requireUser(event)
      if (method === 'GET') response = await getSettings()
      else if (method === 'PUT') response = await updateSettings(event)
      else throw new HttpError(405, 'Method not allowed')
    } else if (resource === 'attachments') {
      const user = await requireUser(event)
      if (!id && method === 'POST') response = await saveAttachmentMetadata(event, user)
      else if (id === 'sign' && method === 'POST') response = await createSignedUpload(event)
      else if (id && sub === 'download' && method === 'GET') response = await getSignedDownloadUrl(id)
      else if (id && method === 'DELETE') response = await deleteAttachment(id)
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
