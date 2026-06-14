import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatKickoffIST, isKickedOff } from '@/lib/time'
import { teamDisplay } from '@/lib/flags'
import { fetchSquads, normalizeOFTeamName } from '@/lib/openfootball'
import { TeamLink } from '@/app/TeamLink'
import { AdminResultForm } from './AdminResultForm'
import { AdminKnockoutForm } from './AdminKnockoutForm'
import { AdminMatchEventsForm } from './AdminMatchEventsForm'
import type { Match, MatchEvent } from '@/lib/types'
import type { OFPlayer } from '@/lib/openfootball'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const [
    { data: matches },
    { data: events },
    squads,
  ] = await Promise.all([
    supabase.from('matches').select('*').order('kickoff_utc'),
    supabase.from('match_events').select('*'),
    fetchSquads().catch(() => null),
  ])

  const all = (matches ?? []) as Match[]
  const eventList = (events ?? []) as MatchEvent[]

  // Map from DB team name → squad players, for the goal-scorer name suggestions.
  const squadMap = new Map<string, OFPlayer[]>()
  if (squads) {
    for (const squad of squads) {
      squadMap.set(normalizeOFTeamName(squad.name), squad.players)
    }
  }

  // Reverse chronological (most recent first): the newest matches are the ones
  // needing manual result / goal-scorer entry, while older ones are usually
  // already covered by the openfootball backfill.
  const started = all
    .filter(m => isKickedOff(m.kickoff_utc))
    .sort((a, b) => b.kickoff_utc.localeCompare(a.kickoff_utc))
  const knockouts = all.filter(m => m.stage !== 'group' && !m.home_team)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-10">
      <h1 className="text-xl font-bold">Admin Panel</h1>

      {/* Results entry */}
      <section>
        <h2 className="text-base font-semibold mb-3 text-gray-700">Enter / Update Results</h2>
        {started.length === 0 ? (
          <p className="text-sm text-gray-400">No matches have started yet.</p>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm divide-y px-4">
            {started.map(m => (
              <div key={m.id} className="py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400">#{m.id}</span>
                  <span className="text-sm font-medium">
                    <TeamLink team={m.home_team} fallback={m.home_source ?? ''} />
                    {' '}vs{' '}
                    <TeamLink team={m.away_team} fallback={m.away_source ?? ''} />
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{formatKickoffIST(m.kickoff_utc)} IST</span>
                </div>
                <AdminResultForm match={m} />
                <AdminMatchEventsForm
                  matchId={m.id}
                  homeLabel={teamDisplay(m.home_team, m.home_source ?? 'Home')}
                  awayLabel={teamDisplay(m.away_team, m.away_source ?? 'Away')}
                  homePlayers={(squadMap.get(m.home_team ?? '') ?? []).map(p => p.name).sort()}
                  awayPlayers={(squadMap.get(m.away_team ?? '') ?? []).map(p => p.name).sort()}
                  events={eventList.filter(e => e.match_id === m.id)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Knockout team fill */}
      <section>
        <h2 className="text-base font-semibold mb-3 text-gray-700">Fill Knockout Teams</h2>
        {knockouts.length === 0 ? (
          <p className="text-sm text-gray-400">All knockout teams are filled in.</p>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm divide-y px-4">
            {knockouts.map(m => (
              <div key={m.id} className="py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400">#{m.id}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                    {m.stage.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">
                    {m.home_source} vs {m.away_source}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{formatKickoffIST(m.kickoff_utc)} IST</span>
                </div>
                <AdminKnockoutForm match={m} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
