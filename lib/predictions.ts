import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Prediction } from './types'

// Supabase's PostgREST API caps every response at a fixed number of rows (the
// project's "Max rows" setting — 1000 by default). An unfiltered
// predictions.select() silently drops everything past that cap, so once the
// table grows beyond it the most recently inserted rows simply vanish from the
// result (and the pages that read them show "no pick"). Page through the table
// with .range(), ordered by the composite primary key so pages never overlap or
// skip, and stop only when a page comes back empty — which stays correct even
// if "Max rows" is ever set below our page size.
const PAGE = 1000

export async function fetchAllPredictions(
  client: SupabaseClient,
  columns = '*'
): Promise<Prediction[]> {
  const all: Prediction[] = []
  let from = 0
  for (;;) {
    const { data, error } = await client
      .from('predictions')
      .select(columns)
      .order('user_id')
      .order('match_id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as unknown as Prediction[]))
    from += data.length
  }
  return all
}
