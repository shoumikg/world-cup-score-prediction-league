'use client'

import { useState, useTransition } from 'react'
import { adminSaveBonusAnswer } from '@/app/actions'
import { BONUS_TEXT_MAX } from '@/lib/bonus'
import { TEAM_NAMES, teamDisplay } from '@/lib/flags'
import type { BonusQuestionType } from '@/lib/bonus'

interface Props {
  userId: string
  questionId: number
  questionType: BonusQuestionType
}

// Admin-only form to record a bonus answer for a player who missed the deadline.
// Mirrors the user-facing answer controls (player text + country for Q1, team
// select for Q2/Q3) but writes through the privileged adminSaveBonusAnswer action.
export function AdminAddBonusAnswerForm({ userId, questionId, questionType }: Props) {
  const [nameVal, setNameVal] = useState('')
  const [teamVal, setTeamVal] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const res = await adminSaveBonusAnswer(
        userId,
        questionId,
        questionType === 'player' ? nameVal : null,
        teamVal
      )
      if (res.error) {
        setMsg({ text: res.error, ok: false })
      } else {
        setMsg({ text: 'Added!', ok: true })
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {questionType === 'player' && (
        <input
          type="text"
          value={nameVal}
          onChange={e => setNameVal(e.target.value)}
          maxLength={BONUS_TEXT_MAX}
          disabled={isPending}
          placeholder="Player name"
          className="border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50 w-40"
        />
      )}
      <select
        value={teamVal}
        onChange={e => setTeamVal(e.target.value)}
        disabled={isPending}
        className="border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
      >
        <option value="">{questionType === 'player' ? '— Country —' : '— Select team —'}</option>
        {TEAM_NAMES.map(t => (
          <option key={t} value={t}>{teamDisplay(t, t)}</option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={isPending}
        className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
      >
        {isPending ? '…' : 'Add'}
      </button>
      {msg && (
        <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
          {msg.text}
        </span>
      )}
    </div>
  )
}
