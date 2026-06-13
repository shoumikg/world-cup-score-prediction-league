import 'server-only'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Service-role client — server-side ONLY. Never import this from a client component.
// Bypasses RLS. Used exclusively in protected API routes (e.g. the cron sync endpoint).
// Lazy-initialized so the module is safe to import at build time.
let _client: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Supabase admin env vars are not set')
    _client = createClient(url, key, { auth: { persistSession: false } })
  }
  return _client
}
