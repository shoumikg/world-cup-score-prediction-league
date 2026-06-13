'use client'

import { useState, useTransition } from 'react'
import { saveBonusGrade } from '@/app/actions'
import type { OFPlayer, SquadMatchMethod } from '@/lib/openfootball'

const POS_ORDER: OFPlayer['pos'][] = ['FW', 'MF', 'DF', 'GK']

const METHOD_LABEL: Record<SquadMatchMethod, string> = {
  exact: 'exact match',
  surname: 'surname match',
  partial: 'partial match',
}

interface Props {
  userId: string
  questionId: number
  rawText: string | null
  isCorrect: boolean | null
  confirmedAnswer: string | null
  players: OFPlayer[] | null
  // Server-resolved suggestion from the participant's text against the squad.
  suggestedName: string | null
  suggestedMethod: SquadMatchMethod | null
  suggestedAmbiguous: boolean
}

export function AdminQ1GradeForm({
  userId,
  questionId,
  rawText,
  isCorrect: initialGrade,
  confirmedAnswer: initialConfirmed,
  players,
  suggestedName,
  suggestedMethod,
  suggestedAmbiguous,
}: Props) {
  const [isCorrect, setIsCorrect] = useState<boolean | null>(initialGrade)
  const [confirmedAnswer, setConfirmedAnswer] = useState<string | null>(initialConfirmed)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Nothing has been graded yet → the auto-resolved player is just a suggestion.
  const isGraded = initialGrade !== null || initialConfirmed !== null
  const showSuggestion = !isGraded && suggestedName !== null

  function handleSelect(playerName: string | null, correct: boolean) {
    const prevCorrect = isCorrect
    const prevAnswer = confirmedAnswer
    setIsCorrect(correct)
    setConfirmedAnswer(playerName)
    startTransition(async () => {
      const res = await saveBonusGrade(userId, questionId, correct, playerName)
      if (res.error) {
        setIsCorrect(prevCorrect)
        setConfirmedAnswer(prevAnswer)
        setMsg(res.error)
        setTimeout(() => setMsg(null), 3000)
      } else {
        setMsg('Saved')
        setTimeout(() => setMsg(null), 1500)
      }
    })
  }

  // No squad → can't resolve; fall back to plain correct/incorrect.
  if (!players || players.length === 0) {
    return (
      <div>
        <p className="text-xs text-amber-600 mb-1.5">
          No squad data for this team — grade manually.
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleSelect(null, true)}
            disabled={isPending}
            className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
              isCorrect === true
                ? 'bg-green-600 text-white border-green-600'
                : 'border-gray-300 text-gray-500 hover:border-green-400 hover:text-green-700'
            }`}
          >
            ✓ Correct
          </button>
          <button
            onClick={() => handleSelect(null, false)}
            disabled={isPending}
            className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
              isCorrect === false
                ? 'bg-red-600 text-white border-red-600'
                : 'border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-700'
            }`}
          >
            ✗ Incorrect
          </button>
          {msg && (
            <span className={`text-xs ${msg === 'Saved' ? 'text-green-600' : 'text-red-500'}`}>
              {msg}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Resolution status line */}
      {isGraded && confirmedAnswer ? (
        <p className="text-xs text-green-700 mb-1.5">
          ✓ Confirmed as <span className="font-medium">{confirmedAnswer}</span>
        </p>
      ) : showSuggestion ? (
        <p className="text-xs text-amber-700 mb-1.5">
          Suggested:{' '}
          <span className="font-medium">{suggestedName}</span>{' '}
          <span className="text-amber-500">
            ({suggestedMethod ? METHOD_LABEL[suggestedMethod] : 'match'}
            {suggestedAmbiguous ? ', ambiguous — verify' : ''})
          </span>{' '}
          — click to confirm
        </p>
      ) : !isGraded ? (
        <p className="text-xs text-gray-400 mb-1.5">
          No squad match for &ldquo;{rawText}&rdquo; — pick the right player.
        </p>
      ) : null}

      {POS_ORDER.map(pos => {
        const group = players.filter(p => p.pos === pos).sort((a, b) => a.number - b.number)
        if (group.length === 0) return null
        return (
          <div key={pos} className="flex flex-wrap items-start gap-1 mb-1">
            <span className="text-xs text-gray-400 w-6 text-right shrink-0 mt-0.5">{pos}</span>
            <div className="flex flex-wrap gap-1 flex-1">
              {group.map(player => {
                const isConfirmed = isCorrect === true && confirmedAnswer === player.name
                const isSuggested = showSuggestion && suggestedName === player.name
                const cls = isConfirmed
                  ? 'bg-green-600 text-white border-green-600'
                  : isSuggested
                    ? 'bg-amber-50 border-amber-400 text-amber-800 hover:bg-amber-100'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-700'
                const numCls = isConfirmed
                  ? 'text-green-200'
                  : isSuggested
                    ? 'text-amber-500'
                    : 'text-gray-400'
                return (
                  <button
                    key={player.number}
                    onClick={() => handleSelect(player.name, true)}
                    disabled={isPending}
                    className={`text-xs px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50 ${cls}`}
                  >
                    <span className={`mr-1 ${numCls}`}>{player.number}</span>
                    {player.name}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-1.5 mt-2 ml-7">
        <button
          onClick={() => handleSelect(null, false)}
          disabled={isPending}
          className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
            isCorrect === false
              ? 'bg-red-600 text-white border-red-600'
              : 'border-gray-300 text-gray-500 hover:border-red-400 hover:text-red-700'
          }`}
        >
          ✗ None correct
        </button>
        {msg && (
          <span className={`text-xs ${msg === 'Saved' ? 'text-green-600' : 'text-red-500'}`}>
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}
