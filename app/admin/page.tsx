import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatKickoffIST, isKickedOff } from '@/lib/time'
import { teamDisplay } from '@/lib/flags'
import { fetchSquads, normalizeOFTeamName } from '@/lib/openfootball'
import { TeamLink } from '@/app/TeamLink'
import { rankQualifiedThirds } from '@/lib/knockout'
import { AdminResultForm } from './AdminResultForm'
import { AdminKnockoutForm } from './AdminKnockoutForm'
import { AdminKickoffForm } from './AdminKickoffForm'
import { AdminKnockoutAutofill } from './AdminKnockoutAutofill'
import { AdminMatchEventsForm } from './AdminMatchEventsForm'
import type { Match, MatchEvent } from '@/lib/types'
import type { OFPlayer } from '@/lib/openfootball'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

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
  const knockouts = all.filter(m => m.stage !== 'group' && (!m.home_team || !m.away_team))
  // Every knockout match, for editing kickoff times regardless of team status.
  const allKnockouts = all
    .filter(m => m.stage !== 'group')
    .sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc))

  // Ranked third-placed teams to help the admin fill the 8 "Best 3rd" R32 slots,
  // which aren't auto-assigned (FIFA's combination table decides which slot each
  // qualifying third lands in). Only shown once there's at least one to rank.
  const thirds = rankQualifiedThirds(all)

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
                  {(m.status === 'aet' || m.status === 'pen') && m.reg_home_score === null && (
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      90′ score needed
                    </span>
                  )}
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

        <div className="mb-4">
          <AdminKnockoutAutofill />
        </div>

        {thirds.length > 0 && (
          <div className="mb-4 bg-white rounded-xl border shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Third-placed teams · ranked</h3>
            <p className="text-xs text-gray-400 mb-3">
              Top 8 qualify for the round of 32. Use these to fill the “Best 3rd (…)” slots below —
              each slot’s label lists which groups it may draw from.
            </p>
            <div className="divide-y">
              {thirds.map((r, i) => (
                <div key={r.team} className={`flex items-center gap-3 py-1.5 text-sm ${r.qualifies ? '' : 'opacity-50'}`}>
                  <span className="w-5 text-xs text-gray-400 text-right">{i + 1}</span>
                  <span className="w-6 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium text-center">{r.group}</span>
                  <span className="flex-1 font-medium">{teamDisplay(r.team, r.team)}</span>
                  <span className="text-xs text-gray-400 tabular-nums">{r.pts} pts · GD {r.gd >= 0 ? '+' : ''}{r.gd} · GF {r.gf}</span>
                  {r.qualifies
                    ? <span className="text-xs font-medium text-green-600 w-16 text-right">qualifies</span>
                    : <span className="text-xs text-gray-400 w-16 text-right">out</span>}
                </div>
              ))}
            </div>
          </div>
        )}

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

      {/* Knockout kickoff times — editable for every knockout match */}
      <section>
        <h2 className="text-base font-semibold mb-3 text-gray-700">Knockout Kickoff Times</h2>
        {allKnockouts.length === 0 ? (
          <p className="text-sm text-gray-400">No knockout matches.</p>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm divide-y px-4">
            {allKnockouts.map(m => (
              <div key={m.id} className="py-3 flex flex-wrap items-center gap-x-2 gap-y-2">
                <span className="text-xs text-gray-400">#{m.id}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                  {m.stage.toUpperCase()}
                </span>
                <span className="text-sm font-medium">
                  <TeamLink team={m.home_team} fallback={m.home_source ?? ''} />
                  {' '}vs{' '}
                  <TeamLink team={m.away_team} fallback={m.away_source ?? ''} />
                </span>
                <div className="ml-auto">
                  <AdminKickoffForm matchId={m.id} kickoffUtc={m.kickoff_utc} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
