import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatKickoffIST, isKickedOff, predictionDeadlineUTC } from '@/lib/time'
import { teamDisplay, teamFlag } from '@/lib/flags'
import { GROUP_BONUS_QUESTIONS } from '@/lib/bonus'
import { fetchSquads, normalizeOFTeamName, matchSquadPlayer } from '@/lib/openfootball'
import { q1Leaders, q2Leaders, q3Leaders, isGroupStageComplete } from '@/lib/bonusTracker'
import { AdminResultForm } from './AdminResultForm'
import { AdminKnockoutForm } from './AdminKnockoutForm'
import { AdminQ1GradeForm } from './AdminQ1GradeForm'
import { AdminAddBonusAnswerForm } from './AdminAddBonusAnswerForm'
import { AdminMatchEventsForm } from './AdminMatchEventsForm'
import type { Match, BonusAnswer, BonusGrade, MatchEvent } from '@/lib/types'
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
    { data: bonusAnswers },
    { data: bonusGrades },
    { data: profiles },
    { data: events },
    squads,
  ] = await Promise.all([
    supabase.from('matches').select('*').order('kickoff_utc'),
    supabase.from('bonus_answers').select('*'),
    supabase.from('bonus_grades').select('*'),
    supabase.from('profiles').select('id, display_name, favorite_team, is_admin'),
    supabase.from('match_events').select('*'),
    fetchSquads().catch(() => null),
  ])

  const all = (matches ?? []) as Match[]

  // Build a map from DB team name → squad players for Q1 grading
  const squadMap = new Map<string, OFPlayer[]>()
  if (squads) {
    for (const squad of squads) {
      squadMap.set(normalizeOFTeamName(squad.name), squad.players)
    }
  }

  // Live derived leaders for each bonus question
  const eventList = (events ?? []) as MatchEvent[]
  const derivedQ2 = q2Leaders(all)
  const derivedQ3 = q3Leaders(all)
  const derivedQ1 = q1Leaders(eventList, all)
  const groupComplete = isGroupStageComplete(all)

  const derivedLeaders: Record<number, { leaders: string[]; leaderTeams?: string[]; stat: number; statLabel: string }> = {
    1: { ...derivedQ1, statLabel: 'goal' },
    2: { ...derivedQ2, statLabel: 'goals scored' },
    3: { ...derivedQ3, statLabel: 'goals conceded' },
  }
  const started = all.filter(m => isKickedOff(m.kickoff_utc))
  const knockouts = all.filter(m => m.stage !== 'group' && !m.home_team)

  // Bonus grading setup
  const firstGroupKickoff = all.filter(m => m.stage === 'group')
    .sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc))[0]?.kickoff_utc
  const bonusDeadlinePassed = firstGroupKickoff
    ? predictionDeadlineUTC(firstGroupKickoff) <= new Date()
    : false

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null; is_admin: boolean | null }
  const profileList = ((profiles ?? []) as ProfileRow[]).filter(p => !p.is_admin)
  const profileMap = new Map(profileList.map(p => [p.id, p]))

  // answerMap: questionId → userId → answer
  const answerMap = new Map<number, Map<string, BonusAnswer>>()
  for (const a of (bonusAnswers ?? []) as BonusAnswer[]) {
    let qMap = answerMap.get(a.question_id)
    if (!qMap) { qMap = new Map(); answerMap.set(a.question_id, qMap) }
    qMap.set(a.user_id, a)
  }

  // gradeMap: `userId:questionId` → BonusGrade (only Q1 confirmed_answer used now)
  const gradeMap = new Map<string, Pick<BonusGrade, 'user_id' | 'question_id' | 'is_correct' | 'confirmed_answer'>>()
  for (const g of (bonusGrades ?? []) as BonusGrade[]) {
    gradeMap.set(`${g.user_id}:${g.question_id}`, g)
  }

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
                    {teamDisplay(m.home_team, m.home_source ?? '')} vs {teamDisplay(m.away_team, m.away_source ?? '')}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">{formatKickoffIST(m.kickoff_utc)} IST</span>
                </div>
                <AdminResultForm match={m} />
                <AdminMatchEventsForm
                  matchId={m.id}
                  homeLabel={teamDisplay(m.home_team, m.home_source ?? 'Home')}
                  awayLabel={teamDisplay(m.away_team, m.away_source ?? 'Away')}
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

      {/* Bonus answer grading */}
      <section>
        <h2 className="text-base font-semibold mb-1 text-gray-700">Grade Bonus Answers</h2>
        {!bonusDeadlinePassed ? (
          <p className="text-sm text-gray-400">Grading opens after the bonus deadline passes.</p>
        ) : (
          <div className="space-y-6">
            {GROUP_BONUS_QUESTIONS.map(q => {
              const qAnswers = answerMap.get(q.id)
              const answerers = profileList
                .filter(p => qAnswers?.has(p.id))
                .sort((a, b) => a.display_name.localeCompare(b.display_name))

              const missing = profileList
                .filter(p => !qAnswers?.has(p.id))
                .sort((a, b) => a.display_name.localeCompare(b.display_name))

              const qLeadInfo = derivedLeaders[q.id]
              return (
                <div key={q.id} className="bg-white rounded-xl border shadow-sm px-4 py-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mb-0.5">
                    <p className="text-sm font-medium text-gray-800">
                      {q.text}
                      <span className="ml-2 text-xs text-gray-400 font-normal">({q.points} pts)</span>
                    </p>
                    {qLeadInfo.leaders.length > 0 && (
                      <span className="text-xs text-gray-500 shrink-0">
                        {groupComplete ? 'Winner:' : 'Leader:'}{' '}
                        <span className="font-medium text-gray-700">
                          {q.type === 'player' && qLeadInfo.leaderTeams
                            ? qLeadInfo.leaders.map((l, i) =>
                                `${l} (${teamDisplay(qLeadInfo.leaderTeams![i], qLeadInfo.leaderTeams![i])})`
                              ).join(', ')
                            : qLeadInfo.leaders.map(t => teamDisplay(t, t)).join(', ')}
                        </span>
                        {' '}· {qLeadInfo.stat} {qLeadInfo.statLabel}
                        {!groupComplete && <span className="text-amber-500 ml-1">(provisional)</span>}
                      </span>
                    )}
                  </div>
                  {answerers.length === 0 ? (
                    <p className="text-xs text-gray-400 mt-2">No answers submitted.</p>
                  ) : (
                    <div className="mt-3 divide-y">
                      {answerers.map(p => {
                        const ans = qAnswers!.get(p.id)!
                        const grade = gradeMap.get(`${p.id}:${q.id}`)
                        const answerLabel = q.type === 'player'
                          ? `${ans.answer_text} (${teamDisplay(ans.answer_team, ans.answer_team)})`
                          : teamDisplay(ans.answer_team, ans.answer_team)
                        const playerFlag = teamFlag(p.favorite_team)

                        if (q.type === 'player') {
                          const squadPlayers = ans.answer_team
                            ? (squadMap.get(ans.answer_team) ?? null)
                            : null
                          // Resolve the participant's text against the squad.
                          const suggestion = squadPlayers
                            ? matchSquadPlayer(ans.answer_text, squadPlayers)
                            : null
                          return (
                            <div key={p.id} className="py-3">
                              <div className="flex items-center gap-x-3 mb-2">
                                <span className="text-sm text-gray-700 min-w-0 flex-1">
                                  {playerFlag && <span className="mr-1">{playerFlag}</span>}
                                  {p.display_name}
                                </span>
                                <span className="text-xs text-gray-500 shrink-0">{answerLabel}</span>
                              </div>
                              <AdminQ1GradeForm
                                userId={p.id}
                                questionId={q.id}
                                rawText={ans.answer_text}
                                isCorrect={grade?.is_correct ?? null}
                                confirmedAnswer={grade?.confirmed_answer ?? null}
                                players={squadPlayers}
                                suggestedName={suggestion?.player.name ?? null}
                                suggestedMethod={suggestion?.method ?? null}
                                suggestedAmbiguous={suggestion?.ambiguous ?? false}
                              />
                            </div>
                          )
                        }

                        // Q2/Q3: auto-derived — show status badge, no manual grading
                        const qLeaders = derivedLeaders[q.id]
                        const isCorrect = qLeaders.leaders.length > 0 && qLeaders.leaders.includes(ans.answer_team)
                        return (
                          <div key={p.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-sm text-gray-700 min-w-0 flex-1">
                              {playerFlag && <span className="mr-1">{playerFlag}</span>}
                              {p.display_name}
                            </span>
                            <span className="text-xs text-gray-500 shrink-0">{answerLabel}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              isCorrect
                                ? (groupComplete ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')
                                : 'bg-red-100 text-red-600'
                            }`}>
                              {isCorrect ? (groupComplete ? '✓ Correct' : '● Leading') : '✗ Behind'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {missing.length > 0 && (
                    <details className="mt-3 pt-2 border-t">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                        Add answer for a player who missed the deadline ({missing.length})
                      </summary>
                      <div className="mt-3 divide-y">
                        {missing.map(p => (
                          <div key={p.id} className="py-3">
                            <div className="flex items-center gap-x-3 mb-2">
                              <span className="text-sm text-gray-700 min-w-0 flex-1">
                                {teamFlag(p.favorite_team) && <span className="mr-1">{teamFlag(p.favorite_team)}</span>}
                                {p.display_name}
                              </span>
                            </div>
                            <AdminAddBonusAnswerForm
                              userId={p.id}
                              questionId={q.id}
                              questionType={q.type}
                            />
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <p className="text-xs text-gray-400 mt-3 pt-2 border-t">
                    Players without an answer score 0 automatically. Use the section above to add one
                    on a player&rsquo;s behalf if they missed the deadline.
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
