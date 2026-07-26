import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { HandlerEvent } from '@netlify/functions'
import { handler as netlifyHandler } from '../netlify/functions/api.js'

/**
 * Thin adapter so the existing Netlify Functions router (netlify/functions/api.ts,
 * and every route/lib file it imports) runs unmodified on Vercel. Every route
 * handler only ever reads event.path/httpMethod/headers/body/queryStringParameters,
 * so a synthetic HandlerEvent built from the incoming request is enough — no
 * route logic needed to change.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/api', 'http://localhost')

  const queryStringParameters: Record<string, string> = {}
  for (const key of url.searchParams.keys()) {
    queryStringParameters[key] = url.searchParams.get(key) ?? ''
  }

  let body: string | null = null
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }

  const event = {
    path: url.pathname,
    httpMethod: req.method ?? 'GET',
    headers: req.headers as Record<string, string>,
    queryStringParameters,
    body,
  } as unknown as HandlerEvent

  const result = await netlifyHandler(event, {} as any, undefined as any)
  if (!result) {
    res.status(500).json({ error: 'No response from handler' })
    return
  }

  res.status(result.statusCode)
  for (const [key, value] of Object.entries(result.headers ?? {})) {
    res.setHeader(key, value as string)
  }
  res.send(result.body ?? '')
}
