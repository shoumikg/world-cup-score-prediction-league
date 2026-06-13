import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computeGroupStandings } from '@/lib/standings'
import { formatKickoffIST, isDeadlinePassed } from '@/lib/time'
import { MatchRow } from '@/app/MatchRow'
import { GroupTable } from '@/app/GroupTable'
import { SquadSection } from '@/app/SquadSection'
import { LiveRefresh } from '@/app/LiveRefresh'
import { teamDisplay } from '@/lib/flags'
import { fetchSquads, findSquad } from '@/lib/openfootball'
import type { Match, Prediction, PickEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function GroupPage(props: { params: Promise<{ group: string }> }) {
  const { group } = await props.params
  const groupName = group.toUpperCase()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: matchesRaw }, { data: allPredsRaw }, { data: profilesRaw }, squads] = await Promise.all([
    supabase.from('matches').select('*').eq('stage', 'group').eq('group_name', groupName).order('kickoff_utc'),
    supabase.from('predictions').select('*'),
    supabase.from('profiles').select('id, display_name, favorite_team'),
    fetchSquads().catch(() => null),
  ])

  const allMatches = (matchesRaw ?? []) as Match[]
  if (allMatches.length === 0) notFound()

  // Derive the 4 teams in this group from the match data (avoids a hard-coded list)
  const groupTeams = [...new Set(
    allMatches.flatMap(m => [m.home_team, m.away_team]).filter(Boolean) as string[]
  )].sort()

  const predMap = new Map<number, Prediction>()
  const predByMatchUser = new Map<string, { homePred: number; awayPred: number }>()
  for (const p of (allPredsRaw ?? []) as Prediction[]) {
    if (p.user_id === user.id) predMap.set(p.match_id, p)
    predByMatchUser.set(`${p.match_id}:${p.user_id}`, { homePred: p.home_pred, awayPred: p.away_pred })
  }

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null }
  const profileList = (profilesRaw ?? []) as ProfileRow[]

  const standings = computeGroupStandings(allMatches)
  const groupRows = standings.get(groupName) ?? []

  const liveTeams = new Set(
    allMatches
      .filter(m => m.status === 'live')
      .flatMap(m => [m.home_team, m.away_team])
      .filter(Boolean) as string[]
  )
  const hasLive = liveTeams.size > 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <LiveRefresh hasLive={hasLive} />
      <a href="/groups" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">← Group Tables</a>

      <div className="mb-6">
        <GroupTable group={groupName} rows={groupRows} liveTeams={liveTeams} />
      </div>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-6">Matches</h2>
      <div className="bg-white rounded-xl border shadow-sm px-3 sm:px-4">
        {allMatches.map(m => {
          const picks: PickEntry[] | undefined = isDeadlinePassed(m.kickoff_utc)
            ? profileList
                .map(profile => ({
                  displayName: profile.display_name,
                  favoriteTeam: profile.favorite_team,
                  isSelf: profile.id === user.id,
                  prediction: predByMatchUser.get(`${m.id}:${profile.id}`) ?? null,
                }))
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
            : undefined
          return (
            <div key={m.id} id={`match-${m.id}`}>
              <div className="text-xs text-gray-400 pt-3 pb-1">
                {formatKickoffIST(m.kickoff_utc)} IST
              </div>
              <MatchRow
                match={m}
                prediction={predMap.get(m.id)}
                isLocked={isDeadlinePassed(m.kickoff_utc)}
                picks={picks}
              />
            </div>
          )
        })}
      </div>

      {squads && groupTeams.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-8 mb-4">Squads</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groupTeams.map(team => {
              const squad = findSquad(squads, team)
              if (!squad) return null
              return (
                <div key={team}>
                  <a href={`/?team=${encodeURIComponent(team)}`}
                    className="text-sm font-semibold text-gray-700 hover:underline inline-block mb-2">
                    {teamDisplay(team, team)}
                  </a>
                  <SquadSection players={squad.players} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
