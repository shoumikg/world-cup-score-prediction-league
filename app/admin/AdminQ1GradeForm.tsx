'use client'

import { useState, useTransition } from 'react'
import { saveBonusGrade } from '@/app/actions'
import type { OFPlayer } from '@/lib/openfootball'

const POS_ORDER: OFPlayer['pos'][] = ['FW', 'MF', 'DF', 'GK']

interface Props {
  userId: string
  questionId: number
  isCorrect: boolean | null
  confirmedAnswer: string | null
  players: OFPlayer[] | null
}

export function AdminQ1GradeForm({
  userId,
  questionId,
  isCorrect: initialGrade,
  confirmedAnswer: initialConfirmed,
  players,
}: Props) {
  const [isCorrect, setIsCorrect] = useState<boolean | null>(initialGrade)
  const [confirmedAnswer, setConfirmedAnswer] = useState<string | null>(initialConfirmed)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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

  // No squad available — fall back to simple correct/incorrect buttons
  if (!players || players.length === 0) {
    return (
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
    )
  }

  return (
    <div className="mt-1">
      {POS_ORDER.map(pos => {
        const group = players.filter(p => p.pos === pos).sort((a, b) => a.number - b.number)
        if (group.length === 0) return null
        return (
          <div key={pos} className="flex flex-wrap items-start gap-1 mb-1">
            <span className="text-xs text-gray-400 w-6 text-right shrink-0 mt-0.5">{pos}</span>
            <div className="flex flex-wrap gap-1 flex-1">
              {group.map(player => {
                const isSelected = isCorrect === true && confirmedAnswer === player.name
                return (
                  <button
                    key={player.number}
                    onClick={() => handleSelect(player.name, true)}
                    disabled={isPending}
                    className={`text-xs px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50 ${
                      isSelected
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-700'
                    }`}
                  >
                    <span className={`mr-1 ${isSelected ? 'text-green-200' : 'text-gray-400'}`}>
                      {player.number}
                    </span>
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
