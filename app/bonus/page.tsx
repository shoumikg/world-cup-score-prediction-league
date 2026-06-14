import { createClient } from '@/lib/supabase/server'
import { predictionDeadlineUTC, formatKickoffIST } from '@/lib/time'
import { GROUP_BONUS_QUESTIONS } from '@/lib/bonus'
import { q1Leaders, q2Leaders, q3Leaders, isGroupStageComplete, groupTopScorers } from '@/lib/bonusTracker'
import { BonusQuestionCard } from '@/app/BonusQuestionCard'
import { DeadlineCountdown } from '@/app/DeadlineCountdown'
import type { BonusAnswer, BonusGrade, BonusPickEntry, MatchEvent } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function BonusPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware will redirect

  const [
    { data: firstGroupMatches },
    { data: answers },
    { data: profiles },
    { data: grades },
    { data: events },
    { data: allMatches },
  ] = await Promise.all([
    supabase.from('matches').select('kickoff_utc').eq('stage', 'group').order('kickoff_utc').limit(1),
    supabase.from('bonus_answers').select('*'),
    supabase.from('profiles').select('id, display_name, favorite_team, is_admin'),
    supabase.from('bonus_grades').select('user_id, question_id, confirmed_answer'),
    supabase.from('match_events').select('*'),
    supabase.from('matches').select('*'),
  ])

  const firstKickoff = (firstGroupMatches as { kickoff_utc: string }[] | null)?.[0]?.kickoff_utc
  if (!firstKickoff) return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <p className="text-sm text-gray-500">Bonus questions are not yet available.</p>
    </div>
  )

  const deadline = predictionDeadlineUTC(firstKickoff)
  const deadlinePassed = deadline <= new Date()

  type ProfileRow = { id: string; display_name: string; favorite_team: string | null; is_admin: boolean | null }
  const profileList = ((profiles ?? []) as ProfileRow[]).filter(p => !p.is_admin)
  const totalPlayers = profileList.length

  const answerList = (answers ?? []) as BonusAnswer[]
  const matchList = (allMatches ?? []) as { id: number; stage: string; home_score: number | null; away_score: number | null; group_name: string | null; home_team: string | null; away_team: string | null; kickoff_utc: string }[]
  const eventList = (events ?? []) as MatchEvent[]

  // Build confirmed Q1 map: user_id → canonical player name
  const confirmedQ1 = new Map<string, string>()
  for (const g of (grades ?? []) as Pick<BonusGrade, 'user_id' | 'question_id' | 'confirmed_answer'>[]) {
    if (g.question_id === 1 && g.confirmed_answer) confirmedQ1.set(g.user_id, g.confirmed_answer)
  }

  const ownAnswerMap = new Map<number, BonusAnswer>()
  const answersByQuestion = new Map<number, Map<string, { text: string | null; team: string }>>()

  for (const a of answerList) {
    if (a.user_id === user.id) ownAnswerMap.set(a.question_id, a)
    let qMap = answersByQuestion.get(a.question_id)
    if (!qMap) { qMap = new Map(); answersByQuestion.set(a.question_id, qMap) }
    qMap.set(a.user_id, { text: a.answer_text, team: a.answer_team })
  }

  // Compute live leaders for the tracker
  // matchList needs to be cast to Match[] for standings/tracker functions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchesForTracker = matchList as any[]

  const tracker1 = q1Leaders(eventList, matchesForTracker)
  const tracker2 = q2Leaders(matchesForTracker)
  const tracker3 = q3Leaders(matchesForTracker)
  const groupComplete = isGroupStageComplete(matchesForTracker)

  const trackerByQ: Record<number, { leaders: string[]; leaderTeams?: string[]; stat: number; statLabel: string; isComplete: boolean }> = {
    1: { ...tracker1, statLabel: 'goal', isComplete: groupComplete },
    2: { ...tracker2, statLabel: 'goals scored', isComplete: groupComplete },
    3: { ...tracker3, statLabel: 'goals conceded', isComplete: groupComplete },
  }

  const deadlineISO = deadline.toISOString()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-6">
        <div>
          <h1 className="text-xl font-bold">Bonus Questions</h1>
          <p className="text-xs text-gray-400 mt-0.5">Group stage · 25 pts each if correct</p>
        </div>
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
                  confirmedAnswer: q.type === 'player' ? (confirmedQ1.get(profile.id) ?? null) : undefined,
                }))
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
            : undefined

          const ownConfirmedAnswer = q.type === 'player' ? (confirmedQ1.get(user.id) ?? null) : null

          return (
            <BonusQuestionCard
              key={q.id}
              question={q}
              ownAnswer={ownAnswerMap.get(q.id)}
              ownConfirmedAnswer={ownConfirmedAnswer}
              deadlineISO={deadlineISO}
              isLocked={deadlinePassed}
              tracker={trackerByQ[q.id]}
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
          <strong>Scoring</strong> — Each correct answer earns <strong>25 pts</strong>.
          Answers are automatically scored from live match data — no manual grading needed for
          Q2 and Q3. Q1 requires the admin to confirm which player your entry refers to (since
          free text needs disambiguation).
        </p>
        <p>
          <strong>Ties</strong> — If multiple players/teams are tied at the top, all
          participants who picked any of the tied leaders are marked correct.
        </p>
        <p>
          <strong>Provisional</strong> — Bonus scores update live as group matches are played.
          They are only final once all 36 group-stage matches have results.
        </p>
        <p>
          <strong>Player name</strong> — Type the player's full name as you know it.
          The admin maps your text entry to the official squad name — once mapped, scoring is automatic.
        </p>
        <p>
          <strong>Country selection</strong> — Required alongside the player name so players
          with the same surname can be distinguished.
        </p>
        <p>
          <strong>Deadline</strong> — All three answers lock at{' '}
          <strong>9 PM IST the night before the first group stage match</strong>.
        </p>
        <p>
          <strong>Seeing others' picks</strong> — Once the deadline passes, expand{' '}
          <strong>Everyone's picks</strong> under any question to see all submissions.
        </p>
        <div>
          <strong>Status badges</strong> — Each pick shows a coloured badge after the deadline:
          <ul className="mt-1.5 space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 shrink-0">● Leading</span>
              <span>Group stage still in progress — your pick is among the current leader(s). On track, not final yet.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 shrink-0">✓ Correct</span>
              <span>Group stage complete — your pick is among the final leader(s). You earned the 25 pts.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 shrink-0">✗ Behind</span>
              <span>Your pick is not among the current (or final) leader(s).</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 shrink-0">⏳ Pending</span>
              <span>Q1 only — your text entry hasn't been mapped to a squad player yet.</span>
            </li>
          </ul>
        </div>
        <p className="text-xs text-gray-500 bg-gray-50 border rounded px-3 py-2">
          More bonus questions covering the knockout stages will appear here once the
          group stage is complete. Those questions will be worth <strong>30 pts</strong> each.
        </p>
      </div>
    </section>
  )
}
