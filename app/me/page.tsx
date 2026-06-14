import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { scoreOutcome, matchPoints, OUTCOME_CLASSES } from '@/lib/scoring'
import { teamFlag, teamDisplay } from '@/lib/flags'
import { formatKickoffIST } from '@/lib/time'
import { computeLeaderboard } from '@/lib/leaderboard'
import { computeBonusCorrectness } from '@/lib/bonusTracker'
import { GROUP_BONUS_QUESTIONS } from '@/lib/bonus'
import { TeamLink } from '@/app/TeamLink'
import { LiveRefresh } from '@/app/LiveRefresh'
import type { Match, Prediction, BonusGrade, BonusAnswer, MatchEvent } from '@/lib/types'
import type { Outcome } from '@/lib/scoring'

export const dynamic = 'force-dynamic'

// SVG chart dimensions
const CW = 600, CH = 120
const PL = 40, PR = 15, PT = 12, PB = 22
const IW = CW - PL - PR
const IH = CH - PT - PB

const OUTCOME_DOT: Record<Outcome, string> = {
  exact:      '#15803d',
  correct_gd: '#4ade80',
  correct:    '#fbbf24',
  wrong:      '#f87171',
}

export default async function MePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profileData },
    { data: matchesRaw },
    { data: myPredsRaw },
    { data: myBonusAnswersRaw },
    { data: eventsRaw },
    { data: allPredsRaw },
    { data: allBonusAnswersRaw },
    { data: allGradesRaw },
    { data: allProfilesRaw },
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, favorite_team, is_admin').eq('id', user.id).single(),
    supabase.from('matches').select('*').order('kickoff_utc'),
    supabase.from('predictions').select('*').eq('user_id', user.id),
    supabase.from('bonus_answers').select('*').eq('user_id', user.id),
    supabase.from('match_events').select('*'),
    supabase.from('predictions').select('*'),
    supabase.from('bonus_answers').select('*'),
    supabase.from('bonus_grades').select('user_id, question_id, confirmed_answer'),
    supabase.from('profiles').select('id, display_name, favorite_team, is_admin'),
  ])

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null; is_admin: boolean | null }
  const me = profileData as ProfileRow | null
  if (!me) redirect('/login')

  const allMatches    = (matchesRaw      ?? []) as Match[]
  const myPreds       = (myPredsRaw      ?? []) as Prediction[]
  const myBonusAns    = (myBonusAnswersRaw ?? []) as BonusAnswer[]
  const events        = (eventsRaw       ?? []) as MatchEvent[]
  const allPreds      = (allPredsRaw     ?? []) as Prediction[]
  const allBonusAns   = (allBonusAnswersRaw ?? []) as BonusAnswer[]
  type GradeRow = { user_id: string; question_id: number; confirmed_answer: string | null }
  const allGrades     = (allGradesRaw    ?? []) as GradeRow[]
  const allProfiles   = (allProfilesRaw  ?? []) as ProfileRow[]

  const confirmedQ1 = new Map<string, string>()
  for (const g of allGrades) {
    if (g.question_id === 1 && g.confirmed_answer) confirmedQ1.set(g.user_id, g.confirmed_answer)
  }

  const allDerivedGrades = computeBonusCorrectness(allBonusAns, confirmedQ1, events, allMatches)

  const playerProfiles = allProfiles.filter(p => !p.is_admin)
  const leaderboard = computeLeaderboard(playerProfiles, allPreds, allMatches, allDerivedGrades)
  const myRow = leaderboard.find(r => r.userId === user.id)

  // While a match is live my total/rank above already fold in the in-progress
  // score. Diff against a finished-only baseline to surface how many of my
  // points are still provisional and where I'm projected to land.
  const hasLive = allMatches.some(m => m.status === 'live')
  let myInPlay = 0
  let myMovement = 0
  if (hasLive && myRow) {
    const baseLb = computeLeaderboard(
      playerProfiles, allPreds, allMatches.filter(m => m.status !== 'live'), allDerivedGrades
    )
    const myBase = baseLb.find(r => r.userId === user.id)
    if (myBase) {
      myInPlay = myRow.total - myBase.total
      myMovement = myBase.rank - myRow.rank
    }
  }

  // My bonus data for display
  const myGradeMap = new Map<number, boolean>()
  for (const g of allDerivedGrades.filter(g => g.user_id === user.id)) {
    myGradeMap.set(g.question_id, g.is_correct)
  }
  const myBonusMap = new Map<number, BonusAnswer>()
  for (const a of myBonusAns) myBonusMap.set(a.question_id, a)

  // Scored predictions with outcomes
  const matchById = new Map<number, Match>()
  for (const m of allMatches) matchById.set(m.id, m)

  interface ScoredPred { match: Match; pred: Prediction; outcome: Outcome; pts: number }
  const scoredPreds: ScoredPred[] = []
  for (const pred of myPreds) {
    const match = matchById.get(pred.match_id)
    if (!match || match.home_score === null || match.away_score === null) continue
    const outcome = scoreOutcome(pred, match)
    if (!outcome) continue
    scoredPreds.push({ match, pred, outcome, pts: matchPoints(outcome, match.stage) })
  }
  scoredPreds.sort((a, b) => a.match.kickoff_utc.localeCompare(b.match.kickoff_utc))

  const pendingCount = myPreds.filter(p => {
    const m = matchById.get(p.match_id)
    return m && (m.home_score === null || m.away_score === null)
  }).length

  // Outcome totals
  const c = { exact: 0, correct_gd: 0, correct: 0, wrong: 0 }
  for (const sp of scoredPreds) c[sp.outcome]++
  const totalScored = scoredPreds.length

  // Live matches count as scored (they have a score) but aren't final — split
  // them out so the header reads honestly: N final · N live · N pending.
  const liveCount = scoredPreds.filter(sp => sp.match.status === 'live').length
  const finalCount = totalScored - liveCount
  const summaryParts: string[] = []
  if (finalCount > 0) summaryParts.push(`${finalCount} final`)
  if (liveCount > 0) summaryParts.push(`${liveCount} live`)
  if (pendingCount > 0) summaryParts.push(`${pendingCount} pending`)
  const summary = summaryParts.length > 0 ? summaryParts.join(' · ') : 'No results in yet'

  // Stage breakdown
  const gs = { exact: 0, correct_gd: 0, correct: 0, wrong: 0, pts: 0, n: 0 }
  const ks = { exact: 0, correct_gd: 0, correct: 0, wrong: 0, pts: 0, n: 0 }
  for (const sp of scoredPreds) {
    const s = sp.match.stage === 'group' ? gs : ks
    s[sp.outcome]++; s.pts += sp.pts; s.n++
  }

  // Cumulative points timeline
  let cum = 0
  const timeline = scoredPreds.map(sp => { cum += sp.pts; return { ...sp, cumPts: cum } })
  const n = timeline.length

  // SVG helpers
  const maxPts = Math.max(timeline.at(-1)?.cumPts ?? 0, 20)
  const toX = (i: number) => PL + (n <= 1 ? IW / 2 : (i / (n - 1)) * IW)
  const toY = (pts: number) => PT + IH - (pts / maxPts) * IH
  const lineStr = n >= 2 ? timeline.map((p, i) => `${toX(i).toFixed(1)},${toY(p.cumPts).toFixed(1)}`).join(' ') : ''

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <LiveRefresh hasLive={hasLive} />

      {/* Hero */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {teamFlag(me.favorite_team) && <span>{teamFlag(me.favorite_team)}</span>}
              {me.display_name}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{summary}</p>
          </div>
          {myRow && (
            <div className="text-right shrink-0">
              <div className="text-3xl font-bold text-gray-900 leading-none">{myRow.total}</div>
              <div className="text-xs text-gray-400 mt-1">
                pts · #{myRow.rank} of {leaderboard.length}
                {myMovement !== 0 && (
                  <span className={`ml-1 font-semibold ${myMovement > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {myMovement > 0 ? `▲${myMovement}` : `▼${-myMovement}`}
                  </span>
                )}
              </div>
              {hasLive && myInPlay > 0 && (
                <div className="text-[11px] font-semibold text-amber-600 mt-0.5">⚡ +{myInPlay} in play</div>
              )}
            </div>
          )}
        </div>

        {totalScored > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip color="bg-green-700 text-white" label="Exact" value={c.exact} />
            <Chip color="bg-green-100 text-green-800" label="GD" value={c.correct_gd} />
            <Chip color="bg-yellow-100 text-yellow-800" label="Result" value={c.correct} />
            <Chip color="bg-red-100 text-red-700" label="Wrong" value={c.wrong} />
            {(myRow?.bonusPoints ?? 0) > 0 && (
              <Chip color="bg-purple-100 text-purple-700" label="Bonus" value={myRow!.bonusPoints} />
            )}
          </div>
        )}
      </div>

      {/* Accuracy bar */}
      {totalScored > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Accuracy</h2>
          <div className="flex h-4 rounded-full overflow-hidden gap-px">
            {c.exact      > 0 && <div className="bg-green-700"  style={{ width: `${(c.exact / totalScored) * 100}%` }} />}
            {c.correct_gd > 0 && <div className="bg-green-300"  style={{ width: `${(c.correct_gd / totalScored) * 100}%` }} />}
            {c.correct    > 0 && <div className="bg-yellow-300" style={{ width: `${(c.correct / totalScored) * 100}%` }} />}
            {c.wrong      > 0 && <div className="bg-red-300"    style={{ width: `${(c.wrong / totalScored) * 100}%` }} />}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span><Square cls="bg-green-700" /> Exact {pct(c.exact, totalScored)}</span>
            <span><Square cls="bg-green-300" /> GD {pct(c.correct_gd, totalScored)}</span>
            <span><Square cls="bg-yellow-300" /> Result {pct(c.correct, totalScored)}</span>
            <span><Square cls="bg-red-300" /> Wrong {pct(c.wrong, totalScored)}</span>
          </div>
        </div>
      )}

      {/* Points timeline */}
      {n > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Points Over Time</h2>
          <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" className="block overflow-visible">
            {/* Horizontal gridlines */}
            {[0.25, 0.5, 0.75, 1].map(f => {
              const y = (PT + IH - f * IH).toFixed(1)
              const label = Math.round(f * maxPts)
              return (
                <g key={f}>
                  <line x1={PL} y1={y} x2={CW - PR} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                  <text x={PL - 5} y={+y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{label}</text>
                </g>
              )
            })}
            {/* Baseline */}
            <line x1={PL} y1={PT + IH} x2={CW - PR} y2={PT + IH} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PL - 5} y={PT + IH + 4} textAnchor="end" fontSize="10" fill="#9ca3af">0</text>
            {/* Area fill under the line */}
            {n >= 2 && (
              <polygon
                points={`${toX(0).toFixed(1)},${(PT + IH).toFixed(1)} ${lineStr} ${toX(n - 1).toFixed(1)},${(PT + IH).toFixed(1)}`}
                fill="#16a34a"
                fillOpacity="0.08"
              />
            )}
            {/* Line */}
            {n >= 2 && (
              <polyline
                points={lineStr}
                fill="none"
                stroke="#16a34a"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {/* Dots — live matches drawn hollow with a pulsing ring (not final yet) */}
            {timeline.map((p, i) => {
              const live = p.match.status === 'live'
              const cx = toX(i).toFixed(1)
              const cy = toY(p.cumPts).toFixed(1)
              return live ? (
                <g key={i}>
                  <circle cx={cx} cy={cy} r="3.5" fill="white" stroke={OUTCOME_DOT[p.outcome]} strokeWidth="2" />
                  <circle cx={cx} cy={cy} r="3.5" fill="none" stroke={OUTCOME_DOT[p.outcome]} strokeWidth="1.5">
                    <animate attributeName="r" values="3.5;7" dur="1.2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0" dur="1.2s" repeatCount="indefinite" />
                  </circle>
                </g>
              ) : (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r="3.5"
                  fill={OUTCOME_DOT[p.outcome]}
                  stroke="white"
                  strokeWidth="1.5"
                />
              )
            })}
            {/* Final total label */}
            <text
              x={toX(n - 1).toFixed(1)}
              y={(toY(timeline[n - 1].cumPts) - 8).toFixed(1)}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="#15803d"
            >
              {timeline[n - 1].cumPts}
            </text>
          </svg>
          <p className="text-[10px] text-gray-400 mt-1">
            Each dot = one scored match.
            <span className="ml-2 inline-flex gap-1.5 items-center">
              <span className="inline-block w-2 h-2 rounded-full bg-green-700" /> Exact
              <span className="inline-block w-2 h-2 rounded-full bg-green-300 ml-1" /> GD
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 ml-1" /> Result
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 ml-1" /> Wrong
            </span>
            {liveCount > 0 && <span className="ml-2 text-amber-600">· hollow dot = live (provisional)</span>}
          </p>
        </div>
      )}

      {/* Stage breakdown */}
      {(gs.n > 0 || ks.n > 0) && (
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Stage Breakdown</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b text-center">
                <th className="text-left font-medium pb-2">Stage</th>
                <th className="font-medium pb-2 w-12"><span className="inline-block w-5 h-3 rounded-sm bg-green-700" /></th>
                <th className="font-medium pb-2 w-12"><span className="inline-block w-5 h-3 rounded-sm bg-green-300" /></th>
                <th className="font-medium pb-2 w-12"><span className="inline-block w-5 h-3 rounded-sm bg-yellow-300" /></th>
                <th className="font-medium pb-2 w-12"><span className="inline-block w-5 h-3 rounded-sm bg-red-300" /></th>
                <th className="font-medium pb-2 w-16 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {gs.n > 0 && (
                <tr className="border-t text-center">
                  <td className="py-2 text-left text-gray-700 font-medium">Group</td>
                  <td className="py-2">{gs.exact}</td>
                  <td className="py-2">{gs.correct_gd}</td>
                  <td className="py-2">{gs.correct}</td>
                  <td className="py-2">{gs.wrong}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{gs.pts}</td>
                </tr>
              )}
              {ks.n > 0 && (
                <tr className="border-t text-center">
                  <td className="py-2 text-left text-gray-700 font-medium">Knockout</td>
                  <td className="py-2">{ks.exact}</td>
                  <td className="py-2">{ks.correct_gd}</td>
                  <td className="py-2">{ks.correct}</td>
                  <td className="py-2">{ks.wrong}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{ks.pts}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Bonus */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Bonus Predictions</h2>
        <div className="space-y-4">
          {GROUP_BONUS_QUESTIONS.map(q => {
            const answer = myBonusMap.get(q.id)
            const hasGrade = myGradeMap.has(q.id)
            const isCorrect = myGradeMap.get(q.id)
            return (
              <div key={q.id}>
                <div className="text-xs text-gray-500 mb-1">{q.text}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {answer ? (
                    <>
                      <span className="text-sm font-medium text-gray-800">
                        {q.type === 'player'
                          ? `${answer.answer_text ?? '—'} (${teamDisplay(answer.answer_team, answer.answer_team)})`
                          : teamDisplay(answer.answer_team, answer.answer_team)
                        }
                      </span>
                      {hasGrade ? (
                        isCorrect
                          ? <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-0.5 rounded-full">✓ +{q.points} pts</span>
                          : <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">✗ Incorrect</span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">provisional</span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-gray-400 italic">No answer submitted</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Match history */}
      {scoredPreds.length > 0 && (
        <details className="bg-white rounded-xl border shadow-sm overflow-hidden group">
          <summary className="px-4 py-3 text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-50 select-none list-none flex items-center justify-between">
            <span>Match History</span>
            <span className="text-xs text-gray-400">{scoredPreds.length} scored</span>
          </summary>
          <div className="border-t">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-400">
                  <th className="text-left font-medium px-4 py-2">Match</th>
                  <th className="text-center font-medium px-2 py-2 w-16">My pick</th>
                  <th className="text-center font-medium px-2 py-2 w-14">Result</th>
                  <th className="text-right font-medium px-3 py-2 w-12">Pts</th>
                </tr>
              </thead>
              <tbody>
                {[...scoredPreds].reverse().map(sp => (
                  <tr key={sp.match.id} className="border-t">
                    <td className="px-4 py-2.5 text-gray-600">
                      <div>
                        <TeamLink team={sp.match.home_team} fallback={sp.match.home_source ?? '?'} />
                        {' vs '}
                        <TeamLink team={sp.match.away_team} fallback={sp.match.away_source ?? '?'} />
                      </div>
                      <div className="text-gray-400">{formatKickoffIST(sp.match.kickoff_utc)} IST</div>
                    </td>
                    <td className="text-center px-2 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${OUTCOME_CLASSES[sp.outcome]}`}>
                        {sp.pred.home_pred}–{sp.pred.away_pred}
                      </span>
                    </td>
                    <td className="text-center px-2 py-2.5 font-semibold text-gray-800">
                      {sp.match.home_score}–{sp.match.away_score}
                    </td>
                    <td className="text-right px-3 py-2.5 font-semibold text-gray-700">{sp.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {totalScored === 0 && pendingCount === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">
          No predictions yet.{' '}
          <a href="/" className="underline hover:text-gray-600">Go to Schedule →</a>
        </p>
      )}
    </div>
  )
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`
}

function Chip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${color}`}>
      {label} <span className="opacity-75">{value}</span>
    </span>
  )
}

function Square({ cls }: { cls: string }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-sm mr-1 ${cls}`} />
}
