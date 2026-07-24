import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Service-role Supabase client. Only ever used server-side inside functions — bypasses RLS. */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client

  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return client
}
