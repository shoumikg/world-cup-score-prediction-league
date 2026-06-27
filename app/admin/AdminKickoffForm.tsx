'use client'

import { useState, useTransition } from 'react'
import { saveKnockoutKickoff } from '@/app/actions'
import { utcToISTInput, istInputToUTC } from '@/lib/time'

// The datetime-local value is shown and entered in IST wall-clock time.
export function AdminKickoffForm({ matchId, kickoffUtc }: { matchId: number; kickoffUtc: string }) {
  const [kickoff, setKickoff] = useState(utcToISTInput(kickoffUtc))
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!kickoff) {
      setMsg({ text: 'Pick a time', ok: false })
      return
    }
    startTransition(async () => {
      const res = await saveKnockoutKickoff(matchId, istInputToUTC(kickoff))
      setMsg(res.error ? { text: res.error, ok: false } : { text: 'Saved!', ok: true })
    })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="datetime-local" value={kickoff} onChange={e => setKickoff(e.target.value)}
        disabled={isPending}
        className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        title="Kickoff (IST)"
      />
      <span className="text-xs text-gray-400">IST</span>
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
