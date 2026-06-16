import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { computeGroupStandings } from '@/lib/standings'
import { formatKickoffIST, isDeadlinePassed } from '@/lib/time'
import { MatchRow } from '@/app/MatchRow'
import { GroupTable } from '@/app/GroupTable'
import { LiveRefresh } from '@/app/LiveRefresh'
import type { Match, Prediction, PickEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function GroupPage(props: { params: Promise<{ group: string }> }) {
  const { group } = await props.params
  const groupName = group.toUpperCase()

  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()

  const [{ data: matchesRaw }, { data: allPredsRaw }, { data: profilesRaw }] = await Promise.all([
    supabase.from('matches').select('*').eq('stage', 'group').eq('group_name', groupName).order('kickoff_utc'),
    supabase.from('predictions').select('*'),
    supabase.from('profiles').select('id, display_name, favorite_team, is_admin'),
  ])

  const allMatches = (matchesRaw ?? []) as Match[]
  if (allMatches.length === 0) notFound()

  const predMap = new Map<number, Prediction>()
  const predByMatchUser = new Map<string, { homePred: number; awayPred: number }>()
  for (const p of (allPredsRaw ?? []) as Prediction[]) {
    if (p.user_id === user.id) predMap.set(p.match_id, p)
    predByMatchUser.set(`${p.match_id}:${p.user_id}`, { homePred: p.home_pred, awayPred: p.away_pred })
  }

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null; is_admin: boolean | null }
  const profileList = ((profilesRaw ?? []) as ProfileRow[]).filter(p => !p.is_admin)

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
      <Link href="/groups" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">← Group Tables</Link>

      <div className="mb-6">
        <GroupTable group={groupName} rows={groupRows} liveTeams={liveTeams} />
      </div>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Matches</h2>
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
    </div>
  )
}
