import { createBrowserClient } from '@supabase/ssr'

// Browser-side client (anon key). Used by the public auction page to poll
// auction state directly from Supabase — RLS permits SELECT only, so this
// client has no write surface.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
