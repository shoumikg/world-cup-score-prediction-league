'use client'

import { useState, useTransition } from 'react'
import { saveFinalistPrediction } from '@/app/actions'
import { teamFlag } from '@/lib/flags'
import type { FinalistOption } from '@/lib/finalist'

interface Props {
  options: FinalistOption[]
  initialA: string
  initialB: string
}

export function FinalistPredictionForm({ options, initialA, initialB }: Props) {
  const [teamA, setTeamA] = useState(initialA)
  const [teamB, setTeamB] = useState(initialB)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  const halfOf = (team: string) => options.find(o => o.team === team)?.half
  const aHalf = halfOf(teamA)

  // The second finalist must come from the opposite half of the draw — teams in
  // the same half as A would meet A before the final.
  const optionsB = aHalf ? options.filter(o => o.half !== aHalf) : []

  function onChangeA(next: string) {
    setTeamA(next)
    // Drop B if it's no longer valid against the new A (same half or same team).
    if (teamB && (teamB === next || halfOf(teamB) === halfOf(next))) setTeamB('')
  }

  function handleSave() {
    if (!teamA || !teamB) {
      setMsg({ text: 'Pick both finalists.', ok: false })
      return
    }
    startTransition(async () => {
      const res = await saveFinalistPrediction(teamA, teamB)
      setMsg(res.error ? { text: res.error, ok: false } : { text: 'Saved!', ok: true })
    })
  }

  const label = (o: FinalistOption) => `${teamFlag(o.team) ? teamFlag(o.team) + ' ' : ''}${o.team}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={teamA}
        onChange={e => onChangeA(e.target.value)}
        disabled={isPending}
        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
      >
        <option value="">Finalist 1…</option>
        {options.map(o => (
          <option key={o.team} value={o.team}>{label(o)}</option>
        ))}
      </select>
      <span className="text-gray-400 text-sm">&amp;</span>
      <select
        value={teamB}
        onChange={e => setTeamB(e.target.value)}
        disabled={isPending || !teamA}
        title={!teamA ? 'Pick the first finalist first' : undefined}
        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-50"
      >
        <option value="">{teamA ? 'Finalist 2…' : 'Pick finalist 1 first'}</option>
        {optionsB.map(o => (
          <option key={o.team} value={o.team}>{label(o)}</option>
        ))}
      </select>
      <button
        onClick={handleSave}
        disabled={isPending}
        className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-50"
      >
        {isPending ? '…' : 'Save'}
      </button>
      {msg && (
        <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>
      )}
    </div>
  )
}
