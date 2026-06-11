'use client'

import { useState, useTransition } from 'react'
import { saveBonusGrade } from '@/app/actions'

interface Props {
  userId: string
  questionId: number
  isCorrect: boolean | null  // null = ungraded
}

export function AdminBonusGradeForm({ userId, questionId, isCorrect: initialGrade }: Props) {
  const [grade, setGrade] = useState<boolean | null>(initialGrade)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleGrade(value: boolean) {
    const prev = grade
    setGrade(value)
    startTransition(async () => {
      const res = await saveBonusGrade(userId, questionId, value)
      if (res.error) {
        setGrade(prev)
        setMsg(res.error)
        setTimeout(() => setMsg(null), 3000)
      } else {
        setMsg('Saved')
        setTimeout(() => setMsg(null), 1500)
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => handleGrade(true)}
        disabled={isPending}
        className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
          grade === true
            ? 'bg-green-600 text-white border-green-600'
            : 'border-gray-300 text-gray-500 hover:border-green-400 hover:text-green-700'
        }`}
      >
        ✓ Correct
      </button>
      <button
        onClick={() => handleGrade(false)}
        disabled={isPending}
        className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
          grade === false
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
