'use client'

import { useState, useTransition } from 'react'
import { saveKnockoutTeams } from '@/app/actions'
import type { Match } from '@/lib/types'

export function AdminKnockoutForm({ match }: { match: Match }) {
  const [home, setHome] = useState(match.home_team ?? '')
  const [away, setAway] = useState(match.away_team ?? '')
  const [kickoff, setKickoff] = useState(
    match.kickoff_utc ? new Date(match.kickoff_utc).toISOString().slice(0, 16) : ''
  )
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!home.trim() || !away.trim()) {
      setMsg({ text: 'Enter both team names', ok: false })
      return
    }
    startTransition(async () => {
      const utc = kickoff ? new Date(kickoff + ':00Z').toISOString() : undefined
      const res = await saveKnockoutTeams(match.id, home, away, utc)
      if (res.error) setMsg({ text: res.error, ok: false })
      else setMsg({ text: 'Saved!', ok: true })
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text" value={home} onChange={e => setHome(e.target.value)}
        placeholder={match.home_source ?? 'Home team'}
        disabled={isPending}
        className="border rounded px-2 py-1 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-green-400"
      />
      <span className="text-gray-400 text-sm">vs</span>
      <input
        type="text" value={away} onChange={e => setAway(e.target.value)}
        placeholder={match.away_source ?? 'Away team'}
        disabled={isPending}
        className="border rounded px-2 py-1 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-green-400"
      />
      <input
        type="datetime-local" value={kickoff} onChange={e => setKickoff(e.target.value)}
        disabled={isPending}
        className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        title="Kickoff (UTC)"
      />
      <button
        onClick={handleSave}
        disabled={isPending}
        className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
      >
        {isPending ? '…' : 'Save'}
      </button>
      {msg && (
        <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</span>
      )}
    </div>
  )
}
