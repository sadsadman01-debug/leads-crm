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
} from './routes/leads.js'
import { listTags } from './routes/tags.js'
import {
  createSignedUpload,
  saveAttachmentMetadata,
  getSignedDownloadUrl,
  deleteAttachment,
} from './routes/attachments.js'

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
      } else if (sub === 'status') {
        await requireUser(event)
        if (method === 'PATCH') response = await updateLeadStatus(id, event)
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
