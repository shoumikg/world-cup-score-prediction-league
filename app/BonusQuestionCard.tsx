'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { saveBonusAnswer } from '@/app/actions'
import { BONUS_TEXT_MAX } from '@/lib/bonus'
import { TEAM_NAMES, teamDisplay, teamFlag } from '@/lib/flags'
import { kickoffTimerDelay } from '@/lib/time'
import type { BonusAnswer, BonusPickEntry } from '@/lib/types'
import type { BonusQuestion } from '@/lib/bonus'

interface Props {
  question: BonusQuestion
  ownAnswer: BonusAnswer | undefined
  deadlineISO: string
  isLocked: boolean
  picks?: BonusPickEntry[]
  totalPlayers?: number
}

export function BonusQuestionCard({
  question, ownAnswer, deadlineISO, isLocked, picks, totalPlayers,
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

  function chipLabel(answer: { text: string | null; team: string }): string {
    if (question.type === 'player') {
      return `${answer.text ?? ''} (${teamDisplay(answer.team, answer.team)})`
    }
    return teamDisplay(answer.team, answer.team)
  }

  return (
    <div className="py-4 border-b last:border-0">
      <p className="text-sm font-medium text-gray-800 mb-3">{question.text}</p>

      {locked ? (
        <div>
          {displayAnswer ? (
            <span className="text-sm font-semibold px-2.5 py-1 rounded bg-gray-100 text-gray-700">
              {chipLabel(displayAnswer)}
            </span>
          ) : (
            <span className="text-xs text-gray-300 italic">no pick</span>
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
            {picks.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 min-w-0 flex-1 truncate">
                  {teamFlag(entry.favoriteTeam) && (
                    <span className="mr-1">{teamFlag(entry.favoriteTeam)}</span>
                  )}
                  {entry.displayName}
                </span>
                {entry.answer !== null ? (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 shrink-0 max-w-56 truncate">
                    {chipLabel(entry.answer)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 italic shrink-0">no pick</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
