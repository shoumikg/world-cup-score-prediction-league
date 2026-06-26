import Link from 'next/link'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllPredictions } from '@/lib/predictions'
import { formatKickoffIST, isDeadlinePassed } from '@/lib/time'
import { scoreOutcome, matchPoints } from '@/lib/scoring'
import { MatchRow } from '@/app/MatchRow'
import { LiveRefresh } from '@/app/LiveRefresh'
import { LivePickGrades } from '@/app/LivePickGrades'
import type { Match, Prediction, PickEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function LivePage() {
  const user = await getAuthUser()
  if (!user) return null
  const supabase = await createClient()

  const [{ data: matches }, allPreds, { data: profiles }] = await Promise.all([
    supabase.from('matches').select('*').eq('status', 'live').order('kickoff_utc'),
    fetchAllPredictions(supabase),
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

  // Points the current user is provisionally earning across all live matches —
  // sums their own pick's outcome against each in-progress score.
  const pointsInPlay = liveMatches.reduce((sum, m) => {
    const own = predMap.get(m.id)
    if (!own) return sum
    const outcome = scoreOutcome(own, m)
    return outcome ? sum + matchPoints(outcome, m.stage) : sum
  }, 0)

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6">
      {/* Always refresh on this page — catches matches going live even when the list is empty */}
      <LiveRefresh hasLive={true} />

      <h1 className="text-xl font-bold mb-3 flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
        Live Matches
      </h1>

      {liveMatches.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="font-semibold text-amber-800">
            {liveMatches.length} match{liveMatches.length !== 1 ? 'es' : ''} in play
          </span>
          <span className="text-amber-300">·</span>
          <span className="text-amber-700">
            You have <span className="font-bold">{pointsInPlay}</span> point{pointsInPlay !== 1 ? 's' : ''} in play right now
          </span>
        </div>
      )}

      {liveMatches.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm px-4 py-10 text-center">
          <p className="text-sm text-gray-500">No matches are live right now.</p>
          <Link href="/" className="mt-3 inline-block text-sm text-green-600 hover:underline">
            View full schedule →
          </Link>
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
                <LivePickGrades match={m} picks={picks} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
