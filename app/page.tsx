import { createClient } from '@/lib/supabase/server'
import { istDateKey, formatDateIST, formatKickoffIST, isKickedOff, isDeadlinePassed, predictionDeadlineUTC } from '@/lib/time'
import { MatchRow } from '@/app/MatchRow'
import { DeadlineCountdown } from '@/app/DeadlineCountdown'
import type { Match, Prediction, PickEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware will redirect

  const [{ data: matches }, { data: allPreds }, { data: profiles }] = await Promise.all([
    supabase.from('matches').select('*').order('kickoff_utc'),
    supabase.from('predictions').select('*'), // RLS: own always + others' after deadline
    supabase.from('profiles').select('id, display_name, favorite_team'),
  ])

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null }
  const profileList = (profiles ?? []) as ProfileRow[]

  // own prediction per match (always returned by RLS)
  const predMap = new Map<number, Prediction>()
  // flat lookup for building per-match pick lists
  const predByMatchUser = new Map<string, { homePred: number; awayPred: number }>()
  for (const p of (allPreds ?? []) as Prediction[]) {
    if (p.user_id === user.id) predMap.set(p.match_id, p)
    predByMatchUser.set(`${p.match_id}:${p.user_id}`, { homePred: p.home_pred, awayPred: p.away_pred })
  }

  const totalPlayers = profileList.length

  // Group matches by IST calendar date
  const groups = new Map<string, Match[]>()
  for (const m of (matches ?? []) as Match[]) {
    const key = istDateKey(m.kickoff_utc)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }

  // Find next upcoming match for the anchor
  const nextMatch = (matches as Match[] | null)?.find(
    m => !isKickedOff(m.kickoff_utc)
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-6">
        <h1 className="text-xl font-bold">Schedule & Predictions</h1>
        {nextMatch && (
          <a
            href={`#match-${nextMatch.id}`}
            className="text-sm text-green-600 hover:underline whitespace-nowrap"
          >
            Jump to next match →
          </a>
        )}
      </div>

      <div className="mb-4 text-xs text-gray-400 flex gap-4 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300"></span> Exact score
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> Correct result
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300"></span> Wrong
        </span>
      </div>

      {Array.from(groups.entries()).map(([dateKey, dayMatches]) => {
        const deadline = predictionDeadlineUTC(dayMatches[0].kickoff_utc)
        const deadlinePassed = deadline <= new Date()
        return (
          <section key={dateKey} className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 sticky top-20 bg-gray-50 py-1 z-10 flex items-baseline justify-between flex-wrap gap-x-3">
              <span>{formatDateIST(dayMatches[0].kickoff_utc)}</span>
              <span className={`text-xs font-normal normal-case tracking-normal ${deadlinePassed ? 'text-red-400' : 'text-gray-400'}`}>
                Deadline {formatKickoffIST(deadline.toISOString())} IST{deadlinePassed ? ' · closed' : <DeadlineCountdown deadlineISO={deadline.toISOString()} />}
              </span>
            </h2>
            <div className="bg-white rounded-xl border shadow-sm px-4">
              {dayMatches.map(m => {
                const picks: PickEntry[] | undefined = isDeadlinePassed(m.kickoff_utc)
                  ? profileList
                      .map(profile => ({
                        displayName: profile.display_name,
                        favoriteTeam: profile.favorite_team,
                        prediction: predByMatchUser.get(`${m.id}:${profile.id}`) ?? null,
                      }))
                      .sort((a, b) => a.displayName.localeCompare(b.displayName))
                  : undefined
                return (
                  <div key={m.id} id={`match-${m.id}`} className="scroll-mt-28">
                    <div className="text-xs text-gray-400 pt-3 pb-1">
                      {formatKickoffIST(m.kickoff_utc)} IST
                    </div>
                    <MatchRow
                      match={m}
                      prediction={predMap.get(m.id)}
                      isLocked={isDeadlinePassed(m.kickoff_utc)}
                      picks={picks}
                      totalPlayers={totalPlayers}
                    />
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
