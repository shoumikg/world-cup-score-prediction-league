import { createClient } from '@/lib/supabase/server'
import { computeLeaderboard } from '@/lib/leaderboard'
import { computeBonusCorrectness, isGroupStageComplete } from '@/lib/bonusTracker'
import { teamFlag } from '@/lib/flags'
import { OUTCOME_CLASSES, scoreOutcome, matchPoints } from '@/lib/scoring'
import { LiveRefresh } from '@/app/LiveRefresh'
import type { Match, Prediction, BonusGrade, BonusAnswer, MatchEvent } from '@/lib/types'
import type { LeaderboardProfile } from '@/lib/leaderboard'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage(props: {
  searchParams: Promise<{ bonus?: string; live?: string }>
}) {
  const { bonus: bonusParam, live: liveParam } = await props.searchParams
  // Three view modes (view-only — no data changes):
  //   default        → live scores + bonus
  //   ?bonus=off     → live scores, match points only
  //   ?live=off      → settled (finished matches only, no bonus)
  const showBonus = bonusParam !== 'off'
  const showLive = liveParam !== 'off'

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware will redirect

  // profiles: only safe columns — usernames must never reach this page
  const [
    { data: profiles },
    { data: matches },
    { data: preds },
    { data: grades },
    { data: bonusAnswers },
    { data: events },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, favorite_team, is_admin'),
    supabase.from('matches').select('*'),  // all matches (group-complete check needs unscored too)
    supabase.from('predictions').select('*'),
    supabase.from('bonus_grades').select('user_id, question_id, confirmed_answer'),
    supabase.from('bonus_answers').select('*'),
    supabase.from('match_events').select('*'),
  ])

  // Build confirmed Q1 map: user_id → canonical player name
  const confirmedQ1 = new Map<string, string>()
  for (const g of (grades ?? []) as Pick<BonusGrade, 'user_id' | 'question_id' | 'confirmed_answer'>[]) {
    if (g.question_id === 1 && g.confirmed_answer) confirmedQ1.set(g.user_id, g.confirmed_answer)
  }

  const derivedGrades = computeBonusCorrectness(
    (bonusAnswers ?? []) as BonusAnswer[],
    confirmedQ1,
    (events ?? []) as MatchEvent[],
    (matches ?? []) as Match[]
  )

  const allMatches = (matches ?? []) as Match[]
  const groupComplete = isGroupStageComplete(allMatches)

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null; is_admin: boolean | null }
  const playerProfiles = ((profiles ?? []) as ProfileRow[]).filter(p => !p.is_admin)

  // Settled mode: exclude in-progress matches entirely; bonus always off (bonus
  // derives from live event data, so it can't be consistent without live scores).
  const baseMatches = showLive ? allMatches : allMatches.filter(m => m.status !== 'live')

  const rows = computeLeaderboard(
    playerProfiles,
    (preds ?? []) as Prediction[],
    baseMatches,
    (showBonus && showLive) ? derivedGrades : []
  )

  // While a match is in progress the standings above already fold in live
  // scores. Diff them against a finished-only baseline so we can show how each
  // player is *projected* to move and how many of their points are still in play.
  const hasLive = showLive && allMatches.some(m => m.status === 'live')
  const liveInfo = new Map<string, { movement: number; inPlay: number }>()
  if (hasLive) {
    const finishedMatches = allMatches.filter(m => m.status !== 'live')
    const liveMatchById = new Map(allMatches.filter(m => m.status === 'live').map(m => [m.id, m]))
    const finishedEvents = ((events ?? []) as MatchEvent[]).filter(e => !liveMatchById.has(e.match_id))
    const baseDerivedGrades = computeBonusCorrectness(
      (bonusAnswers ?? []) as BonusAnswer[],
      confirmedQ1,
      finishedEvents,
      finishedMatches
    )
    const baselineRows = computeLeaderboard(
      playerProfiles,
      (preds ?? []) as Prediction[],
      finishedMatches,
      showBonus ? baseDerivedGrades : []
    )
    const baseline = new Map(baselineRows.map(r => [r.userId, r]))
    // Points in play = each player's match points from predictions on the games
    // currently in progress (match points only → always ≥ 0, and consistent with
    // the /live page). Bonus swings still surface through the projected rank arrow.
    const inPlayByUser = new Map<string, number>()
    for (const p of (preds ?? []) as Prediction[]) {
      const m = liveMatchById.get(p.match_id)
      if (!m) continue
      const o = scoreOutcome(p, m)
      if (o) inPlayByUser.set(p.user_id, (inPlayByUser.get(p.user_id) ?? 0) + matchPoints(o, m.stage))
    }
    for (const r of rows) {
      const b = baseline.get(r.userId)
      if (!b) continue
      liveInfo.set(r.userId, { movement: b.rank - r.rank, inPlay: inPlayByUser.get(r.userId) ?? 0 })
    }
  }

  const anyScored = rows.some(r => r.scored > 0 || r.bonusPoints > 0)
  const currentUserName = playerProfiles.find(p => p.id === user.id)?.display_name ?? ''

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <LiveRefresh hasLive={hasLive} />
      <h1 className="text-xl font-bold mb-1">Leaderboard</h1>
      <p className="text-sm text-gray-500 mb-3">
        {anyScored
          ? 'How everyone is doing so far.'
          : 'Everyone in the league. Tallies appear once results come in.'}
      </p>

      {/* Ranking basis toggle — view-only, switches via URL param */}
      <div className="mb-4 inline-flex rounded-lg border bg-gray-50 p-0.5 text-xs font-medium">
        <a
          href="/leaderboard"
          className={`px-3 py-1.5 rounded-md transition-colors ${
            showLive && showBonus ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Live + Bonus
        </a>
        <a
          href="/leaderboard?bonus=off"
          className={`px-3 py-1.5 rounded-md transition-colors ${
            showLive && !showBonus ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Match pts only
        </a>
        <a
          href="/leaderboard?live=off"
          className={`px-3 py-1.5 rounded-md transition-colors ${
            !showLive ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Settled
        </a>
      </div>

      {hasLive && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span className="text-amber-800">
            Standings are live — arrows show projected movement and <span className="font-semibold">⚡</span> points can still change.
          </span>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table className="min-w-[480px] w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 bg-gray-50 border-b">
              <th className="text-left font-medium pl-3 py-2 w-8 sticky left-0 bg-gray-50 z-10">#</th>
              <th className="text-left font-medium py-2 sticky left-8 bg-gray-50 z-10 pr-2">Player</th>
              <th className="font-medium w-14 py-2">Exact</th>
              <th className="font-medium w-14 py-2">GD</th>
              <th className="font-medium w-14 py-2">Result</th>
              <th className="font-medium w-14 py-2">Wrong</th>
              {showBonus && showLive && <th className="font-medium w-14 py-2">Bonus</th>}
              <th className="font-medium w-14 pr-3 py-2">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const info = liveInfo.get(r.userId)
              return (
              <tr key={r.userId} className="border-t first:border-0">
                <td className="pl-3 py-2.5 text-xs sticky left-0 bg-white z-10 whitespace-nowrap">
                  <span className="text-gray-400">{r.rank}</span>
                  {info && info.movement !== 0 && (
                    <span className={`ml-1 font-semibold ${info.movement > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {info.movement > 0 ? `▲${info.movement}` : `▼${-info.movement}`}
                    </span>
                  )}
                </td>
                <td className="py-2.5 font-medium sticky left-8 bg-white z-10 pr-2">
                  <div className="flex flex-col gap-1">
                    {r.userId === user.id ? (
                      <span>
                        <span className="mr-1.5">{teamFlag(r.favoriteTeam) ?? '🇮🇳'}</span>
                        {r.displayName}
                      </span>
                    ) : (
                      <a
                        href={`/compare?a=${encodeURIComponent(currentUserName)}&b=${encodeURIComponent(r.displayName)}`}
                        className="hover:underline decoration-gray-300"
                      >
                        <span className="mr-1.5">{teamFlag(r.favoriteTeam) ?? '🇮🇳'}</span>
                        {r.displayName}
                      </a>
                    )}
                    {/* Form strip on its own line — always rendered (fixed height) so every row is the same height */}
                    <span className="flex gap-0.5 items-center h-2.5">
                      {r.recentForm.map((outcome, j) => (
                        <span
                          key={j}
                          className={`inline-block w-2.5 h-2.5 rounded-sm ${OUTCOME_CLASSES[outcome].split(' ')[0]}`}
                          title={outcome}
                        />
                      ))}
                    </span>
                  </div>
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-green-700 text-white font-semibold text-xs">
                    {r.exact}
                  </span>
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-green-100 text-green-800 font-semibold text-xs">
                    {r.correct_gd}
                  </span>
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-yellow-100 text-yellow-800 font-semibold text-xs">
                    {r.correct}
                  </span>
                </td>
                <td className="text-center py-2.5">
                  <span className="inline-block w-8 px-1 py-0.5 rounded bg-red-100 text-red-700 font-semibold text-xs">
                    {r.wrong}
                  </span>
                </td>
                {showBonus && showLive && (
                  <td className="text-center py-2.5">
                    <span className="inline-block w-8 px-1 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold text-xs">
                      {r.bonusPoints}
                    </span>
                  </td>
                )}
                <td className="text-center py-2.5 pr-3 whitespace-nowrap">
                  <span className="font-bold text-gray-900 text-sm">{r.total}</span>
                  {info && info.inPlay > 0 && (
                    <span className="ml-1 text-[10px] font-semibold text-amber-600" title="Points in play from live matches">
                      ⚡+{info.inPlay}
                    </span>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Exact/GD/Result = 10/5/3 group · 15/8/5 knockout pts ·
        {!showLive
          ? <> Settled — live matches excluded · Bonus excluded · </>
          : showBonus
            ? <> Bonus = auto-scored from live standings{!groupComplete ? ' (provisional until group stage ends)' : ''} · </>
            : <> Bonus points excluded · </>}
        Missed predictions don't count against you.
      </p>
    </div>
  )
}
