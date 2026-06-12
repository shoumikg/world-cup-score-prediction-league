import { createClient } from '@/lib/supabase/server'
import { computeGroupStandings } from '@/lib/standings'
import { teamDisplay } from '@/lib/flags'
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

  // Teams currently in a live match — shown with a pulsing dot in the table
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
          <section key={group} className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <h2 className="text-sm font-bold px-4 py-2.5 border-b bg-gray-50">Group {group}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400">
                  <th className="text-left font-medium pl-4 py-1.5">Team</th>
                  <th className="font-medium w-8">MP</th>
                  <th className="font-medium w-7">W</th>
                  <th className="font-medium w-7">D</th>
                  <th className="font-medium w-7">L</th>
                  <th className="font-medium w-8">GF</th>
                  <th className="font-medium w-8">GA</th>
                  <th className="font-medium w-8">GD</th>
                  <th className="font-semibold w-9 pr-4">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.team} className="border-t">
                    <td className="pl-4 py-2">
                      <span className="text-xs text-gray-400 w-4 inline-block">{i + 1}</span>
                      <a
                        href={`/?team=${encodeURIComponent(r.team)}`}
                        className="font-medium hover:underline decoration-gray-300"
                      >
                        {teamDisplay(r.team, r.team)}
                      </a>
                      {liveTeams.has(r.team) && (
                        <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse align-middle" title="Playing now" />
                      )}
                    </td>
                    <td className="text-center text-gray-600">{r.mp}</td>
                    <td className="text-center text-gray-600">{r.w}</td>
                    <td className="text-center text-gray-600">{r.d}</td>
                    <td className="text-center text-gray-600">{r.l}</td>
                    <td className="text-center text-gray-600">{r.gf}</td>
                    <td className="text-center text-gray-600">{r.ga}</td>
                    <td className="text-center text-gray-600">{r.gd}</td>
                    <td className="text-center font-bold pr-4">{r.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  )
}
