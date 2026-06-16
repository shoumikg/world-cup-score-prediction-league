import { cache } from 'react'
import { createClient } from './supabase/server'

// Per-request memoisation of the auth check. Layout and every page call this;
// React cache() ensures auth.getUser() runs exactly once per server render,
// not once per component that needs to know the current user.
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
