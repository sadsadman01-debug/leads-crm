import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { HandlerEvent } from '@netlify/functions'
import { handler as netlifyHandler } from '../netlify/functions/api.js'

// Raised from Vercel's 10s default for the data-export ZIP endpoint, which
// can take a while for larger organizations — Vercel silently caps this to
// whatever the current plan allows, so it's harmless for every other (fast)
// route through this same function.
export const config = { maxDuration: 60 }

/**
 * Thin adapter so the existing Netlify Functions router (netlify/functions/api.ts,
 * and every route/lib file it imports) runs unmodified on Vercel. Every route
 * handler only ever reads event.path/httpMethod/headers/body/queryStringParameters,
 * so a synthetic HandlerEvent built from the incoming request is enough — no
 * route logic needed to change.
 *
 * This is a single fixed function (not a `[...path]` filesystem catch-all) —
 * vercel.json rewrites every /api/* request here explicitly, since Vercel's
 * bracket catch-all only matched single-segment /api/<resource> paths in
 * practice and silently 404'd anything with a subresource (/api/leads/:id,
 * /api/dashboard/summary, etc.) before ever reaching this function. Vercel
 * preserves the true original path in req.url for rewritten requests, so
 * the path-parsing below is unaffected by the rewrite.
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

  // Binary responses (e.g. the ZIP data export) come back base64-encoded per
  // the Netlify Functions convention — decode before sending, since res.send
  // on a plain string would otherwise write the base64 text itself as the
  // body instead of the actual bytes it represents.
  if ((result as any).isBase64Encoded) {
    res.send(Buffer.from(result.body ?? '', 'base64'))
  } else {
    res.send(result.body ?? '')
  }
}
