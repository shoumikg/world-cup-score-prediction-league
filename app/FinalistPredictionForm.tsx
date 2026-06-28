'use client'

import { useState, useTransition } from 'react'
import { saveFinalistPrediction } from '@/app/actions'
import { teamFlag } from '@/lib/flags'

interface Props {
  options: string[]
  initialA: string
  initialB: string
}

export function FinalistPredictionForm({ options, initialA, initialB }: Props) {
  const [teamA, setTeamA] = useState(initialA)
  const [teamB, setTeamB] = useState(initialB)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Any two round-of-32 teams are allowed; each dropdown just hides the team
  // already chosen in the other so the same team can't be picked twice.
  const optionsA = options.filter(t => t !== teamB)
  const optionsB = options.filter(t => t !== teamA)

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

  const label = (team: string) => `${teamFlag(team) ? teamFlag(team) + ' ' : ''}${team}`

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={teamA}
        onChange={e => setTeamA(e.target.value)}
        disabled={isPending}
        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
      >
        <option value="">Finalist 1…</option>
        {optionsA.map(t => (
          <option key={t} value={t}>{label(t)}</option>
        ))}
      </select>
      <span className="text-gray-400 text-sm">&amp;</span>
      <select
        value={teamB}
        onChange={e => setTeamB(e.target.value)}
        disabled={isPending}
        className="border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
      >
        <option value="">Finalist 2…</option>
        {optionsB.map(t => (
          <option key={t} value={t}>{label(t)}</option>
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
