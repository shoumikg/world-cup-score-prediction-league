import { createClient } from '@/lib/supabase/server'
import { formatKickoffIST, isDeadlinePassed } from '@/lib/time'
import { MatchRow } from '@/app/MatchRow'
import { LiveRefresh } from '@/app/LiveRefresh'
import type { Match, Prediction, PickEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function LivePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: matches }, { data: allPreds }, { data: profiles }] = await Promise.all([
    supabase.from('matches').select('*').eq('status', 'live').order('kickoff_utc'),
    supabase.from('predictions').select('*'),
    supabase.from('profiles').select('id, display_name, favorite_team, is_admin'),
  ])

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null; is_admin: boolean | null }
  const profileList = ((profiles ?? []) as ProfileRow[]).filter(p => !p.is_admin)

  const liveMatches = (matches ?? []) as Match[]

  const predMap = new Map<number, Prediction>()
  const predByMatchUser = new Map<string, { homePred: number; awayPred: number }>()
  for (const p of (allPreds ?? []) as Prediction[]) {
    if (p.user_id === user.id) predMap.set(p.match_id, p)
    predByMatchUser.set(`${p.match_id}:${p.user_id}`, { homePred: p.home_pred, awayPred: p.away_pred })
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6">
      {/* Always refresh on this page — catches matches going live even when the list is empty */}
      <LiveRefresh hasLive={true} />

      <h1 className="text-xl font-bold mb-6 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
        Live Matches
      </h1>

      {liveMatches.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm px-4 py-10 text-center">
          <p className="text-sm text-gray-500">No matches are live right now.</p>
          <a href="/" className="mt-3 inline-block text-sm text-green-600 hover:underline">
            View full schedule →
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm px-3 sm:px-4">
          {liveMatches.map(m => {
            const picks: PickEntry[] = profileList
              .map(profile => ({
                displayName: profile.display_name,
                favoriteTeam: profile.favorite_team,
                isSelf: profile.id === user.id,
                prediction: predByMatchUser.get(`${m.id}:${profile.id}`) ?? null,
              }))
              .sort((a, b) => a.displayName.localeCompare(b.displayName))

            return (
              <div key={m.id}>
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
      )}
    </div>
  )
}
