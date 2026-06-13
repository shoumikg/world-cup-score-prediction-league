import { createClient } from '@/lib/supabase/server'
import { computeGroupStandings } from '@/lib/standings'
import { GroupTable } from '@/app/GroupTable'
import { LiveRefresh } from '@/app/LiveRefresh'
import type { Match } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware will redirect

  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .eq('stage', 'group')

  const allMatches = (matches ?? []) as Match[]
  const standings = computeGroupStandings(allMatches)

  const liveTeams = new Set(
    allMatches
      .filter(m => m.status === 'live')
      .flatMap(m => [m.home_team, m.away_team])
      .filter(Boolean) as string[]
  )
  const hasLive = liveTeams.size > 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <LiveRefresh hasLive={hasLive} />
      <h1 className="text-xl font-bold mb-1">Group Tables</h1>
      <p className="text-sm text-gray-500 mb-6">
        Updated automatically as results come in. Top two qualify; the eight best
        third-placed teams also advance.
      </p>

      <div className="grid sm:grid-cols-2 gap-6">
        {[...standings.entries()].map(([group, rows]) => (
          <GroupTable key={group} group={group} rows={rows} liveTeams={liveTeams} groupPageLink />
        ))}
      </div>
    </div>
  )
}
