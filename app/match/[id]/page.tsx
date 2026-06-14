import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatKickoffIST, isDeadlinePassed, predictionDeadlineUTC } from '@/lib/time'
import { teamDisplay, teamFlag } from '@/lib/flags'
import { TeamLink } from '@/app/TeamLink'
import { scoreColor, scoreOutcome, stageLabel, OUTCOME_CLASSES } from '@/lib/scoring'
import { DeadlineCountdown } from '@/app/DeadlineCountdown'
import type { Match, Prediction, PickEntry, MatchEvent } from '@/lib/types'

export const dynamic = 'force-dynamic'

function GoalLine({ event: e }: { event: MatchEvent }) {
  const minuteStr = e.minute != null
    ? `${e.minute}${e.extra_time != null ? `+${e.extra_time}` : ''}'`
    : '–'
  return (
    <div className="text-sm leading-snug">
      <span className="text-xs text-gray-400 inline-block w-9 tabular-nums shrink-0">{minuteStr}</span>
      <span className="font-medium">{e.player_name}</span>
      {e.type === 'own_goal' && <span className="text-xs text-red-400 ml-1">(og)</span>}
      {e.type === 'penalty'  && <span className="text-xs text-gray-400 ml-1">(pen)</span>}
      {e.assist_name && <span className="text-xs text-gray-400 ml-1">· {e.assist_name}</span>}
    </div>
  )
}

export default async function MatchPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const matchId = parseInt(id, 10)
  if (isNaN(matchId)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: matchRaw }, { data: predsRaw }, { data: profilesRaw }, { data: eventsRaw }] = await Promise.all([
    supabase.from('matches').select('*').eq('id', matchId).single(),
    supabase.from('predictions').select('*').eq('match_id', matchId),
    supabase.from('profiles').select('id, display_name, favorite_team, is_admin'),
    supabase.from('match_events').select('*').eq('match_id', matchId).order('minute').order('extra_time'),
  ])

  if (!matchRaw) notFound()

  const match = matchRaw as Match
  const preds = (predsRaw ?? []) as Prediction[]
  type ProfileRow = { id: string; display_name: string; favorite_team: string | null; is_admin: boolean | null }
  const profiles = ((profilesRaw ?? []) as ProfileRow[]).filter(p => !p.is_admin)
  const events = (eventsRaw ?? []) as MatchEvent[]

  const deadlinePassed = isDeadlinePassed(match.kickoff_utc)
  const deadline = predictionDeadlineUTC(match.kickoff_utc)
  const ownPred = preds.find(p => p.user_id === user.id)
  const hasResult = match.home_score !== null

  // Plain team labels for the aggregate pick-split chips (counts, not links).
  const homeName = teamDisplay(match.home_team, match.home_source ?? 'TBD')
  const awayName = teamDisplay(match.away_team, match.away_source ?? 'TBD')

  // Build pick list — RLS returns others' picks only after deadline
  const predMap = new Map(preds.map(p => [p.user_id, p]))
  const picksList: PickEntry[] = profiles.map(profile => ({
    displayName: profile.display_name,
    favoriteTeam: profile.favorite_team,
    isSelf: profile.id === user.id,
    prediction: predMap.has(profile.id)
      ? { homePred: predMap.get(profile.id)!.home_pred, awayPred: predMap.get(profile.id)!.away_pred }
      : null,
  }))

  const OUTCOME_RANK: Record<string, number> = { exact: 0, correct_gd: 1, correct: 2, wrong: 3 }
  const fakePred = (homePred: number, awayPred: number): Prediction =>
    ({ user_id: '', match_id: match.id, home_pred: homePred, away_pred: awayPred, updated_at: '' })

  const sortedPicks = deadlinePassed
    ? [...picksList].sort((a, b) => {
        if (hasResult) {
          const ra = a.prediction
            ? (OUTCOME_RANK[scoreOutcome(fakePred(a.prediction.homePred, a.prediction.awayPred), match)!] ?? 4)
            : 4
          const rb = b.prediction
            ? (OUTCOME_RANK[scoreOutcome(fakePred(b.prediction.homePred, b.prediction.awayPred), match)!] ?? 4)
            : 4
          if (ra !== rb) return ra - rb
        }
        return a.displayName.localeCompare(b.displayName)
      })
    : []

  // Histogram: group predictions by scoreline
  const scoreMap = new Map<string, { homePred: number; awayPred: number; count: number; isSelf: boolean }>()
  for (const entry of picksList) {
    if (!entry.prediction) continue
    const key = `${entry.prediction.homePred}-${entry.prediction.awayPred}`
    const cur = scoreMap.get(key) ?? { homePred: entry.prediction.homePred, awayPred: entry.prediction.awayPred, count: 0, isSelf: false }
    cur.count++
    if (entry.isSelf) cur.isSelf = true
    scoreMap.set(key, cur)
  }
  const histogram = [...scoreMap.values()].sort((a, b) => b.count - a.count)
  const maxCount = histogram[0]?.count ?? 1

  const predictedCount = picksList.filter(p => p.prediction !== null).length
  const homeWins = picksList.filter(p => p.prediction && p.prediction.homePred > p.prediction.awayPred).length
  const draws    = picksList.filter(p => p.prediction && p.prediction.homePred === p.prediction.awayPred).length
  const awayWins = picksList.filter(p => p.prediction && p.prediction.homePred < p.prediction.awayPred).length

  const scoreChip = !hasResult ? null : match.status === 'live' ? (
    <span className="inline-flex items-center gap-1.5 bg-green-600 text-white rounded px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
      <span className="text-xs font-semibold">{match.live_minute != null ? `${match.live_minute}'` : 'LIVE'}</span>
      <span className="text-xl font-bold">{match.home_score}–{match.away_score}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 bg-gray-800 text-white rounded px-2.5 py-1">
      <span className="text-xs font-medium text-gray-400">
        {match.status === 'aet' ? 'AET' : match.status === 'pen' ? 'PEN' : 'FT'}
      </span>
      <span className="text-xl font-bold">{match.home_score}–{match.away_score}</span>
    </span>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <a href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">← Schedule</a>

      {/* Match header */}
      <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            match.stage === 'group' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}>
            {match.stage === 'group' ? `Group ${match.group_name}` : stageLabel(match.stage)}
          </span>
          <span className="text-xs text-gray-400">{formatKickoffIST(match.kickoff_utc)} IST</span>
          {match.venue && <span className="text-xs text-gray-400">· {match.venue}</span>}
        </div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-base font-semibold flex-1">
            <TeamLink team={match.home_team} fallback={match.home_source ?? 'TBD'} />
          </p>
          <div className="shrink-0">
            {scoreChip ?? <span className="text-sm text-gray-400 px-2">vs</span>}
          </div>
          <p className="text-base font-semibold flex-1 text-right">
            <TeamLink team={match.away_team} fallback={match.away_source ?? 'TBD'} />
          </p>
        </div>
        <div className="border-t pt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 shrink-0">Your pick</span>
          {ownPred ? (
            <span className={`text-sm font-semibold px-2 py-0.5 rounded ${
              hasResult ? scoreColor(ownPred, match) : 'bg-gray-100 text-gray-700'
            }`}>
              {ownPred.home_pred}–{ownPred.away_pred}
            </span>
          ) : (
            <span className="text-sm text-gray-400 italic">No pick</span>
          )}
          {!deadlinePassed && (
            <>
              <span className="text-gray-200 text-xs">·</span>
              <span className="text-xs text-gray-400">
                Closes {formatKickoffIST(deadline.toISOString())} IST
                <DeadlineCountdown deadlineISO={deadline.toISOString()} />
              </span>
              <a href="/" className="text-xs text-green-600 hover:underline shrink-0">Edit →</a>
            </>
          )}
        </div>
      </div>

      {/* Goal scorers — shown as soon as events exist */}
      {events.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Goal scorers</p>
          <div className="flex gap-4">
            {/* Home goals */}
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-2 truncate font-medium">
                <TeamLink team={match.home_team} fallback={match.home_source ?? 'TBD'} />
              </p>
              <div className="space-y-1.5">
                {events.filter(e => e.team === 'home').length > 0
                  ? events.filter(e => e.team === 'home').map(e => (
                      <GoalLine key={e.id} event={e} />
                    ))
                  : <span className="text-xs text-gray-300 italic">–</span>
                }
              </div>
            </div>
            {/* Divider */}
            <div className="w-px bg-gray-100 shrink-0" />
            {/* Away goals */}
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-2 truncate font-medium">
                <TeamLink team={match.away_team} fallback={match.away_source ?? 'TBD'} />
              </p>
              <div className="space-y-1.5">
                {events.filter(e => e.team === 'away').length > 0
                  ? events.filter(e => e.team === 'away').map(e => (
                      <GoalLine key={e.id} event={e} />
                    ))
                  : <span className="text-xs text-gray-300 italic">–</span>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post-deadline sections */}
      {deadlinePassed && (
        <>
          {/* Score distribution histogram */}
          {histogram.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Score distribution · {predictedCount} pick{predictedCount !== 1 ? 's' : ''}
              </p>
              <div className="space-y-1.5">
                {histogram.map(({ homePred, awayPred, count, isSelf }) => {
                  const outcome = hasResult ? scoreOutcome(fakePred(homePred, awayPred), match) : null
                  const barBg = outcome
                    ? OUTCOME_CLASSES[outcome].split(' ')[0]
                    : 'bg-gray-200'
                  return (
                    <div key={`${homePred}-${awayPred}`} className="flex items-center gap-2">
                      <span className={`text-xs font-semibold w-9 text-right shrink-0 px-1 py-0.5 rounded ${
                        outcome ? OUTCOME_CLASSES[outcome] : 'bg-gray-100 text-gray-600'
                      }`}>
                        {homePred}–{awayPred}
                      </span>
                      <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                        <div
                          className={`h-full rounded transition-all ${barBg}`}
                          style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-4 text-right shrink-0">{count}</span>
                      {isSelf
                        ? <span className="text-xs text-green-600 font-medium w-6 shrink-0">you</span>
                        : <span className="w-6 shrink-0" />
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Result split */}
          {predictedCount > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-4 mb-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Predicted result split</p>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                  {homeName} <span className="font-semibold ml-1">{homeWins}</span>
                </span>
                <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                  Draw <span className="font-semibold ml-1">{draws}</span>
                </span>
                <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                  {awayName} <span className="font-semibold ml-1">{awayWins}</span>
                </span>
              </div>
            </div>
          )}

          {/* All picks */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">All picks</p>
            <div>
              {sortedPicks.map((entry, i) => (
                  <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                    entry.isSelf ? 'bg-green-50 dark:bg-green-500/10' : 'odd:bg-gray-50'
                  }`}>
                    <span className={`text-sm min-w-0 flex-1 truncate ${
                      entry.isSelf ? 'text-green-900 dark:text-green-300 font-semibold' : 'text-gray-700'
                    }`}>
                      {teamFlag(entry.favoriteTeam) && (
                        <span className="mr-1">{teamFlag(entry.favoriteTeam)}</span>
                      )}
                      {entry.displayName}
                    </span>
                    {entry.prediction !== null ? (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                        hasResult
                          ? scoreColor(fakePred(entry.prediction.homePred, entry.prediction.awayPred), match)
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {entry.prediction.homePred}–{entry.prediction.awayPred}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300 italic shrink-0">no pick</span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
