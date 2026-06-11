import { createClient } from '@/lib/supabase/server'
import { predictionDeadlineUTC, formatKickoffIST } from '@/lib/time'
import { GROUP_BONUS_QUESTIONS } from '@/lib/bonus'
import { BonusQuestionCard } from '@/app/BonusQuestionCard'
import { DeadlineCountdown } from '@/app/DeadlineCountdown'
import type { BonusAnswer, BonusPickEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function BonusPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware will redirect

  const [{ data: firstGroupMatches }, { data: answers }, { data: profiles }] = await Promise.all([
    supabase.from('matches').select('kickoff_utc').eq('stage', 'group').order('kickoff_utc').limit(1),
    supabase.from('bonus_answers').select('*'),
    supabase.from('profiles').select('id, display_name, favorite_team'),
  ])

  const firstKickoff = (firstGroupMatches as { kickoff_utc: string }[] | null)?.[0]?.kickoff_utc
  if (!firstKickoff) return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <p className="text-sm text-gray-500">Bonus questions are not yet available.</p>
    </div>
  )

  const deadline = predictionDeadlineUTC(firstKickoff)
  const deadlinePassed = deadline <= new Date()

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null }
  const profileList = (profiles ?? []) as ProfileRow[]
  const totalPlayers = profileList.length

  const ownAnswerMap = new Map<number, BonusAnswer>()
  const answersByQuestion = new Map<number, Map<string, { text: string | null; team: string }>>()

  for (const a of (answers ?? []) as BonusAnswer[]) {
    if (a.user_id === user.id) ownAnswerMap.set(a.question_id, a)
    let qMap = answersByQuestion.get(a.question_id)
    if (!qMap) { qMap = new Map(); answersByQuestion.set(a.question_id, qMap) }
    qMap.set(a.user_id, { text: a.answer_text, team: a.answer_team })
  }

  const deadlineISO = deadline.toISOString()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-6">
        <h1 className="text-xl font-bold">Bonus Questions</h1>
        <span className={`text-xs font-normal ${deadlinePassed ? 'text-red-400' : 'text-gray-400'}`}>
          Deadline {formatKickoffIST(deadlineISO)} IST
          {deadlinePassed ? ' · closed' : <DeadlineCountdown deadlineISO={deadlineISO} />}
        </span>
      </div>

      <div className="bg-white rounded-xl border shadow-sm px-4 mb-8">
        {GROUP_BONUS_QUESTIONS.map(q => {
          const picks: BonusPickEntry[] | undefined = deadlinePassed
            ? profileList
                .map(profile => ({
                  displayName: profile.display_name,
                  favoriteTeam: profile.favorite_team,
                  answer: answersByQuestion.get(q.id)?.get(profile.id) ?? null,
                }))
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
            : undefined

          return (
            <BonusQuestionCard
              key={q.id}
              question={q}
              ownAnswer={ownAnswerMap.get(q.id)}
              deadlineISO={deadlineISO}
              isLocked={deadlinePassed}
              picks={picks}
              totalPlayers={totalPlayers}
            />
          )
        })}
      </div>

      <BonusGuide />
    </div>
  )
}

function BonusGuide() {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3 pb-1 border-b">
        How bonus questions work
      </h2>
      <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
        <p>
          <strong>Player name</strong> — Type the player's full name as you know it.
          Capitalisation doesn't matter; the admin matches submissions manually when
          results come in.
        </p>
        <p>
          <strong>Country selection</strong> — Required alongside the player name so
          players with the same surname can be distinguished (e.g. two different players
          named "Silva").
        </p>
        <p>
          <strong>Deadline</strong> — All three answers lock at{' '}
          <strong>9 PM IST the night before the first group stage match</strong>. After
          that the inputs are replaced by your saved pick (or "no pick" if you didn't
          submit anything).
        </p>
        <p>
          <strong>Seeing others' picks</strong> — Once the deadline passes, expand the{' '}
          <strong>Everyone's picks</strong> section under any question to see all
          submissions.
        </p>
        <p>
          <strong>Editing</strong> — Update your answers as many times as you like
          before the deadline. The{' '}
          <span className="text-green-600 font-medium">✓ Recorded</span> marker confirms
          your latest save was captured.
        </p>
      </div>
    </section>
  )
}
