'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { saveBonusAnswer } from '@/app/actions'
import { BONUS_TEXT_MAX } from '@/lib/bonus'
import { TEAM_NAMES, teamDisplay, teamFlag } from '@/lib/flags'
import { kickoffTimerDelay } from '@/lib/time'
import { normalizePlayerName } from '@/lib/playerName'
import type { BonusAnswer, BonusPickEntry } from '@/lib/types'
import type { BonusQuestion } from '@/lib/bonus'

interface TrackerData {
  leaders: string[]        // canonical names tied for first
  leaderTeams?: string[]   // parallel array: actual team per leader (Q1 only)
  stat: number             // the leading statistic value
  statLabel: string        // e.g. 'goal', 'goals scored', 'goals conceded'
  isComplete: boolean      // group stage finished?
}

type PickStatus = 'leading' | 'correct' | 'behind' | 'unmapped' | 'no_data'

function pickStatus(
  effectiveAnswer: string | null | undefined,
  leaders: string[],
  isComplete: boolean,
  answerTeam?: string,
  leaderTeams?: string[]
): PickStatus {
  if (!effectiveAnswer) return 'unmapped'
  if (leaders.length === 0) return 'no_data'
  // Q1 leaders are goal-scorer names; the pick is the admin-confirmed squad name.
  // The two openfootball files disagree on case/diacritics, so compare on the
  // normalized key (a no-op for Q2/Q3 team names, which share one DB source).
  const key = normalizePlayerName(effectiveAnswer)
  let isTop: boolean
  if (answerTeam !== undefined && leaderTeams && leaderTeams.length === leaders.length) {
    // Q1: require both player name AND team to match
    const idx = leaders.findIndex(l => normalizePlayerName(l) === key)
    isTop = idx >= 0 && leaderTeams[idx] === answerTeam
  } else {
    isTop = leaders.some(l => normalizePlayerName(l) === key)
  }
  if (isComplete) return isTop ? 'correct' : 'behind'
  return isTop ? 'leading' : 'behind'
}

const STATUS_CHIP: Record<PickStatus, { label: string; cls: string }> = {
  leading:  { label: '● Leading',  cls: 'bg-blue-100 text-blue-700' },
  correct:  { label: '✓ Correct',  cls: 'bg-green-100 text-green-700' },
  behind:   { label: '✗ Behind',   cls: 'bg-red-100 text-red-600' },
  unmapped: { label: '⏳ Pending', cls: 'bg-amber-50 text-amber-700' },
  no_data:  { label: '–',          cls: 'bg-gray-100 text-gray-400' },
}

interface Props {
  question: BonusQuestion
  ownAnswer: BonusAnswer | undefined
  ownConfirmedAnswer?: string | null  // Q1: admin-mapped canonical player name
  deadlineISO: string
  isLocked: boolean
  tracker?: TrackerData
  picks?: BonusPickEntry[]
  totalPlayers?: number
}

export function BonusQuestionCard({
  question, ownAnswer, ownConfirmedAnswer, deadlineISO, isLocked, tracker, picks, totalPlayers,
}: Props) {
  const initName = ownAnswer?.answer_text ?? ''
  const initTeam = ownAnswer?.answer_team ?? ''

  const [nameVal, setNameVal] = useState(initName)
  const [teamVal, setTeamVal] = useState(initTeam)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const lastSaved = useRef({ name: initName, team: initTeam })

  const [clientLocked, setClientLocked] = useState(false)
  useEffect(() => {
    if (isLocked || !deadlineISO) return
    const delay = kickoffTimerDelay(deadlineISO)
    if (delay === 'past') { setClientLocked(true); return }
    if (delay === null) return
    const t = setTimeout(() => setClientLocked(true), delay)
    return () => clearTimeout(t)
  }, [isLocked, deadlineISO])

  const locked = isLocked || clientLocked

  function handleSave() {
    if (kickoffTimerDelay(deadlineISO) === 'past') { setClientLocked(true); return }
    startTransition(async () => {
      const res = await saveBonusAnswer(
        question.id,
        question.type === 'player' ? nameVal : null,
        teamVal
      )
      if (res.error) {
        setMsg({ text: res.error, ok: false })
        if (res.error.includes('locked')) setClientLocked(true)
      } else {
        lastSaved.current = { name: nameVal, team: teamVal }
        setMsg({ text: 'Saved!', ok: true })
        setTimeout(() => setMsg(null), 2000)
      }
    })
  }

  const isRecorded =
    lastSaved.current.team !== '' &&
    teamVal === lastSaved.current.team &&
    (question.type !== 'player' || nameVal === lastSaved.current.name)

  const displayAnswer: { text: string | null; team: string } | undefined =
    ownAnswer
      ? { text: ownAnswer.answer_text, team: ownAnswer.answer_team }
      : lastSaved.current.team !== ''
        ? { text: lastSaved.current.name || null, team: lastSaved.current.team }
        : undefined

  const answeredCount = picks?.filter(p => p.answer !== null).length ?? 0

  // For Q1, show the admin-confirmed canonical player name once mapped,
  // falling back to the participant's raw text entry while still unmapped.
  function chipLabel(answer: { text: string | null; team: string }, confirmed?: string | null): string {
    if (question.type === 'player') {
      const name = confirmed || answer.text || ''
      return `${name} (${teamDisplay(answer.team, answer.team)})`
    }
    return teamDisplay(answer.team, answer.team)
  }

  // The effective answer key for status checks (canonical for Q1, team name for Q2/Q3)
  const ownEffective = question.type === 'player'
    ? ownConfirmedAnswer
    : displayAnswer?.team

  const ownStatus: PickStatus | null = locked && tracker && tracker.leaders.length > 0
    ? pickStatus(
        ownEffective,
        tracker.leaders,
        tracker.isComplete,
        question.type === 'player' ? (ownAnswer?.answer_team ?? displayAnswer?.team) : undefined,
        question.type === 'player' ? tracker.leaderTeams : undefined,
      )
    : null

  return (
    <div className="py-4 border-b last:border-0">
      <p className="text-sm font-medium text-gray-800 mb-3">{question.text}</p>

      {/* Live tracker — shown after deadline when we have data */}
      {locked && tracker && (
        <div className={`rounded-lg px-3 py-2 mb-3 text-xs flex flex-wrap items-center gap-x-4 gap-y-1 ${
          tracker.isComplete ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
        }`}>
          <span className={`font-medium ${tracker.isComplete ? 'text-green-700' : 'text-blue-700'}`}>
            {tracker.isComplete ? '✓ Final' : '● Live'}
          </span>
          {tracker.leaders.length === 0 ? (
            <span className="text-gray-400">No data yet</span>
          ) : (
            <span className="text-gray-700">
              {question.type === 'player' && tracker.leaderTeams
                ? tracker.leaders.map((name, i) =>
                    `${name} (${teamDisplay(tracker.leaderTeams![i], tracker.leaderTeams![i])})`
                  ).join(', ')
                : tracker.leaders.map(t => teamDisplay(t, t)).join(', ')}
              {' '}
              <span className="text-gray-500">
                · {tracker.stat} {tracker.stat === 1 && tracker.statLabel === 'goal' ? 'goal' : tracker.statLabel}
              </span>
            </span>
          )}
        </div>
      )}

      {locked ? (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {displayAnswer ? (
              <span className="text-sm font-semibold px-2.5 py-1 rounded bg-gray-100 text-gray-700">
                {chipLabel(displayAnswer, ownConfirmedAnswer)}
              </span>
            ) : (
              <span className="text-xs text-gray-300 italic">no pick</span>
            )}
            {ownStatus && ownStatus !== 'no_data' && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CHIP[ownStatus].cls}`}>
                {STATUS_CHIP[ownStatus].label}
              </span>
            )}
            {question.type === 'player' && !ownConfirmedAnswer && displayAnswer && (
              <span className="text-xs text-amber-600">⏳ Pending admin mapping</span>
            )}
          </div>
          {/* Show the participant their original text when it was mapped to a different canonical name */}
          {question.type === 'player' && ownConfirmedAnswer && displayAnswer?.text &&
            displayAnswer.text.trim().toLowerCase() !== ownConfirmedAnswer.toLowerCase() && (
            <p className="text-xs text-gray-400 mt-1">
              Confirmed from your entry &ldquo;{displayAnswer.text}&rdquo;
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {question.type === 'player' && (
            <input
              type="text"
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              maxLength={BONUS_TEXT_MAX}
              disabled={isPending}
              placeholder="Player name"
              className="border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 w-48"
            />
          )}
          <select
            value={teamVal}
            onChange={e => setTeamVal(e.target.value)}
            disabled={isPending}
            className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
          >
            <option value="">{question.type === 'player' ? '— Country —' : '— Select team —'}</option>
            {TEAM_NAMES.map(t => (
              <option key={t} value={t}>{teamDisplay(t, t)}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
          >
            {isPending ? '…' : 'Save'}
          </button>
          {msg ? (
            <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
              {msg.text}
            </span>
          ) : (
            isRecorded && (
              <span className="text-xs text-green-600 whitespace-nowrap" title="Answer recorded">
                ✓ Recorded
              </span>
            )
          )}
        </div>
      )}

      {locked && picks && (
        <details className="mt-3 pt-2 border-t">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
            Everyone's picks ({answeredCount}{totalPlayers ? ` of ${totalPlayers}` : ''})
          </summary>
          <div className="mt-2 space-y-1.5 pb-1">
            {picks.map((entry, i) => {
              const effectiveKey = question.type === 'player'
                ? entry.confirmedAnswer
                : entry.answer?.team
              const entryStatus = tracker && tracker.leaders.length > 0 && entry.answer
                ? pickStatus(
                    effectiveKey,
                    tracker.leaders,
                    tracker.isComplete,
                    question.type === 'player' ? (entry.answer?.team ?? undefined) : undefined,
                    question.type === 'player' ? tracker.leaderTeams : undefined,
                  )
                : null
              const chip = entryStatus ? STATUS_CHIP[entryStatus] : null

              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 min-w-0 flex-1 truncate">
                    {teamFlag(entry.favoriteTeam) && (
                      <span className="mr-1">{teamFlag(entry.favoriteTeam)}</span>
                    )}
                    {entry.displayName}
                  </span>
                  {entry.answer !== null ? (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 shrink-0 max-w-48 truncate">
                      {chipLabel(entry.answer, entry.confirmedAnswer)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 italic shrink-0">no pick</span>
                  )}
                  {chip && entry.answer && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0 ${chip.cls}`}>
                      {chip.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}
