import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatKickoffIST, isKickedOff, predictionDeadlineUTC } from '@/lib/time'
import { teamDisplay, teamFlag } from '@/lib/flags'
import { GROUP_BONUS_QUESTIONS } from '@/lib/bonus'
import { AdminResultForm } from './AdminResultForm'
import { AdminKnockoutForm } from './AdminKnockoutForm'
import { AdminBonusGradeForm } from './AdminBonusGradeForm'
import type { Match, BonusAnswer, BonusGrade } from '@/lib/types'

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
  ] = await Promise.all([
    supabase.from('matches').select('*').order('kickoff_utc'),
    supabase.from('bonus_answers').select('*'),
    supabase.from('bonus_grades').select('*'),
    supabase.from('profiles').select('id, display_name, favorite_team'),
  ])

  const all = (matches ?? []) as Match[]
  const started = all.filter(m => isKickedOff(m.kickoff_utc))
  const knockouts = all.filter(m => m.stage !== 'group' && !m.home_team)

  // Bonus grading setup
  const firstGroupKickoff = all.filter(m => m.stage === 'group')
    .sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc))[0]?.kickoff_utc
  const bonusDeadlinePassed = firstGroupKickoff
    ? predictionDeadlineUTC(firstGroupKickoff) <= new Date()
    : false

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null }
  const profileList = (profiles ?? []) as ProfileRow[]
  const profileMap = new Map(profileList.map(p => [p.id, p]))

  // answerMap: questionId → userId → answer
  const answerMap = new Map<number, Map<string, BonusAnswer>>()
  for (const a of (bonusAnswers ?? []) as BonusAnswer[]) {
    let qMap = answerMap.get(a.question_id)
    if (!qMap) { qMap = new Map(); answerMap.set(a.question_id, qMap) }
    qMap.set(a.user_id, a)
  }

  // gradeMap: `userId:questionId` → BonusGrade
  const gradeMap = new Map<string, BonusGrade>()
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

              return (
                <div key={q.id} className="bg-white rounded-xl border shadow-sm px-4 py-4">
                  <p className="text-sm font-medium text-gray-800 mb-0.5">
                    {q.text}
                    <span className="ml-2 text-xs text-gray-400 font-normal">({q.points} pts)</span>
                  </p>
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
                        return (
                          <div key={p.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-sm text-gray-700 min-w-0 flex-1">
                              {teamFlag(p.favorite_team) && (
                                <span className="mr-1">{teamFlag(p.favorite_team)}</span>
                              )}
                              {p.display_name}
                            </span>
                            <span className="text-xs text-gray-500 shrink-0">{answerLabel}</span>
                            <AdminBonusGradeForm
                              userId={p.id}
                              questionId={q.id}
                              isCorrect={grade?.is_correct ?? null}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-3 pt-2 border-t">
                    Players without an answer score 0 automatically and aren't listed.
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
