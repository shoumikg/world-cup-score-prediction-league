'use client'

import { useState, useTransition } from 'react'
import { saveKnockoutKickoff } from '@/app/actions'

// The datetime-local value is read and written as UTC, matching AdminKnockoutForm.
export function AdminKickoffForm({ matchId, kickoffUtc }: { matchId: number; kickoffUtc: string }) {
  const [kickoff, setKickoff] = useState(new Date(kickoffUtc).toISOString().slice(0, 16))
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!kickoff) {
      setMsg({ text: 'Pick a time', ok: false })
      return
    }
    startTransition(async () => {
      const res = await saveKnockoutKickoff(matchId, new Date(kickoff + ':00Z').toISOString())
      setMsg(res.error ? { text: res.error, ok: false } : { text: 'Saved!', ok: true })
    })
  }

  return (
    <div className="flex items-center gap-2">
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
